import unittest

from hazard_detection import classify_labels


class ClassifyLabelsTests(unittest.TestCase):
    def test_recognizes_case_and_punctuation_variations(self):
        result = classify_labels([
            {"Name": "POTHOLES", "Confidence": 82.5, "Parents": []},
            {"Name": "Cracked-Pavement", "Confidence": 70, "Parents": []},
        ])

        self.assertEqual(result["detected_hazards"], ["Pothole", "Crack"])
        self.assertEqual(result["risk_score"], 90)

    def test_uses_rekognition_parent_for_road_context(self):
        result = classify_labels([
            {
                "Name": "Standing Water",
                "Confidence": 80,
                "Parents": [{"Name": "Road"}],
            },
        ])

        self.assertTrue(result["has_road_context"])
        self.assertEqual(result["detected_hazards"], ["Water"])

    def test_does_not_treat_generic_water_label_as_a_road_hazard(self):
        result = classify_labels([
            {"Name": "Road", "Confidence": 90, "Parents": []},
            {"Name": "Water", "Confidence": 99, "Parents": []},
        ])

        self.assertTrue(result["has_road_context"])
        self.assertEqual(result["detected_hazards"], [])
        self.assertEqual(result["risk_score"], 10)

    def test_requires_stronger_confidence_for_generic_damage(self):
        result = classify_labels([
            {"Name": "Road", "Confidence": 90, "Parents": []},
            {"Name": "Damaged", "Confidence": 70, "Parents": []},
        ])

        self.assertTrue(result["has_road_context"])
        self.assertEqual(result["detected_hazards"], [])
        self.assertEqual(result["risk_score"], 10)

    def test_ignores_low_confidence_generic_water(self):
        result = classify_labels([
            {"Name": "Road", "Confidence": 92, "Parents": []},
            {"Name": "Water", "Confidence": 68, "Parents": []},
        ])

        self.assertEqual(result["detected_hazards"], [])

    def test_preserves_raw_labels_for_the_response(self):
        result = classify_labels([
            {"Name": "Road Surface", "Confidence": 91, "Parents": []},
        ])

        self.assertEqual(result["all_labels"], ["Road Surface"])
        self.assertTrue(result["has_road_context"])

    def test_custom_model_detects_hazard_with_specialist_threshold(self):
        result = classify_labels(
            [{"Name": "Road", "Confidence": 82, "Parents": []}],
            custom_labels=[{"Name": "Pothole", "Confidence": 63}],
            custom_min_confidence=60,
        )

        self.assertEqual(result["detected_hazards"], ["Pothole"])
        self.assertEqual(result["risk_score"], 90)
        self.assertEqual(result["all_labels"], ["Road", "Pothole"])

    def test_custom_model_below_threshold_does_not_create_hazard(self):
        result = classify_labels(
            [{"Name": "Road", "Confidence": 82, "Parents": []}],
            custom_labels=[{"Name": "Pothole", "Confidence": 49}],
            custom_min_confidence=50,
        )

        self.assertEqual(result["detected_hazards"], [])
        self.assertEqual(result["risk_score"], 10)
        self.assertEqual(result["all_labels"], ["Road"])

    def test_custom_water_still_requires_road_context(self):
        result = classify_labels(
            [],
            custom_labels=[{"Name": "Water", "Confidence": 92}],
            custom_min_confidence=50,
        )

        self.assertEqual(result["detected_hazards"], [])
        self.assertEqual(result["risk_score"], 0)


if __name__ == "__main__":
    unittest.main()
