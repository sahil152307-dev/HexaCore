import asyncio
import unittest
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from botocore.exceptions import ClientError
from fastapi import UploadFile
from starlette.datastructures import Headers
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.exc import SQLAlchemyError

import main
from database import Base


class FakeUpload:
    content_type = "image/jpeg"

    async def read(self, size=-1):
        return b"valid-test-image"


class AnalysisFallbackTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_stopped_custom_model_falls_back_to_general_labels(self):
        class Rekognition:
            def detect_labels(self, **kwargs):
                return {
                    "Labels": [
                        {"Name": "Road", "Confidence": 90, "Parents": []},
                        {"Name": "Pothole", "Confidence": 80, "Parents": []},
                    ]
                }

            def detect_custom_labels(self, **kwargs):
                raise ClientError(
                    {"Error": {"Code": "ResourceNotFoundException", "Message": "unavailable"}},
                    "DetectCustomLabels",
                )

        class Polly:
            def synthesize_speech(self, **kwargs):
                return {"AudioStream": BytesIO(b"audio")}

        class S3:
            def put_object(self, **kwargs):
                return None

        with (
            patch.object(main, "rekognition", Rekognition()),
            patch.object(main, "polly", Polly()),
            patch.object(main, "s3", S3()),
            patch.object(main, "REKOGNITION_CUSTOM_LABELS_MODEL_ARN", "test-model-arn"),
            patch.object(main, "S3_BUCKET_NAME", "test-bucket"),
        ):
            result = asyncio.run(main.analyze_hazard(FakeUpload(), self.db))

        self.assertTrue(result["success"])
        self.assertEqual(result["detected_hazards"], ["Pothole"])
        self.assertEqual(result["risk_score"], 90)
        self.assertTrue(any("Specialist road model is unavailable" in warning for warning in result["warnings"]))

    def test_pedestrian_in_road_image_does_not_block_hazard_analysis(self):
        class Rekognition:
            def detect_labels(self, **kwargs):
                return {
                    "Labels": [
                        {"Name": "Road", "Confidence": 95, "Parents": []},
                        {"Name": "Person", "Confidence": 92, "Parents": []},
                        {"Name": "Pothole", "Confidence": 80, "Parents": []},
                    ]
                }

        with (
            patch.object(main, "rekognition", Rekognition()),
            patch.object(main, "S3_BUCKET_NAME", None),
        ):
            result = asyncio.run(main.analyze_hazard(FakeUpload(), self.db))

        self.assertTrue(result["success"])
        self.assertEqual(result["detected_hazards"], ["Pothole"])
        self.assertEqual(result["risk_score"], 90)

    def test_person_only_image_stays_invalid_without_road_or_hazard(self):
        class Rekognition:
            def detect_labels(self, **kwargs):
                return {
                    "Labels": [{"Name": "Person", "Confidence": 92, "Parents": []}]
                }

        with patch.object(main, "rekognition", Rekognition()):
            result = asyncio.run(main.analyze_hazard(FakeUpload(), self.db))

        self.assertFalse(result["success"])
        self.assertEqual(result["error_type"], "INVALID_IMAGE")
        self.assertIn("Human detected", result["message"])
        self.assertIn("background of a road image are allowed", result["message"])

    def test_unrelated_non_human_image_gets_general_invalid_message(self):
        class Rekognition:
            def detect_labels(self, **kwargs):
                return {
                    "Labels": [{"Name": "Dog", "Confidence": 92, "Parents": []}]
                }

        with patch.object(main, "rekognition", Rekognition()):
            result = asyncio.run(main.analyze_hazard(FakeUpload(), self.db))

        self.assertFalse(result["success"])
        self.assertEqual(result["error_type"], "INVALID_IMAGE")
        self.assertIn("No road surface or hazard detected", result["message"])
        self.assertNotIn("Human detected", result["message"])

    def test_vehicle_without_confirmed_road_or_hazard_is_uncertain_not_invalid(self):
        class Rekognition:
            def detect_labels(self, **kwargs):
                return {
                    "Labels": [
                        {"Name": "Car", "Confidence": 95, "Parents": []},
                        {"Name": "Person", "Confidence": 90, "Parents": []},
                    ]
                }

        with patch.object(main, "rekognition", Rekognition()):
            result = asyncio.run(main.analyze_hazard(FakeUpload(), self.db))

        self.assertTrue(result["success"])
        self.assertEqual(result["assessment_status"], "UNCERTAIN")
        self.assertIsNone(result["risk_score"])
        self.assertIn("presence does not block analysis", result["alert_message"])
        self.assertEqual(result["all_labels"], ["Car", "Person"])

    def test_road_with_only_generic_water_label_returns_uncertain_not_low_risk(self):
        class Rekognition:
            def detect_labels(self, **kwargs):
                return {
                    "Labels": [
                        {"Name": "Road", "Confidence": 95, "Parents": []},
                        {"Name": "Water", "Confidence": 99, "Parents": []},
                    ]
                }

        with (
            patch.object(main, "rekognition", Rekognition()),
            patch.object(main, "S3_BUCKET_NAME", "test-bucket"),
            patch.object(main, "polly") as polly,
            patch.object(main, "s3") as s3,
            patch.object(main.SQLAlchemyLogs, "add_log") as add_log,
        ):
            result = asyncio.run(main.analyze_hazard(FakeUpload(), self.db))

        self.assertTrue(result["success"])
        self.assertEqual(result["assessment_status"], "UNCERTAIN")
        self.assertIsNone(result["risk_score"])
        self.assertEqual(result["severity"], "N/A")
        self.assertIn("inspect the image manually", result["alert_message"])
        self.assertIsNone(result["audio_url"])
        polly.synthesize_speech.assert_not_called()
        s3.put_object.assert_not_called()
        add_log.assert_not_called()

    def test_audio_failure_does_not_discard_hazard_result(self):
        class Rekognition:
            def detect_labels(self, **kwargs):
                return {
                    "Labels": [
                        {"Name": "Road", "Confidence": 90, "Parents": []},
                        {"Name": "Crack", "Confidence": 80, "Parents": []},
                    ]
                }

        class Polly:
            def synthesize_speech(self, **kwargs):
                raise ClientError(
                    {"Error": {"Code": "ServiceUnavailableException", "Message": "unavailable"}},
                    "SynthesizeSpeech",
                )

        with (
            patch.object(main, "rekognition", Rekognition()),
            patch.object(main, "polly", Polly()),
            patch.object(main, "S3_BUCKET_NAME", "test-bucket"),
        ):
            result = asyncio.run(main.analyze_hazard(FakeUpload(), self.db))

        self.assertTrue(result["success"])
        self.assertEqual(result["detected_hazards"], ["Crack"])
        self.assertIsNone(result["audio_url"])
        self.assertTrue(any("Audio alert is unavailable" in warning for warning in result["warnings"]))

    def test_rejects_unsupported_file_type_before_aws_calls(self):
        upload = FakeUpload()
        upload.content_type = "image/webp"

        with self.assertRaises(main.HTTPException) as raised:
            asyncio.run(main.analyze_hazard(upload, self.db))

        self.assertEqual(raised.exception.status_code, 415)

    def test_rejects_empty_image_before_aws_calls(self):
        class EmptyUpload(FakeUpload):
            async def read(self, size=-1):
                return b""

        with self.assertRaises(main.HTTPException) as raised:
            asyncio.run(main.analyze_hazard(EmptyUpload(), self.db))

        self.assertEqual(raised.exception.status_code, 400)

    def test_rejects_oversized_image_before_aws_calls(self):
        class LargeUpload(FakeUpload):
            async def read(self, size=-1):
                return b"x" * size

        with self.assertRaises(main.HTTPException) as raised:
            asyncio.run(main.analyze_hazard(LargeUpload(), self.db))

        self.assertEqual(raised.exception.status_code, 413)

    def test_rekognition_outage_returns_retryable_service_error(self):
        class Rekognition:
            def detect_labels(self, **kwargs):
                raise ClientError(
                    {"Error": {"Code": "ServiceUnavailableException", "Message": "unavailable"}},
                    "DetectLabels",
                )

        with patch.object(main, "rekognition", Rekognition()):
            with self.assertRaises(main.HTTPException) as raised:
                asyncio.run(main.analyze_hazard(FakeUpload(), self.db))

        self.assertEqual(raised.exception.status_code, 503)

    def test_database_failure_keeps_analysis_result(self):
        class Rekognition:
            def detect_labels(self, **kwargs):
                return {
                    "Labels": [
                        {"Name": "Road", "Confidence": 90, "Parents": []},
                        {"Name": "Crack", "Confidence": 80, "Parents": []},
                    ]
                }

        class Polly:
            def synthesize_speech(self, **kwargs):
                raise ClientError(
                    {"Error": {"Code": "ServiceUnavailableException", "Message": "unavailable"}},
                    "SynthesizeSpeech",
                )

        with (
            patch.object(main, "rekognition", Rekognition()),
            patch.object(main, "polly", Polly()),
            patch.object(main, "S3_BUCKET_NAME", "test-bucket"),
            patch.object(main, "SQLAlchemyLogs", side_effect=SQLAlchemyError("database unavailable")),
        ):
            result = asyncio.run(main.analyze_hazard(FakeUpload(), self.db))

        self.assertTrue(result["success"])
        self.assertEqual(result["detected_hazards"], ["Crack"])
        self.assertTrue(any("could not be saved" in warning for warning in result["warnings"]))

    def test_facilities_report_saves_required_fields_and_photo(self):
        image_bytes = b"\x89PNG\r\n\x1a\nvalid-png"
        image = UploadFile(
            filename="classroom.png",
            file=BytesIO(image_bytes),
            headers=Headers({"content-type": "image/png"}),
        )
        with TemporaryDirectory() as temp_dir:
            with patch.object(main, "UPLOAD_DIRECTORY", Path(temp_dir)):
                result = asyncio.run(
                    main.report_campus_hazard(
                        location_name=None,
                        hazard_type=None,
                        severity=None,
                        building_name="Rajgad",
                        department_name="Electrical",
                        room_name="Lab 3",
                        issue_type="AC not cooling",
                        description="AC has stopped cooling during class.",
                        assigned_dept="Campus facilities",
                        priority="HIGH",
                        image=image,
                        db=self.db,
                    )
                )

                report = result["data"]
                self.assertEqual(report.location_name, "Rajgad")
                self.assertEqual(report.department_name, "Electrical")
                self.assertEqual(report.room_name, "Lab 3")
                self.assertEqual(report.hazard_type, "AC not cooling")
                self.assertEqual(report.assigned_dept, "Campus facilities")
                self.assertEqual(report.severity, "HIGH")
                self.assertTrue((Path(temp_dir) / report.image_url.rsplit("/", 1)[-1]).is_file())

    def test_facilities_report_rejects_non_image_photo(self):
        image = UploadFile(
            filename="not-an-image.png",
            file=BytesIO(b"not png bytes"),
            headers=Headers({"content-type": "image/png"}),
        )

        with self.assertRaises(main.HTTPException) as raised:
            asyncio.run(
                main.report_campus_hazard(
                    location_name=None,
                    hazard_type=None,
                    severity=None,
                    building_name="Pratapgad",
                    department_name="Computer Science",
                    room_name="101",
                    issue_type="Projector fault",
                    description="Projector does not display anything.",
                    assigned_dept="",
                    priority="MEDIUM",
                    image=image,
                    db=self.db,
                )
            )

        self.assertEqual(raised.exception.status_code, 415)

    def test_facilities_report_requires_all_report_details_and_photo(self):
        required_values = {
            "location_name": None,
            "hazard_type": None,
            "severity": None,
            "building_name": "Pratapgad",
            "department_name": "Computer Science",
            "room_name": "101",
            "issue_type": "Projector fault",
            "description": "Projector does not display anything.",
            "assigned_dept": "",
            "priority": "MEDIUM",
            "db": self.db,
        }

        with self.assertRaises(main.HTTPException) as missing_photo:
            asyncio.run(main.report_campus_hazard(**required_values, image=None))
        self.assertEqual(missing_photo.exception.status_code, 422)
        self.assertIn("photo", missing_photo.exception.detail.lower())

        with self.assertRaises(main.HTTPException) as missing_department:
            asyncio.run(
                main.report_campus_hazard(
                    **{**required_values, "department_name": ""},
                    image=UploadFile(
                        filename="classroom.png",
                        file=BytesIO(b"\x89PNG\r\n\x1a\nvalid-png"),
                        headers=Headers({"content-type": "image/png"}),
                    ),
                )
            )
        self.assertEqual(missing_department.exception.status_code, 422)
        self.assertIn("department/course", missing_department.exception.detail)


if __name__ == "__main__":
    unittest.main()
