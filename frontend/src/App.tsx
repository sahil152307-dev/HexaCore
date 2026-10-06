
import { useState, useEffect, useCallback } from "react";
import confetti from "canvas-confetti";

import {
  ShieldAlert,
  Activity,
  Info,
  Building2,
  ScanSearch,
} from "lucide-react";

import { Header } from "./components/Header";
import { HazardDropzone } from "./components/HazardDropzone";
import { RiskGaugeCard } from "./components/RiskGaugeCard";
import { TagCloud } from "./components/TagCloud";
import { WaveformVisualizer } from "./components/WaveformVisualizer";
import { LiveIncidentMap } from "./components/LiveIncidentMap";
import { IncidentHistoryFeed } from "./components/IncidentHistoryFeed";
import { ApiInspectorModal } from "./components/ApiInspectorModal";
import { CampusHazardReporting } from "./components/CampusHazardReporting";
import { AdminPortal } from "./components/AdminPortal";

import type { HazardAnalysisResult, IncidentRecord, CampusHazardReport, BackendStatus } from "./types";

interface HazardLogResponse {
  id: number;
  timestamp: string | null;
  severity: "LOW" | "MEDIUM" | "HIGH";
  risk_score: number;
  hazards_detected: string | string[];
  audio_url: string | null;
}

const isHazardLogResponse = (value: unknown): value is HazardLogResponse => {
  if (typeof value !== "object" || value === null) return false;
  const log = value as Record<string, unknown>;
  return (
    typeof log.id === "number" &&
    (typeof log.timestamp === "string" || log.timestamp === null) &&
    (log.severity === "LOW" || log.severity === "MEDIUM" || log.severity === "HIGH") &&
    typeof log.risk_score === "number" &&
    (typeof log.hazards_detected === "string" || Array.isArray(log.hazards_detected)) &&
    (typeof log.audio_url === "string" || log.audio_url === null)
  );
};

const isCampusHazardReport = (value: unknown): value is CampusHazardReport => {
  if (typeof value !== "object" || value === null) return false;
  const report = value as Record<string, unknown>;
  return (
    typeof report.id === "number" &&
    (typeof report.timestamp === "string" || report.timestamp === null) &&
    typeof report.location_name === "string" &&
    (typeof report.department_name === "string" || report.department_name === null || report.department_name === undefined) &&
    (typeof report.room_name === "string" || report.room_name === null || report.room_name === undefined) &&
    typeof report.hazard_type === "string" &&
    (typeof report.description === "string" || report.description === null || report.description === undefined) &&
    typeof report.severity === "string" &&
    typeof report.assigned_dept === "string" &&
    typeof report.status === "string" &&
    (typeof report.image_url === "string" || report.image_url === null)
  );
};

