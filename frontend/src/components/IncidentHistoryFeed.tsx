import React from "react";
import { History, ShieldAlert, AlertTriangle, ShieldCheck, ChevronRight } from "lucide-react";
import type { IncidentRecord } from "../types";
import { cn } from "../lib/utils";

interface IncidentHistoryFeedProps {
  history: IncidentRecord[];
  onSelectRecord: (record: IncidentRecord) => void;
  selectedId?: string;
}

export const IncidentHistoryFeed: React.FC<IncidentHistoryFeedProps> = ({
  history,
  onSelectRecord,
  selectedId,
}) => {
  if (history.length === 0) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl glass-panel border border-slate-800 p-5 shadow-2xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-slate-100 tracking-wide">
            Recent analyses
          </h3>
        </div>
        <span className="text-[11px] font-mono text-slate-400">
          {history.length} Events Captured
        </span>
      </div>

      {/* History item list */}
      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
        {history.map((record) => {
          const isSelected = selectedId === record.id;
          const severityBadge = {
            HIGH: { color: "text-rose-400 border-rose-500/40 bg-rose-950/40", icon: ShieldAlert },
            MEDIUM: { color: "text-amber-400 border-amber-500/40 bg-amber-950/40", icon: AlertTriangle },
            LOW: { color: "text-emerald-400 border-emerald-500/40 bg-emerald-950/40", icon: ShieldCheck },
            "N/A": { color: "text-slate-400 border-slate-500/40 bg-slate-950/40", icon: ShieldCheck },
          }[record.severity];

          return (
            <div
              key={record.id}
              onClick={() => onSelectRecord(record)}
              className={cn(
                "group flex items-center justify-between gap-3 p-3 rounded-xl border transition-all cursor-pointer",
                isSelected
                  ? "bg-cyan-950/40 border-cyan-500/60 shadow-[0_0_15px_rgba(6,182,212,0.2)]"
                  : "bg-slate-900/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900"
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-11 w-11 rounded-md flex-shrink-0 bg-slate-950 border border-slate-800 flex items-center justify-center">
                  {React.createElement(severityBadge.icon, { className: "h-5 w-5 text-slate-400" })}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn("px-2 py-0.5 rounded text-[10px] font-mono font-bold border", severityBadge.color)}>
                      {record.severity === "N/A"
                        ? record.severity
                        : `${record.severity.slice(0, 1)}${record.severity.slice(1).toLowerCase()}`}
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-200 truncate">
                      {record.detected_hazards.length > 0
                        ? record.detected_hazards.join(", ")
                        : record.assessment_status === "UNCERTAIN" ? "Unconfirmed" : "Clear Road"}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                    <span>{record.createdAt}</span>
                    <span>•</span>
                    <span className="text-cyan-400">
                      {record.risk_score === null ? "Manual check" : `Score ${record.risk_score}/100`}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-transform group-hover:translate-x-0.5" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
