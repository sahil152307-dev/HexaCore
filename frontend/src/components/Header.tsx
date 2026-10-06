import React from "react";
import { 
  ShieldAlert, 
  Settings, 
  MapPin, 
  Volume2, 
  VolumeX,
  RefreshCw,
  Sun,
  Moon,
  ClipboardCheck,
} from "lucide-react";
import type { BackendStatus } from "../types";

interface HeaderProps {
  theme: "dark" | "light";
  onToggleTheme: () => void;
  backendStatus: BackendStatus;
  isDemoMode: boolean;
  setIsDemoMode: (val: boolean) => void;
  onOpenSettings: () => void;
  autoPlayAudio: boolean;
  setAutoPlayAudio: (val: boolean) => void;
  gpsActive: boolean;
  onToggleGps: () => void;
  onReset: () => void;
  isAdminPortal: boolean;
  onToggleAdminPortal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  theme,
  onToggleTheme,
  backendStatus,
  isDemoMode: _isDemoMode,
  setIsDemoMode: _setIsDemoMode,
  onOpenSettings,
  autoPlayAudio,
  setAutoPlayAudio,
  gpsActive,
  onToggleGps,
  onReset,
  isAdminPortal,
  onToggleAdminPortal,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-[#030712]/95 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-16 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
        <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto sm:flex-1">
          <div className="w-9 h-9 rounded-md bg-slate-900 border border-slate-700 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-white">AlertBuzzer</h1>
            <p className="text-xs text-slate-400">Road hazard monitoring</p>
          </div>
        </div>

        <div className="flex w-full items-center justify-between gap-1 sm:w-auto sm:justify-end sm:gap-2.5 lg:gap-4">
          <div className="hidden lg:flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs font-mono">
            <span className={`h-2 w-2 rounded-full ${backendStatus.online ? "bg-emerald-500" : "bg-amber-500"}`} />
            <span className={backendStatus.online ? 'text-slate-200' : 'text-amber-300'}>
              {backendStatus.online ? "Backend connected" : "Backend offline"}
            </span>
          </div>

          <button
            onClick={onToggleAdminPortal}
            title={isAdminPortal ? "Return to dashboard" : "Open admin review portal"}
            aria-label={isAdminPortal ? "Return to dashboard" : "Open admin review portal"}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 transition-colors hover:border-cyan-500/50 hover:text-cyan-300"
          >
            <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{isAdminPortal ? "Dashboard" : "Admin"}</span>
          </button>

          <button
            onClick={onToggleGps}
            title={gpsActive ? "GPS is active" : "Enable GPS"}
            aria-pressed={gpsActive}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border transition-colors ${
              gpsActive
                ? "bg-cyan-950/60 border-cyan-500/50 text-cyan-300"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            <MapPin className={`w-3.5 h-3.5 ${gpsActive ? "text-cyan-400" : "text-slate-500"}`} />
            <span className="hidden sm:inline">GPS</span>
            <span className="hidden sm:inline">{gpsActive ? "On" : "Off"}</span>
          </button>

          <button
            onClick={() => setAutoPlayAudio(!autoPlayAudio)}
            title={autoPlayAudio ? "Auto-play Polly Voice Alerts: Enabled" : "Auto-play Polly Voice Alerts: Muted"}
            aria-pressed={autoPlayAudio}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border transition-colors ${
              autoPlayAudio
                ? "bg-slate-900 border-slate-700 text-slate-200"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            {autoPlayAudio ? (
              <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-slate-500" />
            )}
            <span className="hidden sm:inline">Audio</span>
          </button>

          <button
            onClick={onToggleTheme}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            aria-pressed={theme === "light"}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-colors"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span className="hidden sm:inline text-xs">{theme === "dark" ? "Light" : "Dark"}</span>
          </button>

          <button
            onClick={onReset}
            title="Reset Dashboard"
            aria-label="Reset dashboard"
            className="p-2 rounded-md bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-cyan-300 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={onOpenSettings}
            title="Backend Settings & API Payloads"
            aria-label="Backend settings"
            className="p-2 rounded-md bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-cyan-300 transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