export function App() {
  const [theme, setTheme] = useState<"dark" | "light">(() => (
    localStorage.getItem("alertbuzzer-theme") === "light" ? "light" : "dark"
  ));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("alertbuzzer-theme", theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      theme === "light" ? "#f4f5f3" : "#030712"
    );
  }, [theme]);

  // State variables
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [results, setResults] = useState<HazardAnalysisResult | null>(null);
  const [showRiskPortal, setShowRiskPortal] = useState<boolean>(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [audioPlayCount, setAudioPlayCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  // App & Environment States
  const [backendUrl, setBackendUrl] = useState<string>(
    () => (import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:8000`).replace(/\/$/, "")
  );
  const [isAdminPortal, setIsAdminPortal] = useState(false);
  const [dashboardSection, setDashboardSection] = useState<"analysis" | "campus">("analysis");
  const [campusReportsRefresh, setCampusReportsRefresh] = useState(0);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [autoPlayAudio, setAutoPlayAudio] = useState<boolean>(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [history, setHistory] = useState<IncidentRecord[]>([]);
  const [campusReports, setCampusReports] = useState<CampusHazardReport[]>([]);

  // Telemetry & Geo location
  const [location, setLocation] = useState<{ lat: number; lng: number; address?: string }>({
    lat: 19.0760,
    lng: 72.8777,
    address: "Live GPS Vehicle Coordinates",
  });
  const [gpsActive, setGpsActive] = useState<boolean>(true);

  // Backend Health Status
  const [backendStatus, setBackendStatus] = useState<BackendStatus>({
    online: false,
    systemName: "AlertBuzzer AI",
    latencyMs: 0,
    lastChecked: new Date().toLocaleTimeString(),
  });

  // Ping Backend on mount
  const checkBackendHealth = useCallback(async () => {
    const startTime = performance.now();
    try {
      const res = await fetch(`${backendUrl}/`, { method: "GET", cache: "no-cache" });
      const latency = Math.round(performance.now() - startTime);
      if (res.ok) {
        const data = await res.json();
        setBackendStatus({
          online: true,
          systemName: data.status || "AlertBuzzer AI Backend",
          latencyMs: latency,
          lastChecked: new Date().toLocaleTimeString(),
        });
      } else {
        setBackendStatus((prev) => ({ ...prev, online: false }));
      }
    } catch {
      setBackendStatus((prev) => ({ ...prev, online: false }));
    }
  }, [backendUrl]);

  useEffect(() => {
    checkBackendHealth();
    const interval = setInterval(checkBackendHealth, 12000);
    return () => clearInterval(interval);
  }, [checkBackendHealth]);

  // Request browser GPS position
  useEffect(() => {
    if (navigator.geolocation && gpsActive) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            address: "Live GPS Vehicle Coordinates",
          });
        },
        (err) => {
          console.warn("GPS access denied", err);
        }
      );
    }
  }, [gpsActive]);
  useEffect(() => {
    const controller = new AbortController();

    const fetchHazardHistory = async () => {
      try {
        const response = await fetch(`${backendUrl}/api/hazard-history`, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Server returned HTTP ${response.status}`);
        }
        const data: unknown = await response.json();
        if (!Array.isArray(data) || !data.every(isHazardLogResponse)) {
          throw new Error("Invalid hazard history response");
        }

        setHistory(data.map((log) => {
          const hazards = Array.isArray(log.hazards_detected)
            ? log.hazards_detected
            : log.hazards_detected.split(",").map((hazard) => hazard.trim()).filter(Boolean);
          const timestamp = log.timestamp ? new Date(log.timestamp) : null;

          return {
            success: true,
            all_labels: [],
            detected_hazards: hazards,
            assessment_status: hazards.length ? "HAZARD_DETECTED" : "UNCERTAIN",
            risk_score: hazards.length ? log.risk_score : null,
            severity: log.severity,
            alert_message: hazards.length
              ? `Previously detected hazards: ${hazards.join(", ")}.`
              : "No supported hazard was confirmed in this earlier analysis; inspect manually.",
            audio_url: log.audio_url,
            timestamp: log.timestamp ?? undefined,
            id: String(log.id),
            imageUrl: "",
            createdAt: timestamp && !Number.isNaN(timestamp.getTime())
              ? timestamp.toLocaleString()
              : "Time unavailable",
          };
        }));
      } catch (fetchError) {
        if (!controller.signal.aborted) {
          console.error("History fetch error:", fetchError);
        }
      }
    };

    const fetchCampusReports = async () => {
      try {
        const response = await fetch(`${backendUrl}/api/campus-hazards`, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Server returned HTTP ${response.status}`);
        }
        const data: unknown = await response.json();
        if (!Array.isArray(data) || !data.every(isCampusHazardReport)) {
          throw new Error("Invalid campus reports response");
        }
        setCampusReports(data);
      } catch (fetchError) {
        if (!controller.signal.aborted) {
          console.error("Campus reports fetch error:", fetchError);
        }
      }
    };

    void fetchHazardHistory();
    void fetchCampusReports();

    return () => controller.abort();
  }, [backendUrl, campusReportsRefresh]);

  // Handle Image Selection
  const handleSelectImage = (file: File, preview: string) => {
    setImageFile(file);
    setPreviewUrl(preview);
    setResults(null);
    setShowRiskPortal(false);
    setError(null);
    setAlertMessage(null);
  };

  // Clear Image / Reset
  const handleClearImage = () => {
    setImageFile(null);
    setPreviewUrl(null);
    setResults(null);
    setShowRiskPortal(false);
    setAlertMessage(null);
    setError(null);
  };

  const handleReset = () => {
    handleClearImage();
  };

  // Execute Analysis with Live API & Auto-Play Audio
  const analyzePresetOrFile = async () => {
    const fileToUpload = imageFile;

    if (
      fileToUpload &&
      !["image/jpeg", "image/png"].includes(fileToUpload.type)
    ) {
      setError("Use a JPEG or PNG image. Other formats are not supported by the image service.");
      return;
    }
    if (fileToUpload && fileToUpload.size > 4 * 1024 * 1024) {
      setError("Image is larger than 4 MB. Choose a smaller JPEG or PNG.");
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);
    setShowRiskPortal(false);

    if (fileToUpload) {
      try {
        const formData = new FormData();
        formData.append("file", fileToUpload);

        const response = await fetch(`${backendUrl}/api/analyze-hazard`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Server returned HTTP ${response.status}`);
        }

        const data: HazardAnalysisResult = await response.json();
        processAnalysisSuccess(data, previewUrl ?? "");
      } catch (err) {
        const detail = err instanceof Error ? err.message : "Unknown analysis error";
        console.error("Hazard analysis request failed:", detail);
        setError(`Analysis failed: ${detail}. Your image was not analyzed.`);
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(false);
      setError("Choose a JPEG or PNG image before starting analysis.");
    }
  };

  const processAnalysisSuccess = (data: HazardAnalysisResult, imgUrl: string) => {
    if (data.error_type === "INVALID_IMAGE") {
      setResults(null);
      setShowRiskPortal(false);
      const detectedLabels = data.all_labels?.length
        ? ` Labels recognized: ${data.all_labels.join(", ")}.`
        : "";
      setAlertMessage(
        `${data.message ?? "Invalid image. Please upload road or hazard imagery."}${detectedLabels}`
      );
      return;
    }

    setAlertMessage(null);
    if (data.warnings?.length) {
      setError(data.warnings.join(" "));
    }
    setShowRiskPortal(true);
    setResults(data);
    setAudioPlayCount((c) => c + 1);

    // Auto Play Audio if available
    if (autoPlayAudio && data.audio_url) {
      const fullAudioUrl = `${backendUrl}${data.audio_url}?t=${Date.now()}`;
      const audio = new Audio(fullAudioUrl);
      audio.play().catch((err) => console.warn("Autoplay error:", err));
    }

    // Confetti for Safe Road
    if (
      data.assessment_status !== "UNCERTAIN" &&
      data.risk_score !== null &&
      data.risk_score <= 40
    ) {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.8 },
        colors: ["#10b981", "#06b6d4", "#3b82f6"],
      });
    }

    // Append to incident history
    const record: IncidentRecord = {
      ...data,
      id: `INC-${Date.now()}`,
      imageUrl: imgUrl,
      createdAt: new Date().toLocaleTimeString(),
      location: { ...location },
    };

    setHistory((prev) => [record, ...prev.slice(0, 7)]);
  };

  const handleSelectRecordFromHistory = (record: IncidentRecord) => {
    setPreviewUrl(record.imageUrl || null);
    setResults(record);
    setShowRiskPortal(true);
    setError(null);
    setAlertMessage(null);
    if (record.location) {
      setLocation(record.location);
    }
  };

  const handleToggleAdminPortal = () => {
    if (isAdminPortal) {
      setCampusReportsRefresh((version) => version + 1);
    }
    setIsAdminPortal((current) => !current);
  };

  return (
      <div className="min-h-screen bg-[#030712] text-slate-100 flex flex-col">
      <Header
        theme={theme}
        onToggleTheme={() => setTheme((current) => current === "dark" ? "light" : "dark")}
        backendStatus={backendStatus}
        isDemoMode={isDemoMode}
        setIsDemoMode={setIsDemoMode}
        onOpenSettings={() => setIsSettingsOpen(true)}
        autoPlayAudio={autoPlayAudio}
        setAutoPlayAudio={setAutoPlayAudio}
        gpsActive={gpsActive}
        onToggleGps={() => setGpsActive(!gpsActive)}
        onReset={handleReset}
        isAdminPortal={isAdminPortal}
        onToggleAdminPortal={handleToggleAdminPortal}
      />

      <main className="flex-1 max-w-screen-2xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {isAdminPortal ? (
          <AdminPortal backendUrl={backendUrl} />
        ) : (
          <>
        <nav
          aria-label="Dashboard sections"
          role="group"
          className="grid grid-cols-2 gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-1.5"
        >
          <button
            id="analysis-tab"
            type="button"
            aria-pressed={dashboardSection === "analysis"}
            onClick={() => setDashboardSection("analysis")}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              dashboardSection === "analysis"
                ? "bg-cyan-700 text-white shadow-sm"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <ScanSearch className="h-4 w-4" aria-hidden="true" />
            Road analysis
          </button>
          <button
            id="campus-tab"
            type="button"
            aria-pressed={dashboardSection === "campus"}
            onClick={() => {
              setDashboardSection("campus");
              setCampusReportsRefresh((version) => version + 1);
            }}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              dashboardSection === "campus"
                ? "bg-cyan-700 text-white shadow-sm"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <Building2 className="h-4 w-4" aria-hidden="true" />
            Campus issues
            <span className={`rounded px-1.5 py-0.5 text-xs ${
              dashboardSection === "campus" ? "bg-cyan-950/60 text-cyan-100" : "bg-slate-800 text-slate-300"
            }`}>
              {campusReports.length}
            </span>
          </button>
        </nav>

        {dashboardSection === "analysis" ? (
          <section aria-label="Road analysis" className="space-y-6">
        {error && (
            <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs font-mono flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="px-2 py-0.5 rounded bg-amber-900/60 hover:bg-amber-800 text-[10px]"
            >
              Dismiss
            </button>
          </div>
        )}
        {alertMessage && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs font-mono"
          >
            {alertMessage}
          </div>
        )}

        <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-cyan-500" />
                <h2 className="text-base font-semibold tracking-tight text-slate-200">
                  Image input
                </h2>
              </div>
              <span className="text-xs text-slate-400">
                AWS Rekognition
              </span>
            </div>

            <HazardDropzone
              imageFile={imageFile}
              previewUrl={previewUrl}
              loading={loading}
              onSelectImage={handleSelectImage}
              onClearImage={handleClearImage}
              onAnalyze={analyzePresetOrFile}
              hasResult={!!results}
            />
        </section>

        <section className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-500" />
                <h2 className="text-base font-semibold tracking-tight text-slate-200">
                  Risk assessment
                </h2>
              </div>
              {results && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30">
                  Current result
                </span>
              )}
            </div>

            {showRiskPortal && results && results.severity !== "N/A" && results.risk_score !== null ? (
              <div className="space-y-6 transition-all duration-500">
                <RiskGaugeCard
                  score={results.risk_score}
                  severity={results.severity}
                  detectedHazardsCount={results.detected_hazards.length}
                />

                <WaveformVisualizer
                  key={audioPlayCount}
                  audioUrl={results.audio_url ?? undefined}
                  backendUrl={backendUrl}
                  alertMessage={results.alert_message}
                  severity={results.severity}
                  autoPlay={autoPlayAudio}
                />
              </div>
            ) : results?.assessment_status === "UNCERTAIN" ? (
              <div
                className="rounded-2xl glass-panel border border-amber-500/40 bg-amber-950/20 p-6 text-center space-y-3 min-h-64 flex flex-col items-center justify-center"
                role="status"
              >
                <ShieldAlert className="w-10 h-10 text-amber-400" aria-hidden="true" />
                <h3 className="text-base font-semibold text-amber-200">Unconfirmed — please inspect</h3>
                <p className="max-w-xl text-sm text-slate-300">{results.alert_message}</p>
              </div>
            ) : (
              <div className="rounded-2xl glass-panel border border-slate-800 p-8 text-center space-y-4 min-h-64 flex flex-col items-center justify-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-cyan-400/50">
                  <ShieldAlert className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-slate-200">
                    No analysis yet
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed max-w-sm mx-auto">
                    Upload a road image to check for visible hazards.
                  </p>
                </div>

              </div>
            )}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5">
            <TagCloud
              allLabels={results?.all_labels ?? []}
              detectedHazards={results ? results.detected_hazards : []}
              severity={results && results.severity !== "N/A" ? results.severity : "LOW"}
              uncertain={results?.assessment_status === "UNCERTAIN"}
            />
          </div>

          <div className="lg:col-span-7">
            <LiveIncidentMap
              theme={theme}
              currentResult={results}
              location={location}
              onUpdateLocation={(lat, lng) => setLocation((prev) => ({ ...prev, lat, lng }))}
            />
          </div>
        </div>

        <IncidentHistoryFeed
          history={history}
          onSelectRecord={handleSelectRecordFromHistory}
          selectedId={results?.timestamp}
        />
          </section>
        ) : (
          <section aria-label="Campus issues" className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-100">Campus issues</h2>
              <p className="mt-1 text-sm text-slate-400">
                Submit and track classroom or campus maintenance problems.
              </p>
            </div>
            <CampusHazardReporting
              backendUrl={backendUrl}
              reports={campusReports}
              onReportCreated={(report) => {
                setCampusReports((currentReports) => [
                  report,
                  ...currentReports.filter((existing) => existing.id !== report.id),
                ]);
              }}
            />
          </section>
        )}
          </>
        )}
      </main>

      <footer className="w-full border-t border-slate-900 bg-[#02050c] py-4 px-6 text-center text-xs font-mono text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <span>AlertBuzzer · Road hazard monitoring</span>
          <span className="text-slate-400">Image analysis by AWS Rekognition</span>
        </div>
      </footer>

      <ApiInspectorModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        backendUrl={backendUrl}
        onUpdateBackendUrl={(url) => {
          setBackendUrl(url);
          setIsSettingsOpen(false);
          checkBackendHealth();
        }}
        lastResponse={results}
        backendStatus={backendStatus}
        onTestConnection={checkBackendHealth}
      />
    </div>
  );
}

export default App;
