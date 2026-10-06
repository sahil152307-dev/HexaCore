import re
from math import isfinite


ROAD_CONTEXT_LABELS = {
    "asphalt",
    "carriageway",
    "highway",
    "intersection",
    "lane",
    "motorway",
    "pavement",
    "road",
    "road surface",
    "roadway",
    "street",
    "tarmac",
    "transportation",
}

HAZARD_RULES = (
    {
        "name": "Pothole",
        "score": 90,
        "min_confidence": 60,
        "requires_road_context": False,
        "labels": {"pothole", "potholes", "road hole", "pavement hole"},
    },
    {
        "name": "Crack",
        "score": 70,
        "min_confidence": 65,
        "requires_road_context": False,
        "labels": {
            "crack",
            "cracks",
            "cracked pavement",
            "fissure",
            "fissures",
            "pavement crack",
            "pavement cracks",
            "road crack",
            "road cracks",
            "road surface crack",
        },
    },
    {
        "name": "Accident",
        "score": 95,
        "min_confidence": 65,
        "requires_road_context": False,
        "labels": {
            "accident",
            "car crash",
            "collision",
            "crash",
            "traffic accident",
            "vehicle collision",
        },
    },
    {
        "name": "Traffic Jam",
        "score": 80,
        "min_confidence": 65,
        "requires_road_context": False,
        "labels": {"congestion", "traffic congestion", "traffic jam", "traffic queue"},
    },
    {
        "name": "Water",
        "score": 60,
        "min_confidence": 75,
        "requires_road_context": True,
        "labels": {"standing water", "water logged", "waterlogging"},
    },
    {
        "name": "Flood",
        "score": 85,
        "min_confidence": 65,
        "requires_road_context": False,
        "labels": {"flood", "flooded road", "flooding", "flash flood"},
    },
    {
        "name": "Damaged",
        "score": 80,
        "min_confidence": 75,
        "requires_road_context": True,
        "labels": {
            "damaged",
            "damaged pavement",
            "damaged road",
            "road damage",
            "road surface damage",
            "surface damage",
        },
    },
)


def normalize_label(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", name.casefold()).strip()


def classify_labels(
    labels: list[dict],
    custom_labels: list[dict] | None = None,
    custom_min_confidence: float = 50,
) -> dict:
    """Classify Rekognition labels while requiring stronger evidence for broad terms."""
    names = []
    confidence_by_label = {}
    parent_confidence_by_label = {}
    for label in labels:
        if not isinstance(label, dict):
            continue
        name = label.get("Name")
        if not isinstance(name, str) or not name.strip():
            continue
        names.append(name)
        normalized_name = normalize_label(name)
        try:
            confidence = float(label.get("Confidence", 0))
        except (TypeError, ValueError):
            confidence = 0
        if not isfinite(confidence):
            confidence = 0
        confidence_by_label[normalized_name] = max(
            confidence_by_label.get(normalized_name, 0),
            confidence,
        )

        parents = label.get("Parents", [])
        if isinstance(parents, list):
            for parent in parents:
                if (
                    not isinstance(parent, dict)
                    or not isinstance(parent.get("Name"), str)
                    or not parent["Name"].strip()
                ):
                    continue
                parent_name = normalize_label(parent["Name"])
                parent_confidence_by_label[parent_name] = max(
                    parent_confidence_by_label.get(parent_name, 0),
                    confidence,
                )

    custom_confidence_by_label = {}
    for label in custom_labels or []:
        if not isinstance(label, dict):
            continue
        name = label.get("Name")
        if not isinstance(name, str) or not name.strip():
            continue
        try:
            confidence = float(label.get("Confidence", 0))
        except (TypeError, ValueError):
            confidence = 0
        if not isfinite(confidence):
            confidence = 0
        normalized_name = normalize_label(name)
        custom_confidence_by_label[normalized_name] = max(
            custom_confidence_by_label.get(normalized_name, 0),
            confidence,
        )
        if confidence >= custom_min_confidence and name not in names:
            names.append(name)

    normalized_context_confidence = confidence_by_label | parent_confidence_by_label

    has_road_context = any(
        confidence >= 60
        for name, confidence in normalized_context_confidence.items()
        if name in ROAD_CONTEXT_LABELS
    )
    detected_hazards = []

    for rule in HAZARD_RULES:
        if rule["requires_road_context"] and not has_road_context:
            continue
        if any(
            confidence_by_label.get(normalize_label(alias), 0) >= rule["min_confidence"]
            or custom_confidence_by_label.get(normalize_label(alias), 0) >= custom_min_confidence
            for alias in rule["labels"]
        ):
            detected_hazards.append(rule["name"])

    return {
        "all_labels": names,
        "has_road_context": has_road_context,
        "detected_hazards": detected_hazards,
        "risk_score": max(
            (rule["score"] for rule in HAZARD_RULES if rule["name"] in detected_hazards),
            default=10 if has_road_context else 0,
        ),
    }
