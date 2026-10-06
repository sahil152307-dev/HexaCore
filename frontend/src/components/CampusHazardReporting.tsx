import { useRef, useState, type FormEvent } from "react";
import { Camera, ClipboardList, MapPin, Send, X } from "lucide-react";
import type { CampusHazardReport } from "../types";

interface CampusHazardReportingProps {
  backendUrl: string;
  reports: CampusHazardReport[];
  onReportCreated: (report: CampusHazardReport) => void;
}

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png"];

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
    (typeof report.rejection_reason === "string" || report.rejection_reason === null || report.rejection_reason === undefined) &&
    typeof report.severity === "string" &&
    typeof report.assigned_dept === "string" &&
    typeof report.status === "string" &&
    (typeof report.image_url === "string" || report.image_url === null)
  );
};

export function CampusHazardReporting({
  backendUrl,
  reports,
  onReportCreated,
}: CampusHazardReportingProps) {
  const [buildingName, setBuildingName] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [roomName, setRoomName] = useState("");
  const [issueType, setIssueType] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTeam, setAssignedTeam] = useState("");
  const [severity, setSeverity] = useState<"LOW" | "MEDIUM" | "HIGH">("MEDIUM");
  const [photo, setPhoto] = useState<File | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handlePhotoChange = (file: File | undefined) => {
    setError(null);
    if (!file) {
      setPhoto(null);
      return;
    }
    if (!PHOTO_TYPES.includes(file.type)) {
      setPhoto(null);
      if (photoInputRef.current) photoInputRef.current.value = "";
      setError("Choose a JPEG or PNG photo.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhoto(null);
      if (photoInputRef.current) photoInputRef.current.value = "";
      setError("Photo must be 4 MB or smaller.");
      return;
    }
    setPhoto(file);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !buildingName.trim() ||
      !departmentName.trim() ||
      !roomName.trim() ||
      !issueType.trim() ||
      !description.trim()
    ) {
      setError("Complete all required location and issue details before submitting.");
      return;
    }
    if (!photo) {
      setError("Attach a JPEG or PNG photo of the issue before submitting.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const formData = new FormData();
      formData.set("building_name", buildingName.trim());
      formData.set("department_name", departmentName.trim());
      formData.set("room_name", roomName.trim());
      formData.set("issue_type", issueType.trim());
      formData.set("description", description.trim());
      formData.set("assigned_dept", assignedTeam.trim());
      formData.set("priority", severity);
      formData.set("image", photo);

      const response = await fetch(`${backendUrl}/api/report-campus-hazard`, {
        method: "POST",
        body: formData,
      });
      const responseData: unknown = await response.json();

      if (!response.ok) {
        const detail =
          typeof responseData === "object" && responseData !== null && "detail" in responseData
            ? String(responseData.detail)
            : `Server returned HTTP ${response.status}`;
        throw new Error(detail);
      }

      if (
        typeof responseData !== "object" ||
        responseData === null ||
        !("success" in responseData) ||
        responseData.success !== true ||
        !("data" in responseData) ||
        !isCampusHazardReport(responseData.data)
      ) {
        throw new Error("The server returned an invalid facilities report.");
      }

      const report = responseData.data;
      onReportCreated(report);
      setBuildingName("");
      setDepartmentName("");
      setRoomName("");
      setIssueType("");
      setDescription("");
      setAssignedTeam("");
      setSeverity("MEDIUM");
      setPhoto(null);
      if (photoInputRef.current) photoInputRef.current.value = "";
      setSuccessMessage(
        report.assigned_dept === "Unassigned"
          ? "Report saved. No team was specified."
          : `Report saved. Responsible team noted: ${report.assigned_dept}.`
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not submit the facilities report."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const inputClassName =
    "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20";

  return (
    <section className="rounded-xl glass-panel border border-slate-800 p-5 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-md border border-cyan-500/30 bg-cyan-950/50 p-2">
            <ClipboardList className="h-5 w-5 text-cyan-400" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Campus facilities report</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Building, department/course, room, issue details, and a photo are required. This form records your report but does not diagnose the fault or notify staff automatically.
            </p>
          </div>
        </div>
        <span className="text-sm text-slate-400">
          {reports.length} {reports.length === 1 ? "saved report" : "saved reports"}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className="block text-sm font-medium text-slate-200">Building or block <span className="text-rose-400">*</span></span>
          <span className="relative block">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            <input
              type="text"
              value={buildingName}
              onChange={(event) => setBuildingName(event.target.value)}
              placeholder="Enter the building or campus area"
              minLength={2}
              maxLength={120}
              required
              className={`${inputClassName} pl-9`}
            />
          </span>
        </label>

        <label className="space-y-1.5">
          <span className="block text-sm font-medium text-slate-200">Department or course <span className="text-rose-400">*</span></span>
          <input
            type="text"
            value={departmentName}
            onChange={(event) => setDepartmentName(event.target.value)}
            placeholder="Enter a department, course, or program"
            minLength={2}
            maxLength={120}
            required
            className={inputClassName}
          />
        </label>

        <label className="space-y-1.5">
          <span className="block text-sm font-medium text-slate-200">Room or nearby location <span className="text-rose-400">*</span></span>
          <input
            type="text"
            value={roomName}
            onChange={(event) => setRoomName(event.target.value)}
            placeholder="Enter a room number or nearby landmark"
            minLength={1}
            maxLength={80}
            required
            className={inputClassName}
          />
        </label>

        <label className="space-y-1.5">
          <span className="block text-sm font-medium text-slate-200">Issue <span className="text-rose-400">*</span></span>
          <input
            type="text"
            value={issueType}
            onChange={(event) => setIssueType(event.target.value)}
            placeholder="e.g. AC not cooling, broken desk, water leak"
            minLength={2}
            maxLength={120}
            required
            className={inputClassName}
          />
        </label>

        <label className="space-y-1.5 md:col-span-2">
          <span className="block text-sm font-medium text-slate-200">What happened? <span className="text-rose-400">*</span></span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Add details that can help the maintenance team locate or understand the issue."
            maxLength={1000}
            rows={3}
            required
            className={inputClassName}
          />
        </label>

        <label className="space-y-1.5">
          <span className="block text-sm font-medium text-slate-200">Responsible team (optional; admin can assign)</span>
          <input
            type="text"
            value={assignedTeam}
            onChange={(event) => setAssignedTeam(event.target.value)}
            placeholder="Enter the team if you know it"
            maxLength={120}
            className={inputClassName}
          />
        </label>

        <label className="space-y-1.5">
          <span className="block text-sm font-medium text-slate-200">Priority</span>
          <select
            value={severity}
            onChange={(event) => {
              if (event.target.value === "LOW" || event.target.value === "MEDIUM" || event.target.value === "HIGH") {
                setSeverity(event.target.value);
              }
            }}
            className={inputClassName}
          >
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
        </label>

        <div className="space-y-2 md:col-span-2">
          <label className="block text-sm font-medium text-slate-200" htmlFor="facility-photo">
            Photo evidence <span className="text-rose-400">*</span> (JPEG or PNG up to 4 MB)
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor="facility-photo"
              className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:border-cyan-500/50"
            >
              <Camera className="h-4 w-4 text-cyan-400" aria-hidden="true" />
              Add photo
            </label>
            <input
              id="facility-photo"
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,.jpg,.jpeg,.png"
              required={!photo}
              className="sr-only"
              onChange={(event) => handlePhotoChange(event.target.files?.[0])}
            />
            {photo && (
              <span className="flex items-center gap-2 text-sm text-slate-400">
                <span className="max-w-xs truncate">{photo.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setPhoto(null);
                    if (photoInputRef.current) photoInputRef.current.value = "";
                  }}
                  className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                  aria-label="Remove attached photo"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </span>
            )}
          </div>
        </div>

        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-cyan-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {submitting ? "Saving report…" : "Submit report"}
          </button>
        </div>

        {error && <p className="text-sm text-rose-400 md:col-span-2" role="alert">{error}</p>}
        {successMessage && <p className="text-sm text-emerald-400 md:col-span-2" role="status">{successMessage}</p>}
      </form>

      <div className="space-y-3 border-t border-slate-800 pt-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Report history</h3>
          <span className="text-xs text-slate-500">All reports stay here with their latest status</span>
        </div>

        {reports.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-700 px-4 py-5 text-sm text-slate-400">
            No campus issues have been reported yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {reports.map((report) => (
              <li
                key={report.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/50 p-3"
              >
                <div className="flex min-w-0 items-start gap-3">
                  {report.image_url && (
                    <span className="shrink-0 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-300">
                      Photo attached
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-100">
                      {report.hazard_type}
                      <span className="px-1.5 text-slate-500">·</span>
                      <span className="font-normal text-slate-300">
                        {[report.location_name, report.department_name, report.room_name].filter(Boolean).join(" · ")}
                      </span>
                    </p>
                    {report.description && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-400">{report.description}</p>
                    )}
                    {report.status === "Rejected" && report.rejection_reason && (
                      <p className="mt-1 text-sm text-rose-300">
                        Rejection reason: {report.rejection_reason}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-400">
                      Responsible team: {report.assigned_dept}
                      {report.timestamp && <> · {new Date(report.timestamp).toLocaleString()}</>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded border border-slate-700 px-2 py-1 text-slate-300">
                    {report.severity.toLowerCase()} priority
                  </span>
                  <span className={`rounded border px-2 py-1 ${
                    report.status === "Approved"
                      ? "border-emerald-500/30 bg-emerald-950/50 text-emerald-300"
                      : report.status === "Rejected"
                        ? "border-rose-500/30 bg-rose-950/50 text-rose-300"
                        : "border-cyan-500/30 bg-cyan-950/50 text-cyan-300"
                  }`}>
                    {report.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
