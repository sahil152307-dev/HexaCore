import React, { useState, useRef, useCallback } from "react";
import { 
  UploadCloud, 
  Camera, 
  Image as ImageIcon, 
  X, 
  Scan, 
  RefreshCcw,
  CheckCircle,
  FileSearch,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { cn } from "../lib/utils";

interface HazardDropzoneProps {
  imageFile: File | null;
  previewUrl: string | null;
  loading: boolean;
  onSelectImage: (file: File, preview: string) => void;
  onClearImage: () => void;
  onAnalyze: () => void;
  hasResult: boolean;
}

export const HazardDropzone: React.FC<HazardDropzoneProps> = ({
  imageFile,
  previewUrl,
  loading,
  onSelectImage,
  onClearImage,
  onAnalyze,
  hasResult,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Drag and Drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.type.startsWith("image/")) {
          const preview = URL.createObjectURL(file);
          onSelectImage(file, preview);
        }
      }
    },
    [onSelectImage]
  );

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const preview = URL.createObjectURL(file);
      onSelectImage(file, preview);
    }
  };

  // Webcam Capture functionality
  const startCamera = async () => {
    setCameraError(null);
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err: any) {
      console.warn("Camera access failed:", err);
      setCameraError("Camera unavailable or permission denied. Upload a JPEG or PNG image instead.");
      setTimeout(() => {
        setIsCameraActive(false);
      }, 1500);
    }
  };

  const captureCameraPhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `live_capture_${Date.now()}.jpg`, { type: "image/jpeg" });
          const preview = URL.createObjectURL(file);
          stopCamera();
          onSelectImage(file, preview);
        }
      }, "image/jpeg", 0.9);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  return (
    <div className="space-y-4">
      {/* Dropzone Container Card */}
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl glass-panel border transition-all duration-300 p-6 sm:p-8 min-h-96",
          isDragging
            ? "border-cyan-400 bg-cyan-950/40 shadow-[0_0_35px_rgba(6,182,212,0.4)] scale-[1.008]"
            : "border-slate-800 hover:border-slate-700"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,.jpg,.jpeg,.png"
          className="hidden"
          onChange={handleFileInputChange}
        />

        {/* View Mode 1: Live Webcam Viewfinder */}
        {isCameraActive ? (
          <div className="relative rounded-xl overflow-hidden bg-black border border-cyan-500/50 shadow-[0_0_25px_rgba(6,182,212,0.3)]">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-80 sm:h-96 object-cover"
            />
            {/* HUD Viewfinder Grid */}
            <div className="absolute inset-0 pointer-events-none border-2 border-cyan-400/30 flex items-center justify-center">
              <div className="absolute top-4 left-4 text-xs text-white bg-black/60 px-2.5 py-1 rounded">
                Camera preview
              </div>
            </div>

            {cameraError && (
              <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-4 text-center text-amber-300 text-sm font-mono">
                {cameraError}
              </div>
            )}

            {/* Camera Action Toolbar */}
            <div className="absolute bottom-4 inset-x-0 flex items-center justify-center gap-3 z-20">
              <button
                onClick={captureCameraPhoto}
                className="flex items-center gap-2 px-5 py-2.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-sm transition-colors"
              >
                <Camera className="w-4 h-4" />
                Capture Road Hazard Snapshot
              </button>
              <button
                onClick={stopCamera}
                className="px-4 py-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 text-xs font-mono border border-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : previewUrl ? (
          /* Uploaded image preview */
          <div className="space-y-5">
            <div
              className={cn(
                "relative rounded-xl overflow-hidden border border-cyan-500/30 bg-slate-950 transition-[height] duration-200",
                isPreviewExpanded ? "h-[min(65vh,42rem)]" : "h-28"
              )}
            >
              <img
                src={previewUrl}
                alt="Road Analysis Preview"
                className="w-full h-full object-contain"
              />

              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-3 left-3 flex items-center gap-2 bg-slate-950/80 px-3 py-1 rounded-md text-xs text-slate-200">
                  <Scan className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                  <span className="max-w-[min(60vw,28rem)] truncate">{imageFile ? imageFile.name : "Selected image"}</span>
                </div>

                {hasResult && !loading && (
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-emerald-950/90 border border-emerald-500/50 px-3 py-1 rounded-md text-emerald-300 text-xs">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Analysis complete</span>
                  </div>
                )}
              </div>

              <button
                onClick={() => setIsPreviewExpanded((expanded) => !expanded)}
                disabled={loading}
                title={isPreviewExpanded ? "Minimize image preview" : "Maximize image preview"}
                aria-label={isPreviewExpanded ? "Minimize image preview" : "Maximize image preview"}
                className="absolute top-3 right-3 p-2 rounded-md bg-slate-950/80 hover:bg-slate-800 text-slate-200 border border-slate-700 backdrop-blur-md transition-colors disabled:opacity-50"
              >
                {isPreviewExpanded ? (
                  <Minimize2 className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Maximize2 className="w-4 h-4" aria-hidden="true" />
                )}
              </button>

              {/* Clear Image Button */}
              <button
                onClick={onClearImage}
                disabled={loading}
                title="Remove image"
                className="absolute bottom-3 right-3 p-2 rounded-xl bg-slate-950/80 hover:bg-rose-950/90 text-slate-300 hover:text-rose-400 border border-slate-700 hover:border-rose-500/50 backdrop-blur-md transition-all shadow-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Main Action Trigger: Analyze Button */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <button
                onClick={onAnalyze}
                disabled={loading}
                className={cn(
                  "relative flex-1 w-full flex items-center justify-center gap-3 px-5 py-3 rounded-md font-medium text-sm transition-colors",
                  loading
                    ? "bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700"
                    : "bg-cyan-600 hover:bg-cyan-500 text-white"
                )}
              >
                {loading ? (
                  <>
                    <RefreshCcw className="w-5 h-5 text-cyan-400 animate-spin" />
                    <span>Analyzing image...</span>
                  </>
                ) : (
                  <>
                    <span>Analyze image</span>
                  </>
                )}
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="w-full sm:w-auto px-4 py-3 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <ImageIcon className="w-4 h-4 text-cyan-400" />
                <span>Replace Image</span>
              </button>
            </div>
          </div>
        ) : (
          /* View Mode 3: Empty Dropzone State */
          <div className="flex flex-col items-center justify-center text-center py-8 sm:py-12 space-y-4">
            <div className="relative">
              <div className="w-14 h-14 rounded-md bg-slate-900 border border-slate-700 flex items-center justify-center">
                <UploadCloud className="w-7 h-7 text-cyan-400" />
              </div>
            </div>

            <div className="space-y-1 max-w-md">
              <h3 className="text-lg font-semibold text-white tracking-tight">
                Choose a road image
              </h3>
              <p className="text-sm text-slate-400">
                        JPEG or PNG, up to 4 MB. Drag a file here or browse your device.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-sm transition-colors"
              >
                <FileSearch className="w-4 h-4" />
                Browse files
              </button>

              <button
                onClick={startCamera}
                className="flex items-center gap-2 px-4 py-2.5 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 hover:border-cyan-500/50 text-sm transition-colors"
              >
                <Camera className="w-4 h-4 text-cyan-400" />
                Use camera
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};
