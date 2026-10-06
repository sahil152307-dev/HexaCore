export interface HazardAnalysisResult {
  success: boolean;
  error_type?: "INVALID_IMAGE";
  assessment_status?: "HAZARD_DETECTED" | "UNCERTAIN";
  message?: string;
  all_labels?: string[];
  detected_hazards: string[];
  risk_score: number | null;
  severity: "LOW" | "MEDIUM" | "HIGH" | "N/A";
  alert_message?: string;
  audio_url: string | null;
  warnings?: string[];
  timestamp?: string;
  location?: {
    lat: number;
    lng: number;
    address?: string;
  };
}

export interface PresetHazard {
  id: string;
  title: string;
  description: string;
  badge: string;
  imageUrl: string;
  fallbackResult: HazardAnalysisResult;
}

export interface IncidentRecord extends HazardAnalysisResult {
  id: string;
  imageUrl: string;
  createdAt: string;
}

export interface CampusHazardReport {
  id: number;
  timestamp: string | null;
  location_name: string;
  department_name?: string | null;
  room_name?: string | null;
  hazard_type: string;
  description?: string | null;
  rejection_reason?: string | null;
  severity: string;
  assigned_dept: string;
  status: string;
  image_url: string | null;
}

export interface BackendStatus {
  online: boolean;
  systemName: string;
  latencyMs: number;
  lastChecked: string;
}
