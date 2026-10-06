import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, ClipboardCheck, LogOut, RefreshCw } from "lucide-react";
import type { CampusHazardReport } from "../types";

interface AdminPortalProps {
  backendUrl: string;
}

const STATUSES = ["Approved", "Rejected"] as const;
type ReportStatus = (typeof STATUSES)[number];

const isReport = (value: unknown): value is CampusHazardReport => {
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

async function readError(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  if (typeof body === "object" && body !== null && "detail" in body) {
    return String(body.detail);
  }
  return `Server returned HTTP ${response.status}`;
}

export function AdminPortal({ backendUrl }: AdminPortalProps) {
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [password, setPassword] = useState("");
  const [reports, setReports] = useState<CampusHazardReport[]>([]);
  const [drafts, setDrafts] = useState<Record<number, {
    status: ReportStatus | "";
    assignedDept: string;
    rejectionReason: string;
  }>>({});
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [loadingReports, setLoadingReports] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setLoadingReports(true);
    setError(null);
    try {
      const response = await fetch(`${backendUrl}/api/admin/campus-hazards`, {
        credentials: "include",
      });
      if (response.status === 401) {
        setAuthenticated(false);
        return;
      }
      if (!response.ok) throw new Error(await readError(response));
      const data: unknown = await response.json();
      if (!Array.isArray(data) || !data.every(isReport)) {
        throw new Error("The server returned an invalid report list.");
      }
      const pendingReports = data.filter((report) => report.status === "Pending");
      setReports(pendingReports);
      setDrafts(Object.fromEntries(pendingReports.map((report) => [
        report.id,
        {
          status: STATUSES.includes(report.status as ReportStatus)
            ? report.status as ReportStatus
            : "",
          assignedDept: report.assigned_dept === "Unassigned" ? "" : report.assigned_dept,
          rejectionReason: report.rejection_reason ?? "",
        },
      ])));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load reports.");
    } finally {
      setLoadingReports(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    let active = true;
    const checkSession = async () => {
      try {
        const response = await fetch(`${backendUrl}/api/admin/session`, {
          credentials: "include",
        });
        if (!active) return;
        if (response.ok) {
          setAuthenticated(true);
          await loadReports();
        } else if (response.status !== 401) {
          setError(await readError(response));
        }
      } catch (sessionError) {
        if (active) {
          setError(sessionError instanceof Error ? sessionError.message : "Could not check admin sign-in.");
        }
      } finally {
        if (active) setCheckingSession(false);
      }
    };
    void checkSession();
    return () => {
      active = false;
    };
  }, [backendUrl, loadReports]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${backendUrl}/api/admin/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setPassword("");
      setAuthenticated(true);
      await loadReports();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Admin sign-in failed.");
    }
  };

  const handleLogout = async () => {
    setError(null);
    try {
      const response = await fetch(`${backendUrl}/api/admin/logout`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error(await readError(response));
      setAuthenticated(false);
      setReports([]);
      setNotice(null);
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "Could not sign out.");
    }
  };

  const updateReport = async (reportId: number, values: {
    status: ReportStatus | "";
    assignedDept: string;
    rejectionReason: string;
  }) => {
    const assignedDept = values.assignedDept.trim();
    const rejectionReason = values.rejectionReason.trim();
    if (!values.status) {
      setError("Choose Approved or Rejected before saving this review.");
      return;
    }
    if (!assignedDept) {
      setError("Responsible team is required before saving this review.");
      return;
    }
    if (values.status === "Rejected" && !rejectionReason) {
      setError("Add a reason before rejecting this report.");
      return;
    }

    setUpdatingId(reportId);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${backendUrl}/api/admin/campus-hazards/${reportId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: values.status,
          assigned_dept: assignedDept,
          rejection_reason: values.status === "Rejected" ? rejectionReason : "",
        }),
      });
      if (response.status === 401) {
        setAuthenticated(false);
        throw new Error("Admin session expired. Sign in again.");
      }
      if (!response.ok) throw new Error(await readError(response));
      const body: unknown = await response.json();
      if (typeof body !== "object" || body === null || !("data" in body) || !isReport(body.data)) {
        throw new Error("The server returned an invalid updated report.");
      }
      const updated = body.data;
      setReports((current) => current.filter((report) => report.id !== updated.id));
      setDrafts((current) => ({
        ...Object.fromEntries(
          Object.entries(current).filter(([id]) => Number(id) !== updated.id),
        ),
      }));
      setNotice(`Report #${updated.id} ${updated.status.toLowerCase()}; removed from the pending review queue.`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update the report.");
    } finally {
      setUpdatingId(null);
    }
  };

  const cardClass = "rounded-xl glass-panel border border-slate-800 p-5 sm:p-6";
  const fieldClass = "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20";

  if (checkingSession) {
    return <section className={`${cardClass} text-sm text-slate-400`}>Checking admin session…</section>;
  }

  if (!authenticated) {
    return (
      <section className={`${cardClass} mx-auto max-w-lg space-y-5`}>
        <div className="flex items-center gap-3">
          <ClipboardCheck className="h-6 w-6 text-cyan-400" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Admin sign-in</h2>
            <p className="text-sm text-slate-400">Sign in to review and update campus reports.</p>
          </div>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-200">Admin password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              maxLength={256}
              required
              className={fieldClass}
            />
            <span className="block text-xs text-amber-300">
              Required for both approval and rejection.
            </span>
          </label>
          <button
            type="submit"
            className="w-full rounded-md bg-cyan-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-cyan-500"
          >
            Sign in
          </button>
        </form>
        {error && <p className="text-sm text-rose-400" role="alert">{error}</p>}
        <p className="text-xs text-slate-500">
          Admin access must be configured in the backend environment before sign-in.
        </p>
      </section>
    );
  }

  const pendingCount = reports.length;

  return (
    <section className="space-y-5">
      <div className={`${cardClass} flex flex-wrap items-center justify-between gap-3`}>
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Campus report review</h2>
          <p className="mt-1 text-sm text-slate-400">
            {pendingCount} pending {pendingCount === 1 ? "report" : "reports"} · Approve or reject each report and assign a responsible team.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadReports()}
            disabled={loadingReports}
            className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-cyan-500/50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loadingReports ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-rose-500/50 hover:text-rose-300"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-rose-400" role="alert">{error}</p>}
      {notice && <p className="text-sm text-emerald-400" role="status">{notice}</p>}

      {reports.length === 0 ? (
        <div className={`${cardClass} text-sm text-slate-400`}>
          {loadingReports ? "Loading reports…" : "No pending reports to review."}
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => {
            const draft = drafts[report.id] ?? { status: "" as const, assignedDept: "", rejectionReason: "" };
            const photoName = report.image_url?.split("/").pop();
            return (
              <article key={report.id} className={`${cardClass} space-y-4`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 gap-4">
                    {photoName && (
                      <a
                        href={`${backendUrl}/api/admin/report-photos/${encodeURIComponent(photoName)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0"
                      >
                        <img
                          src={`${backendUrl}/api/admin/report-photos/${encodeURIComponent(photoName)}`}
                          alt="Evidence attached to report"
                          className="h-24 w-24 rounded-md border border-slate-700 object-cover"
                        />
                      </a>
                    )}
                    <div className="min-w-0 space-y-1">
                      <h3 className="font-medium text-slate-100">
                        #{report.id} · {report.hazard_type}
                      </h3>
                      <p className="text-sm text-slate-300">
                        {[report.location_name, report.department_name, report.room_name].filter(Boolean).join(" · ")}
                      </p>
                      {report.description && (
                        <p className="whitespace-pre-wrap text-sm text-slate-400">{report.description}</p>
                      )}
                      <p className="text-xs text-slate-500">
                        {report.timestamp ? new Date(report.timestamp).toLocaleString() : "Time unavailable"}
                        {" · "}{report.severity.toLowerCase()} priority
                        {" · Current: "}{report.status}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 border-t border-slate-800 pt-4 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="space-y-1">
                    <span className="text-xs text-slate-400">Decision (required)</span>
                    <select
                      value={draft.status}
                      onChange={(event) => {
                        if (STATUSES.includes(event.target.value as ReportStatus)) {
                          setDrafts((current) => ({
                            ...current,
                            [report.id]: { ...draft, status: event.target.value as ReportStatus | "" },
                          }));
                        }
                      }}
                      required
                      className={fieldClass}
                    >
                      <option value="">Choose a decision</option>
                      {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-slate-400">Responsible team (required)</span>
                    <input
                      value={draft.assignedDept}
                      onChange={(event) => setDrafts((current) => ({
                        ...current,
                        [report.id]: { ...draft, assignedDept: event.target.value },
                      }))}
                      maxLength={120}
                      placeholder="Enter team"
                      required
                      className={fieldClass}
                    />
                  </label>
                  {draft.status === "Rejected" && (
                    <label className="space-y-1">
                      <span className="text-xs text-slate-400">Reason for rejection (required)</span>
                      <input
                        value={draft.rejectionReason}
                        onChange={(event) => setDrafts((current) => ({
                          ...current,
                          [report.id]: { ...draft, rejectionReason: event.target.value },
                        }))}
                        maxLength={500}
                        placeholder="Explain why this report is rejected"
                        required
                        className={fieldClass}
                      />
                    </label>
                  )}
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => void updateReport(report.id, draft)}
                      disabled={updatingId === report.id || loadingReports}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-cyan-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50 sm:w-auto"
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                      {updatingId === report.id ? "Saving…" : "Save review"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
