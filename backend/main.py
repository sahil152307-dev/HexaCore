import os
import uuid
import logging
import base64
import hashlib
import hmac
import secrets
import time
from collections import deque
from pathlib import Path
from abc import ABC, abstractmethod

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query, Request, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from dotenv import load_dotenv

load_dotenv()

from database import get_db, HazardLog
from database import CampusHazardLog
from hazard_detection import classify_labels, normalize_label

logger = logging.getLogger(__name__)
MAX_IMAGE_BYTES = 4 * 1024 * 1024
SUPPORTED_IMAGE_TYPES = {"image/jpeg", "image/png"}
ADMIN_SESSION_COOKIE = "alertbuzzer_admin"
ADMIN_SESSION_MAX_AGE = 8 * 60 * 60
ADMIN_LOGIN_WINDOW_SECONDS = 15 * 60
ADMIN_LOGIN_MAX_ATTEMPTS = 5
ADMIN_LOGIN_ATTEMPTS: dict[str, deque[float]] = {}
ADMIN_REPORT_STATUSES = {"Approved", "Rejected"}
HUMAN_IMAGE_LABELS = {
    "boy",
    "child",
    "face",
    "girl",
    "human",
    "man",
    "people",
    "person",
    "portrait",
    "selfie",
    "woman",
}
VEHICLE_IMAGE_LABELS = {
    "automobile",
    "bus",
    "car",
    "motor vehicle",
    "motorcycle",
    "taxi",
    "truck",
    "van",
    "vehicle",
}


class AdminLoginRequest(BaseModel):
    password: str = Field(min_length=1, max_length=256)


class AdminReportUpdate(BaseModel):
    status: str | None = Field(default=None, max_length=20)
    assigned_dept: str | None = Field(default=None, max_length=120)
    rejection_reason: str | None = Field(default=None, max_length=500)


class Logs(ABC):
    @abstractmethod
    def add_log(self, severity, risk_score, hazards_detected, audio_url=None):
        """Persist a hazard event and return the saved record."""

    @abstractmethod
    def get_recent(self, limit=20):
        """Return the most recent stored hazard events."""


class SQLAlchemyLogs(Logs):
    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def _normalize_hazards(hazards_detected):
        if hazards_detected is None:
            return ""
        if isinstance(hazards_detected, (list, tuple, set)):
            items = [str(item).strip() for item in hazards_detected if str(item).strip()]
            return ", ".join(items)
        return str(hazards_detected).strip()

    @staticmethod
    def _serialize_log(log):
        timestamp = getattr(log, "timestamp", None)
        return {
            "id": getattr(log, "id", None),
            "severity": getattr(log, "severity", None),
            "risk_score": getattr(log, "risk_score", None),
            "hazards_detected": [
                item.strip() for item in str(getattr(log, "hazards_detected", "")).split(",") if item.strip()
            ],
            "audio_url": getattr(log, "audio_url", None),
            "timestamp": timestamp.isoformat() if timestamp else None,
        }

    def add_log(self, severity, risk_score, hazards_detected, audio_url=None):
        log_entry = HazardLog(
            severity=severity,
            risk_score=risk_score,
            hazards_detected=self._normalize_hazards(hazards_detected),
            audio_url=audio_url,
        )
        self.db.add(log_entry)
        self.db.commit()
        self.db.refresh(log_entry)
        return self._serialize_log(log_entry)

    def get_recent(self, limit=20):
        logs = self.db.query(HazardLog).order_by(HazardLog.timestamp.desc()).limit(limit).all()
        return [self._serialize_log(log) for log in logs]


app = FastAPI(title="AlertBuzzer AI Backend (S3 Enabled)")
UPLOAD_DIRECTORY = Path(
    os.getenv("UPLOAD_DIRECTORY", str(Path(__file__).resolve().parent / "uploads"))
)
UPLOAD_DIRECTORY.mkdir(exist_ok=True)
cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins (Vercel, Localhost, etc.)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _admin_session_token(secret: str, expires_at: int) -> str:
    payload = f"{expires_at}:{secrets.token_urlsafe(24)}"
    encoded_payload = base64.urlsafe_b64encode(payload.encode("utf-8")).decode("ascii").rstrip("=")
    signature = hmac.new(secret.encode("utf-8"), encoded_payload.encode("ascii"), hashlib.sha256).hexdigest()
    return f"{encoded_payload}.{signature}"


