import React, { useEffect, useRef, useState, useMemo } from "react";
import { Play, Pause, RotateCcw, Mic, Radio } from "lucide-react";
import { cn } from "../lib/utils";

interface WaveformVisualizerProps {
  audioUrl?: string;
  backendUrl: string;
  alertMessage?: string;
  severity?: "LOW" | "MEDIUM" | "HIGH";
  autoPlay?: boolean;
}

export const WaveformVisualizer: React.FC<WaveformVisualizerProps> = ({
  audioUrl,
  backendUrl,
  alertMessage = "Audio alert is ready.",
  severity = "MEDIUM",
  autoPlay = true,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [heights, setHeights] = useState<number[]>(() => Array.from({ length: 32 }, () => 4));
  const [audioError, setAudioError] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number>(0);
  const frameRef = useRef<number>(0);

  // Derive stable full audio URL (memoized to prevent infinite loop re-renders)
  const fullAudioUrl = useMemo(() => {
    if (!audioUrl || audioUrl.trim() === "") return undefined;
    return audioUrl.startsWith("http")
      ? audioUrl
      : `${backendUrl}${audioUrl.startsWith("/") ? "" : "/"}${audioUrl}`;
  }, [audioUrl, backendUrl]);

  // Severity color mapping
  const severityColors = {
    LOW: {
      bar: "bg-emerald-400",
      glow: "shadow-[0_0_8px_rgba(52,211,153,0.8)]",
      badge: "text-emerald-400 border-emerald-500/30 bg-emerald-950/40",
      accent: "text-emerald-400",
      border: "border-emerald-500/30",
    },
    MEDIUM: {
      bar: "bg-amber-400",
      glow: "shadow-[0_0_8px_rgba(251,191,36,0.8)]",
      badge: "text-amber-400 border-amber-500/30 bg-amber-950/40",
      accent: "text-amber-400",
      border: "border-amber-500/30",
    },
    HIGH: {
      bar: "bg-rose-500",
      glow: "shadow-[0_0_10px_rgba(244,63,94,0.9)]",
      badge: "text-rose-400 border-rose-500/40 bg-rose-950/50",
      accent: "text-rose-400",
      border: "border-rose-500/40",
    },
  }[severity];

  // Animate waveform bars
  useEffect(() => {
    if (!isPlaying) {
      setHeights(Array.from({ length: 32 }, () => 6));
      cancelAnimationFrame(rafRef.current);
      return;
    }

    function animate() {
      frameRef.current++;
      const f = frameRef.current;
      const min = 8;
      const max = 46;

      setHeights(
        Array.from({ length: 32 }, (_, i) => {
          const wave1 = Math.sin(f * 0.08 + i * 0.45) * 0.5 + 0.5;
          const wave2 = Math.sin(f * 0.14 + i * 0.25 + 1.8) * 0.35 + 0.35;
          const noise = Math.random() * 0.25;
          const combined = Math.min(1, (wave1 + wave2 + noise) / 1.5);
          return min + (max - min) * combined;
        })
      );
      rafRef.current = requestAnimationFrame(animate);
    }

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying]);

  // Audio source change & autoPlay trigger
  useEffect(() => {
    setAudioError(false);

    if (!fullAudioUrl) {
      if (autoPlay && alertMessage) {
        
      }
      return;
    }

    if (audioRef.current) {
      audioRef.current.load();
      if (autoPlay) {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              setIsPlaying(true);
              setAudioError(false);
            })
            .catch(() => {
              // Browser policy fallback or network error
              setAudioError(true);
            
            });
        }
      }
    }
  }, [fullAudioUrl, autoPlay, alertMessage]);

  // const tryWebSpeechFallback = () => {
  //   if ("speechSynthesis" in window && alertMessage) {
  //     window.speechSynthesis.cancel();
  //     const utterance = new SpeechSynthesisUtterance(alertMessage);
  //     utterance.rate = 1.0;
  //     utterance.pitch = 1.05;
  //     utterance.onstart = () => setIsPlaying(true);
  //     utterance.onend = () => setIsPlaying(false);
  //     utterance.onerror = () => setIsPlaying(false);
  //     window.speechSynthesis.speak(utterance);
  //   }
  // };

  const handlePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play()
          .then(() => setIsPlaying(true))
          .catch((err) => console.error("S3 Audio Play Error:", err));
      }
    }
  };

  const handleReplay = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch((err) => console.error("S3 Audio Replay Error:", err));
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl glass-panel border border-slate-800/80 p-5 shadow-2xl">
    
{/* Audio Element */}
      {fullAudioUrl && (
        <audio
          ref={audioRef}
          src={fullAudioUrl}
          preload="auto"
          crossOrigin="anonymous"
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onEnded={() => setIsPlaying(false)}
          onError={(e) => {
            console.error("Audio Load Error on URL:", fullAudioUrl, e);
          }}
        />
      )}

      {/* Card Header */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-800/60">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-slate-900 border border-slate-700 flex items-center justify-center">
            <Mic className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-100">
                Audio alert
              </h3>
            </div>
            <p className="text-xs text-slate-400">
              Generated from the hazard assessment
            </p>
          </div>
        </div>

        {/* Live Broadcast Status Badge */}
        <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border", severityColors.badge)}>
          <Radio className={cn("w-3 h-3", isPlaying ? "animate-spin text-pink-400" : "opacity-40")} />
          <span>{isPlaying ? "Playing" : "Ready"}</span>
        </div>
      </div>

      {/* Audio waveform display */}
      <div className="relative z-10 my-3 rounded-xl bg-slate-950/90 border border-slate-800 p-4 backdrop-blur-md">
        <div className="flex items-end justify-center gap-1 sm:gap-1.5 h-14 sm:h-16 px-2">
          {heights.map((h, idx) => (
            <div
              key={idx}
              className={cn(
                "w-1 sm:w-1.5 rounded-t-sm transition-all duration-75",
                severityColors.bar,
                isPlaying && severityColors.glow
              )}
              style={{
                height: `${Math.max(4, h)}px`,
                opacity: isPlaying ? 0.45 + (h / 50) * 0.55 : 0.25,
              }}
            />
          ))}
        </div>

        {/* Scrubber & Duration */}
        {duration > 0 && (
          <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>{Math.floor(currentTime)}s</span>
            <div className="flex-1 mx-3 h-1 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-pink-500 rounded-full transition-all duration-100"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              />
            </div>
            <span>{Math.floor(duration)}s</span>
          </div>
        )}
      </div>

      {/* Alert text */}
      <div className="relative z-10 mt-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
        <div className="text-xs font-medium text-slate-400 mb-1">Alert text</div>
        <p className="text-slate-200 leading-relaxed bg-slate-950/40 p-2.5 rounded-md border border-slate-800/40">
          "{alertMessage}"
        </p>
        {audioError && (
          <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-950/30 px-2.5 py-1.5 text-[10px] font-mono text-amber-200">
            Audio playback is unavailable. Check the connection or try again.
          </div>
        )}
      </div>

      {/* Audio Playback Controls */}
      <div className="relative z-10 mt-4 flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          {/* Main Play / Pause Button */}
          <button
            onClick={handlePlayPause}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
              isPlaying
                ? "bg-cyan-600 hover:bg-cyan-500 text-white"
                : "bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700"
            )}
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Play</span>
              </>
            )}
          </button>

          {/* Replay button */}
          <button
            onClick={handleReplay}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-md text-sm font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Replay</span>
          </button>
        </div>
      </div>
    </div>
  );
};
