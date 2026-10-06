import React from "react";
import { Tag, AlertTriangle, Check, Layers, Eye } from "lucide-react";
import { cn } from "../lib/utils";

interface TagCloudProps {
  allLabels: string[];
  detectedHazards: string[];
  severity: "LOW" | "MEDIUM" | "HIGH";
  uncertain?: boolean;
}

export const TagCloud: React.FC<TagCloudProps> = ({
  allLabels = [],
  detectedHazards = [],
  severity,
  uncertain = false,
}) => {
  // Identify which labels are hazards vs background labels
  const hazardSet = new Set(detectedHazards.map((h) => h.toLowerCase()));
  const backgroundLabels = allLabels.filter((label) => !hazardSet.has(label.toLowerCase()));

  return (
    <div className="relative overflow-hidden rounded-2xl glass-panel border border-slate-800 p-5 shadow-2xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-slate-100 tracking-wide">
            Detected labels
          </h3>
        </div>
        <span className="text-[11px] font-mono text-cyan-400/80 bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5 rounded-full">
          {allLabels.length} labels
        </span>
      </div>

      {/* 1. Detected Threats / Hazard Tags (Critical Focus) */}
      <div>
        <div className="flex items-center gap-1.5 text-sm text-slate-400 mb-2.5">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          <span className="text-slate-300 font-semibold">Hazards</span>
          {uncertain && (
            <span className="text-amber-300 text-xs normal-case font-sans ml-1">
              (Manual check needed)
            </span>
          )}
          {!uncertain && detectedHazards.length === 0 && allLabels.length > 0 && (
            <span className="text-emerald-400 text-xs normal-case font-sans ml-1">
              (None detected)
            </span>
          )}
          {allLabels.length === 0 && detectedHazards.length === 0 && (
            <span className="text-slate-400 text-xs normal-case font-sans ml-1">
              (Run an analysis to see results)
            </span>
          )}
        </div>

        {detectedHazards.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {detectedHazards.map((hazard, index) => (
              <div
                key={index}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  severity === "HIGH"
                    ? "bg-rose-950/70 border border-rose-500 text-rose-200"
                    : "bg-amber-950/70 border border-amber-500 text-amber-200"
                )}
              >
                <span>{hazard}</span>
                <span className="text-xs opacity-75 px-1.5 py-0.5 rounded bg-black/40">
                  Hazard
                </span>
              </div>
            ))}
          </div>
        ) : allLabels.length > 0 ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs font-mono">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>
              {uncertain
                ? "No hazard was confirmed; this model cannot rule out road damage."
                : "No supported hazards were detected."}
            </span>
          </div>
        ) : null}
      </div>

      {/* 2. All Rekognition Labels (Environmental context) */}
      <div className="pt-2 border-t border-slate-800/60">
        <div className="flex items-center gap-1.5 text-sm text-slate-400 mb-2.5">
          <Eye className="w-3.5 h-3.5 text-cyan-400" />
          <span>Other image labels</span>
        </div>

        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
          {backgroundLabels.map((label, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-slate-900/90 border border-slate-700/60 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300 transition-colors"
            >
              <Tag className="w-3 h-3 text-slate-500" />
              {label}
            </span>
          ))}
          {backgroundLabels.length === 0 && detectedHazards.length === 0 && (
            <span className="text-xs text-slate-500 italic">No labels available.</span>
          )}
        </div>
      </div>
    </div>
  );
};