def _admin_cookie_settings() -> dict[str, bool | str]:
    secure = os.getenv("ADMIN_COOKIE_SECURE", "false").casefold() == "true"
    return {
        "secure": secure,
        "samesite": "none" if secure else "strict",
    }


def _is_valid_admin_session(token: str, secret: str) -> bool:
    try:
        encoded_payload, signature = token.split(".", 1)
        expected_signature = hmac.new(
            secret.encode("utf-8"),
            encoded_payload.encode("ascii"),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(signature, expected_signature):
            return False
        padded_payload = encoded_payload + "=" * (-len(encoded_payload) % 4)
        payload = base64.urlsafe_b64decode(padded_payload).decode("utf-8")
        expires_at_text, nonce = payload.split(":", 1)
        return bool(nonce) and int(expires_at_text) > int(time.time())
    except (ValueError, UnicodeDecodeError):
        return False


def require_admin(request: Request) -> None:
    session_secret = os.getenv("ADMIN_SESSION_SECRET")
    if not session_secret:
        raise HTTPException(status_code=503, detail="Admin access is not configured.")
    origin = request.headers.get("origin")
    if origin and origin not in cors_origins:
        raise HTTPException(status_code=403, detail="This origin is not allowed to access admin actions.")
    token = request.cookies.get(ADMIN_SESSION_COOKIE, "")
    if not token or not _is_valid_admin_session(token, session_secret):
        raise HTTPException(status_code=401, detail="Admin sign-in required.")


@app.post("/api/admin/login")
def admin_login(
    credentials: AdminLoginRequest,
    request: Request,
    response: Response,
):
    admin_password = os.getenv("ADMIN_PASSWORD")
    session_secret = os.getenv("ADMIN_SESSION_SECRET")
    if not admin_password or not session_secret:
        raise HTTPException(status_code=503, detail="Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET in backend configuration.")

    client_ip = request.client.host if request.client else "unknown"
    now = time.time()
    attempts = ADMIN_LOGIN_ATTEMPTS.setdefault(client_ip, deque())
    while attempts and now - attempts[0] > ADMIN_LOGIN_WINDOW_SECONDS:
        attempts.popleft()
    if len(attempts) >= ADMIN_LOGIN_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many sign-in attempts. Try again in 15 minutes.")

    if not hmac.compare_digest(credentials.password, admin_password):
        attempts.append(now)
        raise HTTPException(status_code=401, detail="Invalid admin password.")

    ADMIN_LOGIN_ATTEMPTS.pop(client_ip, None)
    token = _admin_session_token(session_secret, int(now) + ADMIN_SESSION_MAX_AGE)
    response.set_cookie(
        key=ADMIN_SESSION_COOKIE,
        value=token,
        max_age=ADMIN_SESSION_MAX_AGE,
        httponly=True,
        **_admin_cookie_settings(),
        path="/api/admin",
    )
    return {"success": True, "expires_in": ADMIN_SESSION_MAX_AGE}


@app.post("/api/admin/logout")
def admin_logout(response: Response):
    response.delete_cookie(
        key=ADMIN_SESSION_COOKIE,
        httponly=True,
        **_admin_cookie_settings(),
        path="/api/admin",
    )
    return {"success": True}


@app.get("/api/admin/session")
def admin_session(_: None = Depends(require_admin)):
    return {"authenticated": True}

# AWS Credentials setup
AWS_REGION = os.getenv('AWS_REGION', 'us-east-1')
S3_BUCKET_NAME = os.getenv('AWS_S3_BUCKET_NAME')
REKOGNITION_CUSTOM_LABELS_MODEL_ARN = os.getenv('REKOGNITION_CUSTOM_LABELS_MODEL_ARN')
REKOGNITION_CUSTOM_LABELS_MIN_CONFIDENCE = float(
    os.getenv('REKOGNITION_CUSTOM_LABELS_MIN_CONFIDENCE', '50')
)
if not 0 <= REKOGNITION_CUSTOM_LABELS_MIN_CONFIDENCE <= 100:
    raise ValueError('REKOGNITION_CUSTOM_LABELS_MIN_CONFIDENCE must be between 0 and 100')

aws_config = Config(
    connect_timeout=3,
    read_timeout=10,
    retries={"max_attempts": 2, "mode": "standard"},
)
rekognition = boto3.client('rekognition', region_name=AWS_REGION, config=aws_config)
polly = boto3.client('polly', region_name=AWS_REGION, config=aws_config)
s3 = boto3.client('s3', region_name=AWS_REGION, config=aws_config)

# Healthcheck Route (Fixes 404 & Simulation Fallback)
@app.get("/")
def health_check():
    return {
        "status": "online",
        "system": "AlertBuzzer AI S3-Accelerated Pipeline",
        "s3_bucket": S3_BUCKET_NAME
    }


@app.post("/api/analyze-hazard")
async def analyze_hazard(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if file.content_type not in SUPPORTED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Upload a JPEG or PNG image.")

    image_bytes = await file.read(MAX_IMAGE_BYTES + 1)
    if not image_bytes:
        raise HTTPException(status_code=400, detail="The uploaded image is empty.")
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image must be 4 MB or smaller.")

    try:
        rekog_response = rekognition.detect_labels(
            Image={'Bytes': image_bytes},
            MaxLabels=20,
            MinConfidence=50.0
        )
    except (BotoCoreError, ClientError) as exc:
        logger.warning("Rekognition label detection failed: %s", type(exc).__name__)
        raise HTTPException(
            status_code=503,
            detail="Image analysis is temporarily unavailable. Check AWS connectivity and try again.",
        ) from exc

    custom_labels = []
    warnings = []
    if REKOGNITION_CUSTOM_LABELS_MODEL_ARN:
        try:
            custom_response = rekognition.detect_custom_labels(
                Image={'Bytes': image_bytes},
                ProjectVersionArn=REKOGNITION_CUSTOM_LABELS_MODEL_ARN,
                MinConfidence=REKOGNITION_CUSTOM_LABELS_MIN_CONFIDENCE,
            )
            custom_labels = custom_response.get('CustomLabels', [])
        except (BotoCoreError, ClientError) as exc:
            logger.warning(
                "Custom Labels inference failed (%s); continuing with general labels",
                type(exc).__name__,
            )
            warnings.append(
                "Specialist road model is unavailable; this result uses general image labels."
            )

    analysis = classify_labels(
        rekog_response.get('Labels', []),
        custom_labels=custom_labels,
        custom_min_confidence=REKOGNITION_CUSTOM_LABELS_MIN_CONFIDENCE,
    )
    labels_detected = analysis["all_labels"]

    has_road_context = analysis["has_road_context"]
    detected_hazards = analysis["detected_hazards"]
    vehicle_detected = any(
        normalize_label(label) in VEHICLE_IMAGE_LABELS
        for label in labels_detected
    )

    if not has_road_context and not detected_hazards and not vehicle_detected:
        human_detected = any(
            normalize_label(label) in HUMAN_IMAGE_LABELS
            for label in labels_detected
        )
        return {
            "success": False,
            "error_type": "INVALID_IMAGE",
            "message": (
                "Invalid Image: Human detected. Please upload road, hazard, or dashcam imagery only. "
                "People in the background of a road image are allowed."
                if human_detected
                else "Invalid Image: No road surface or hazard detected."
            ),
            "all_labels": labels_detected,
            "severity": "LOW",
            "risk_score": 0,
            "detected_hazards": [],
            "audio_url": None
        }

    if not detected_hazards:
        return {
            "success": True,
            "assessment_status": "UNCERTAIN",
            "all_labels": labels_detected,
            "severity": "N/A",
            "risk_score": None,
            "detected_hazards": [],
            "alert_message": (
                (
                    "A vehicle was detected, but the road surface and hazard were not confirmed. "
                    "Vehicle or person presence does not block analysis; please inspect manually."
                    if vehicle_detected
                    else "No supported hazard label was confirmed. General-purpose image "
                    "labels cannot rule out road damage; please inspect the image manually."
                )
            ),
            "audio_url": None,
            "warnings": warnings,
        }

    risk_score = analysis["risk_score"]
    severity = "HIGH" if risk_score >= 75 else ("MEDIUM" if risk_score >= 45 else "LOW")

    alert_text = (
        f"Warning! Road hazard detected. Issues found: {', '.join(detected_hazards)}. "
        f"Hazard severity score is {risk_score} out of 100."
    )

    s3_audio_url = None
    if not S3_BUCKET_NAME:
        warnings.append("Audio storage is not configured; the hazard result is available without audio.")
    else:
        try:
            polly_response = polly.synthesize_speech(
                Text=alert_text,
                OutputFormat='mp3',
                VoiceId='Raveena',
                Engine='standard'
            )
            audio_stream = polly_response.get("AudioStream")
            if audio_stream is None:
                raise RuntimeError("Polly returned no audio stream")

            audio_filename = f"alerts/alert_{uuid.uuid4().hex[:8]}.mp3"
            s3.put_object(
                Bucket=S3_BUCKET_NAME,
                Key=audio_filename,
                Body=audio_stream.read(),
                ContentType='audio/mpeg'
            )
            s3_audio_url = f"https://{S3_BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com/{audio_filename}"
        except (BotoCoreError, ClientError, RuntimeError, OSError) as exc:
            logger.warning("Audio generation or storage failed: %s", type(exc).__name__)
            warnings.append("Audio alert is unavailable; the hazard result is still ready.")

    try:
        log_service = SQLAlchemyLogs(db)
        log_service.add_log(
            severity=severity,
            risk_score=risk_score,
            hazards_detected=detected_hazards,
            audio_url=s3_audio_url,
        )
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Could not persist hazard analysis history")
        warnings.append("This result could not be saved to analysis history.")

    return {
        "success": True,
        "assessment_status": "HAZARD_DETECTED",
        "all_labels": labels_detected,
        "severity": severity,
        "risk_score": risk_score,
        "detected_hazards": detected_hazards,
        "alert_message": alert_text,
        "audio_url": s3_audio_url,
        "warnings": warnings,
    }


@app.get("/api/hazard-history")
def get_hazard_history(db: Session = Depends(get_db)):
    logs = db.query(HazardLog).order_by(HazardLog.id.desc()).limit(20).all()
    return logs


@app.post("/api/report-campus-hazard")
async def report_campus_hazard(
    location_name: str | None = Query(default=None),
    hazard_type: str | None = Query(default=None),
    severity: str | None = Query(default=None),
    building_name: str = Form(default=""),
    department_name: str = Form(default=""),
    room_name: str = Form(default=""),
    issue_type: str = Form(default=""),
    description: str = Form(default=""),
    assigned_dept: str = Form(default=""),
    priority: str = Form(default="MEDIUM"),
    image: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
):
    building_name = (building_name or location_name or "").strip()
    issue_type = (issue_type or hazard_type or "").strip()
    priority = (priority or severity or "MEDIUM").strip().upper()
    department_name = department_name.strip()
    room_name = room_name.strip()
    description = description.strip()
    assigned_dept = assigned_dept.strip() or "Unassigned"

    if not building_name or not department_name or not room_name or not issue_type or not description:
        raise HTTPException(
            status_code=422,
            detail="Building, department/course, room/location, issue, and issue details are required.",
        )
    if len(building_name) > 120 or len(department_name) > 120 or len(room_name) > 80:
        raise HTTPException(status_code=422, detail="Location fields exceed the allowed length.")
    if len(issue_type) > 120 or len(assigned_dept) > 120 or len(description) > 1000:
        raise HTTPException(status_code=422, detail="Issue details exceed the allowed length.")
    if priority not in {"LOW", "MEDIUM", "HIGH"}:
        raise HTTPException(status_code=422, detail="Priority must be Low, Medium, or High.")

    image_bytes = None
    image_extension = None
    if image is None or not image.filename:
        raise HTTPException(status_code=422, detail="A photo of the reported issue is required.")
    if image.content_type not in SUPPORTED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Attach a JPEG or PNG photo.")
    image_bytes = await image.read(MAX_IMAGE_BYTES + 1)
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Photo must be 4 MB or smaller.")
    if not image_bytes:
        raise HTTPException(status_code=400, detail="The attached photo is empty.")
    if image.content_type == "image/jpeg" and image_bytes[:3] == b"\xff\xd8\xff":
        image_extension = ".jpg"
    elif image.content_type == "image/png" and image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        image_extension = ".png"
    else:
        raise HTTPException(status_code=415, detail="The photo content does not match its image type.")

    saved_image_path = None
    image_url = None
    filename = f"{uuid.uuid4().hex}{image_extension}"
    saved_image_path = UPLOAD_DIRECTORY / filename
    image_url = f"/uploads/{filename}"

    new_report = CampusHazardLog(
        location_name=building_name,
        department_name=department_name or None,
        room_name=room_name or None,
        hazard_type=issue_type,
        description=description or None,
        severity=priority,
        assigned_dept=assigned_dept,
        status="Pending",
        image_url=image_url,
    )

    try:
        if saved_image_path is not None and image_bytes is not None:
            saved_image_path.write_bytes(image_bytes)
        db.add(new_report)
        db.commit()
        db.refresh(new_report)
    except (OSError, SQLAlchemyError) as exc:
        db.rollback()
        if saved_image_path is not None:
            saved_image_path.unlink(missing_ok=True)
        logger.exception("Could not save campus facilities report")
        raise HTTPException(status_code=500, detail="Could not save the facilities report.") from exc

    return {
        "success": True,
        "message": "Facilities issue report saved.",
        "data": new_report
    }

@app.get("/api/campus-hazards")
def get_campus_hazards(db: Session = Depends(get_db)):
    return db.query(CampusHazardLog).order_by(CampusHazardLog.id.desc()).all()


@app.get("/api/admin/campus-hazards")
def get_admin_campus_hazards(
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return (
        db.query(CampusHazardLog)
        .filter(CampusHazardLog.status == "Pending")
        .order_by(CampusHazardLog.id.desc())
        .all()
    )


@app.patch("/api/admin/campus-hazards/{report_id}")
def update_campus_hazard_report(
    report_id: int,
    update: AdminReportUpdate,
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if update.status not in ADMIN_REPORT_STATUSES:
        raise HTTPException(status_code=422, detail="Choose Approved or Rejected for the report decision.")
    assigned_dept = (update.assigned_dept or "").strip()
    if not assigned_dept:
        raise HTTPException(status_code=422, detail="Responsible team is required.")
    rejection_reason = (update.rejection_reason or "").strip()
    if update.status == "Rejected" and not rejection_reason:
        raise HTTPException(status_code=422, detail="A reason is required when rejecting a report.")

    report = db.query(CampusHazardLog).filter(CampusHazardLog.id == report_id).first()
    if report is None:
        raise HTTPException(status_code=404, detail="Campus report not found.")
    if report.status != "Pending":
        raise HTTPException(status_code=409, detail="This report has already been reviewed.")

    report.status = update.status
    report.assigned_dept = assigned_dept
    report.rejection_reason = rejection_reason if update.status == "Rejected" else None

    try:
        db.commit()
        db.refresh(report)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Could not update campus facilities report %s", report_id)
        raise HTTPException(status_code=500, detail="Could not update the report.") from exc
    return {"success": True, "data": report}


@app.get("/api/admin/report-photos/{filename}")
def get_admin_report_photo(
    filename: str,
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if Path(filename).name != filename or Path(filename).suffix.lower() not in {".jpg", ".png"}:
        raise HTTPException(status_code=404, detail="Report photo not found.")
    report = db.query(CampusHazardLog).filter(
        CampusHazardLog.image_url == f"/uploads/{filename}"
    ).first()
    if report is None:
        raise HTTPException(status_code=404, detail="Report photo not found.")
    photo_path = (UPLOAD_DIRECTORY / filename).resolve()
    if photo_path.parent != UPLOAD_DIRECTORY.resolve() or not photo_path.is_file():
        raise HTTPException(status_code=404, detail="Report photo not found.")
    return FileResponse(photo_path)
