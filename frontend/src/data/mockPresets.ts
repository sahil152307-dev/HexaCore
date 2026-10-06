import type { PresetHazard } from "../types";

export const MOCK_PRESETS: PresetHazard[] = [
  {
    id: "pothole-deep",
    title: "Pothole",
    description: "Road surface damage",
    badge: "Severe Hazard",
    imageUrl: "",
    fallbackResult: {
      success: true,
      all_labels: ["Road", "Asphalt", "Pothole", "Damaged", "Tarmac", "Crack", "Highway", "Street"],
      detected_hazards: ["Pothole", "Damaged", "Crack"],
      risk_score: 90,
      severity: "HIGH",
      alert_message: "Warning! High severity hazard detected. Issues found: Pothole, Damaged, Crack. Hazard severity score is 90 out of 100.",
      audio_url: "",
    }
  },
  {
    id: "flooding-waterlog",
    title: "Flooded road",
    description: "Standing water on a roadway",
    badge: "Critical Hazard",
    imageUrl: "",
    fallbackResult: {
      success: true,
      all_labels: ["Road", "Water", "Flood", "Vehicle", "Rain", "Asphalt", "Traffic", "Weather"],
      detected_hazards: ["Flood", "Water", "Vehicle"],
      risk_score: 85,
      severity: "HIGH",
      alert_message: "Warning! High severity hazard detected. Issues found: Flood, Water, Vehicle. Hazard severity score is 85 out of 100.",
      audio_url: "",
    }
  },
  {
    id: "crack-fissure",
    title: "Cracked pavement",
    description: "A crack in the road surface",
    badge: "Medium Risk",
    imageUrl: "",
    fallbackResult: {
      success: true,
      all_labels: ["Asphalt", "Road", "Crack", "Pavement", "Concrete", "Surface", "Highway"],
      detected_hazards: ["Crack"],
      risk_score: 70,
      severity: "MEDIUM",
      alert_message: "Warning! Medium severity hazard detected. Issues found: Crack. Hazard severity score is 70 out of 100.",
      audio_url: "",
    }
  },
  {
    id: "traffic-accident",
    title: "Traffic collision",
    description: "Vehicles involved in a road incident",
    badge: "Critical Hazard",
    imageUrl: "",
    fallbackResult: {
      success: true,
      all_labels: ["Vehicle", "Accident", "Traffic Jam", "Car", "Road", "Asphalt", "Highway", "Emergency"],
      detected_hazards: ["Accident", "Traffic Jam", "Vehicle"],
      risk_score: 95,
      severity: "HIGH",
      alert_message: "Warning! High severity hazard detected. Issues found: Accident, Traffic Jam, Vehicle. Hazard severity score is 95 out of 100.",
      audio_url: "",
    }
  },
  {
    id: "clean-highway",
    title: "Clear road",
    description: "Road surface without visible hazards",
    badge: "Low Risk",
    imageUrl: "",
    fallbackResult: {
      success: true,
      assessment_status: "UNCERTAIN",
      all_labels: ["Road", "Asphalt", "Highway", "Lane", "Transportation", "Daylight", "Clear Sky"],
      detected_hazards: [],
      risk_score: null,
      severity: "N/A",
      alert_message: "No supported hazard label was confirmed. General-purpose image labels cannot rule out road damage; please inspect the image manually.",
      audio_url: "",
    }
  }
];
