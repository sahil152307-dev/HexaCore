import React, { useState } from "react";
import { X, Copy, Check, Terminal, Cpu, Database, Volume2, ShieldCheck } from "lucide-react";
import type { HazardAnalysisResult, BackendStatus } from "../types";

interface ApiInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  backendUrl: string;
  onUpdateBackendUrl: (url: string) => void;
  lastResponse: HazardAnalysisResult | null;
  backendStatus: BackendStatus;
  onTestConnection: () => void;
}

export const ApiInspectorModal: React.FC<ApiInspectorModalProps> = ({
  isOpen,
  onClose,
  backendUrl,
  onUpdateBackendUrl,
  lastResponse,
  backendStatus,
  onTestConnection,
}) => {
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [inputUrl, setInputUrl] = useState(backendUrl);

  if (!isOpen) return null;

  const sampleCurl = `curl -X POST "${backendUrl}/api/analyze-hazard" \\
  -H "accept: application/json" \\
  -H "Content-Type: multipart/form-data" \\
  -F "file=@road_hazard.jpg"`;

  const handleCopyJson = () => {
    if (lastResponse) {
      navigator.clipboard.writeText(JSON.stringify(lastResponse, null, 2));
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    }
  };

  const handleCopyCurl = () => {
    navigator.clipboard.writeText(sampleCurl);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  const handleSaveUrl = () => {
    onUpdateBackendUrl(inputUrl);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl glass-panel border border-cyan-500/40 p-6 shadow-2xl space-y-6">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-950/80 border border-cyan-500/40">
              <Terminal className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">
                AlertBuzzer · API details
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Backend connection and latest response
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* AWS Architecture Diagram Flow */}
        <div className="space-y-2">
          <label className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider block">
            Analysis flow
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-center font-mono text-[11px]">
            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-cyan-500/30">
              <Cpu className="w-4 h-4 text-cyan-400 mx-auto mb-1" />
              <div className="font-semibold text-slate-200">Image upload</div>
              <div className="text-slate-400 text-[10px]">Image file</div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-cyan-500/30">
              <Database className="w-4 h-4 text-cyan-400 mx-auto mb-1" />
              <div className="font-semibold text-slate-200">Label detection</div>
              <div className="text-slate-400 text-[10px]">Amazon Rekognition</div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-amber-500/30">
              <ShieldCheck className="w-4 h-4 text-amber-400 mx-auto mb-1" />
              <div className="font-semibold text-slate-200">Hazard severity score</div>
              <div className="text-slate-400 text-[10px]">Hazard assessment</div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-pink-500/30">
              <Volume2 className="w-4 h-4 text-pink-400 mx-auto mb-1" />
              <div className="font-bold text-slate-200">4. AWS Polly</div>
              <div className="text-slate-400 text-[10px]">Raveena Voice MP3</div>
            </div>
          </div>
        </div>

        {/* Backend URL Configuration */}
        <div className="space-y-2">
          <label className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
            <span>FastAPI Backend Target URL:</span>
            <span className={backendStatus.online ? "text-emerald-400" : "text-amber-400"}>
              Status: {backendStatus.online ? "ONLINE (Connected)" : "OFFLINE (Using Client Engine)"}
            </span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="http://127.0.0.1:8000"
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 font-mono text-xs focus:outline-none focus:border-cyan-400"
            />
            <button
              onClick={handleSaveUrl}
              className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-bold transition-colors"
            >
              Apply
            </button>
            <button
              onClick={onTestConnection}
              className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 font-mono text-xs transition-colors"
            >
              Ping / Test
            </button>
          </div>
        </div>

        {/* Live Payload JSON Viewer */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider">
              Last Ingestion Response JSON Payload:
            </label>
            {lastResponse && (
              <button
                onClick={handleCopyJson}
                className="flex items-center gap-1 text-[11px] font-mono text-cyan-400 hover:text-cyan-300"
              >
                {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedJson ? "Copied" : "Copy Payload"}</span>
              </button>
            )}
          </div>
          <pre className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-cyan-300 font-mono text-xs overflow-x-auto max-h-48">
            {lastResponse
              ? JSON.stringify(lastResponse, null, 2)
              : "// No analysis executed yet. Run an image scan to inspect raw JSON."}
          </pre>
        </div>

        {/* Curl Command Example */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider">
              CLI / cURL Terminal Equivalent:
            </label>
            <button
              onClick={handleCopyCurl}
              className="flex items-center gap-1 text-[11px] font-mono text-cyan-400 hover:text-cyan-300"
            >
              {copiedCurl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCurl ? "Copied" : "Copy Command"}</span>
            </button>
          </div>
          <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 font-mono text-xs overflow-x-auto">
            {sampleCurl}
          </pre>
        </div>
      </div>
    </div>
  );
};
