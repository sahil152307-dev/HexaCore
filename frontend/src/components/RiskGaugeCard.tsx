import React from "react";
import { AlertTriangle, ShieldCheck, AlertOctagon, Activity, Zap } from "lucide-react";
import { cn } from "../lib/utils";

interface RiskGaugeCardProps {
  score: number;
  severity: "LOW" | "MEDIUM" | "HIGH";
  detectedHazardsCount: number;
}

export const RiskGaugeCard: React.FC<RiskGaugeCardProps> = ({
  score,
  severity,
  detectedHazardsCount,
}) => {
  // Config based on score / severity
  const getTheme = () => {
    if (score >= 75 || severity === "HIGH") {
      return {
        label: "High risk",
        color: "#f43f5e",
        textColor: "text-rose-400",
        bgColor: "bg-rose-950/40",
        borderColor: "border-rose-500/50",
        icon: AlertOctagon,
        recommendation: "Avoid the affected area and report it to the maintenance team.",
        code: "High",
      };
    }
    if (score >= 45 || severity === "MEDIUM") {
      return {
        label: "Moderate risk",
        color: "#f59e0b",
        textColor: "text-amber-400",
        bgColor: "bg-amber-950/40",
        borderColor: "border-amber-500/50",
        icon: AlertTriangle,
        recommendation: "Proceed carefully and report the road damage.",
        code: "Moderate",
      };
    }
    return {
      label: "Low risk",
      color: "#10b981",
      textColor: "text-emerald-400",
      bgColor: "bg-emerald-950/40",
      borderColor: "border-emerald-500/50",
      icon: ShieldCheck,
      recommendation: "No listed hazards were detected in this image.",
      code: "Low",
    };
  };

  const theme = getTheme();
  const IconComponent = theme.icon;

  // Semi-circle path length = PI * radius = 251.32
  const radius = 80;
  const strokeWidth = 14;
  const normalizedScore = Math.min(100, Math.max(0, score));
  const arcLength = Math.PI * radius;
  const strokeDashoffset = arcLength - (normalizedScore / 100) * arcLength;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl glass-panel border p-6 transition-all duration-500",
        theme.borderColor,
        "shadow-sm"
      )}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-medium text-slate-300">
            Risk assessment
          </span>
        </div>
        <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border", theme.borderColor, theme.bgColor, theme.textColor)}>
          {theme.code}
        </span>
      </div>

      {/* Gauge Visualization & Core Numbers */}
      <div className="flex flex-col md:flex-row items-center justify-around gap-6 my-4">
        {/* Semi-Circle Speedometer Gauge */}
        <div className="relative flex flex-col items-center justify-center">
          <svg className="w-48 h-28 transform overflow-visible" viewBox="0 0 200 115">
            {/* Background Track */}
            <path
              d="M 20 100 A 80 80 0 0 1 180 100"
              fill="none"
              stroke="#1e293b"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
            {/* Colored Dynamic Progress Arc */}
            <path
              d="M 20 100 A 80 80 0 0 1 180 100"
              fill="none"
              stroke={theme.color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={arcLength}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-1000 ease-out"
            />
            {/* Tick marks */}
            <line x1="20" y1="106" x2="20" y2="112" stroke="#64748b" strokeWidth="2" />
            <line x1="100" y1="16" x2="100" y2="22" stroke="#64748b" strokeWidth="2" />
            <line x1="180" y1="106" x2="180" y2="112" stroke="#64748b" strokeWidth="2" />
          </svg>

          {/* Centered Score Badge */}
          <div className="absolute top-10 flex flex-col items-center">
            <span className={cn("text-5xl font-black font-mono tracking-tight", theme.textColor)}>
              {score}
            </span>
            <span className="text-xs text-slate-400 -mt-1">
                severity index
            </span>
          </div>

          <div className="flex items-center justify-between w-44 text-[10px] font-mono text-slate-500 mt-1">
            <span>0</span>
            <span>50</span>
            <span>100</span>
          </div>
        </div>

        {/* Severity Metrics Breakdown */}
        <div className="flex-1 space-y-3 w-full">
          <div className="flex items-center gap-3">
            <div className={cn("p-2.5 rounded-xl border", theme.borderColor, theme.bgColor)}>
              <IconComponent className={cn("w-6 h-6", theme.textColor)} />
            </div>
            <div>
              <div className="text-xs text-slate-400">Severity</div>
              <div className={cn("text-lg sm:text-xl font-semibold tracking-tight", theme.textColor)}>
                {theme.label}
              </div>
            </div>
          </div>

          {/* Telemetry micro-bars */}
          <div className="grid grid-cols-2 gap-2 text-sm pt-1">
            <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="text-slate-400 text-xs block">Hazards detected</span>
              <span className="text-white font-bold text-sm">{detectedHazardsCount} Hazards</span>
            </div>
            <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="text-slate-400 text-xs block">Hazard severity score</span>
              <span className="text-cyan-300 font-semibold text-sm">{score} / 100</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Recommendation Banner */}
      <div className={cn("mt-4 p-3 rounded-lg border text-sm flex items-start gap-2.5", theme.bgColor, theme.borderColor)}>
        <Zap className={cn("w-4 h-4 flex-shrink-0 mt-0.5", theme.textColor)} />
        <div>
          <span className="font-semibold text-slate-200 block mb-0.5">Recommended action</span>
          <span className="text-slate-300 leading-relaxed">{theme.recommendation}</span>
        </div>
      </div>
    </div>
  );
};
