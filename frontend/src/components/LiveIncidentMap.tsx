import React, { useEffect, useRef, useState } from "react";
import { MapPin, Crosshair, ShieldAlert, Layers } from "lucide-react";
import L from "leaflet";
import type { HazardAnalysisResult } from "../types";
import { cn } from "../lib/utils";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const TILE_CONFIG = {
  "mapbox-dark": {
    url: `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`,
    subdomains: "abcd",
    tileSize: 512,
    zoomOffset: -1,
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.mapbox.com/about/maps">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  osm: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    subdomains: "abc",
    tileSize: 256,
    zoomOffset: 0,
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
};

interface LiveIncidentMapProps {
  theme: "dark" | "light";
  currentResult: HazardAnalysisResult | null;
  location: { lat: number; lng: number; address?: string };
  onUpdateLocation?: (lat: number, lng: number) => void;
}

export const LiveIncidentMap: React.FC<LiveIncidentMapProps> = ({
  theme,
  currentResult,
  location,
  onUpdateLocation,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const activeMapStyleRef = useRef<"mapbox-dark" | "osm">(theme === "light" ? "osm" : "mapbox-dark");
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  const [manualMapStyle, setManualMapStyle] = useState<"mapbox-dark" | "osm" | null>(null);
  const mapStyle = manualMapStyle ?? (theme === "light" ? "osm" : "mapbox-dark");

  useEffect(() => {
    if (activeMapStyleRef.current === mapStyle || !mapInstanceRef.current || !tileLayerRef.current) return;

    mapInstanceRef.current.removeLayer(tileLayerRef.current);
    const config = TILE_CONFIG[mapStyle];
    tileLayerRef.current = L.tileLayer(config.url, {
      maxZoom: config.maxZoom,
      subdomains: config.subdomains,
      tileSize: config.tileSize,
      zoomOffset: config.zoomOffset,
    }).addTo(mapInstanceRef.current);
    activeMapStyleRef.current = mapStyle;
  }, [mapStyle]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Create map instance
      const map = L.map(mapContainerRef.current, {
        center: [location.lat, location.lng],
        zoom: 14,
        zoomControl: false,
        attributionControl: false,
      });

      // Add default tile layer
      const config = TILE_CONFIG[mapStyle];
      const layer = L.tileLayer(config.url, {
        maxZoom: config.maxZoom,
        subdomains: config.subdomains,
        tileSize: config.tileSize,
        zoomOffset: config.zoomOffset,
      }).addTo(map);

      tileLayerRef.current = layer;
      activeMapStyleRef.current = mapStyle;

      // Add Zoom control at top-right
      L.control.zoom({ position: "topright" }).addTo(map);

      mapInstanceRef.current = map;
    } else {
      mapInstanceRef.current.setView([location.lat, location.lng], 14, { animate: true });
    }

    // Custom Glowing Hazard Icon
    const getPinColor = () => {
      if (!currentResult) return "#06b6d4";
      if (currentResult.severity === "HIGH") return "#f43f5e";
      if (currentResult.severity === "MEDIUM") return "#f59e0b";
      if (currentResult.severity === "N/A") return "#f59e0b";
      return "#10b981";
    };

    const pinColor = getPinColor();

    const customIcon = L.divIcon({
      className: "custom-cyber-marker",
      html: `
        <div style="position: relative; display: flex; align-items: center; justify-content: center;">
          <div style="
            position: absolute;
            width: 34px;
            height: 34px;
            border-radius: 50%;
            background-color: ${pinColor};
            opacity: 0.2;
          "></div>
          <div style="
            position: relative;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background-color: #030712;
            border: 2px solid ${pinColor};
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <div style="width: 8px; height: 8px; border-radius: 50%; background-color: ${pinColor};"></div>
          </div>
        </div>
      `,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });

    // Update marker
    if (markerRef.current) {
      markerRef.current.setLatLng([location.lat, location.lng]);
      markerRef.current.setIcon(customIcon);
    } else {
      const marker = L.marker([location.lat, location.lng], { icon: customIcon }).addTo(
        mapInstanceRef.current
      );
      markerRef.current = marker;
    }

    // Update hazard radius zone circle
    if (circleRef.current) {
      circleRef.current.setLatLng([location.lat, location.lng]);
      circleRef.current.setStyle({
        color: pinColor,
        fillColor: pinColor,
        fillOpacity: 0.15,
      });
    } else {
      const circle = L.circle([location.lat, location.lng], {
        radius: 350,
        color: pinColor,
        fillColor: pinColor,
        fillOpacity: 0.15,
        weight: 1.5,
        dashArray: "4, 6",
      }).addTo(mapInstanceRef.current);
      circleRef.current = circle;
    }

    // Bind popup
    if (markerRef.current) {
      const popupContent = `
        <div style="padding: 4px; font-family: monospace;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
            <strong style="color: ${pinColor}; font-size: 11px;">
              ${currentResult
                ? currentResult.severity === "N/A"
                  ? "UNCONFIRMED · MANUAL CHECK"
                  : `${currentResult.severity} HAZARD`
                : "CURRENT LOCATION"}
            </strong>
            <span style="font-size: 9px; color: #94a3b8;">${new Date().toLocaleTimeString()}</span>
          </div>
          <p style="font-size: 10px; color: #cbd5e1; margin: 0;">
            ${currentResult ? (currentResult.alert_message ?? "Road image analyzed.") : "Current map location."}
          </p>
          <div style="font-size: 9px; color: #64748b; margin-top: 4px;">
            ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}
          </div>
        </div>
      `;
      markerRef.current.bindPopup(popupContent);
    }

    // Force size recalc on window resize / tab visibility
    setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 200);
  }, [location, currentResult, mapStyle]);

  // Handle tile style switch
  const handleToggleStyle = () => {
    const nextStyle = mapStyle === "mapbox-dark" ? "osm" : "mapbox-dark";
    setManualMapStyle(nextStyle);
  };

  const handleCenterUser = () => {
    if (navigator.geolocation && onUpdateLocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          onUpdateLocation(pos.coords.latitude, pos.coords.longitude);
        },
        (err) => {
          console.warn("Geolocation denied, using mock incident offset", err);
          onUpdateLocation(location.lat + 0.003, location.lng + 0.003);
        }
      );
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl glass-panel border border-slate-800 p-5 shadow-2xl space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-slate-100 tracking-wide">
            Incident location
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {/* Tile Layer Switcher */}
          <button
            onClick={handleToggleStyle}
            title={mapStyle === "mapbox-dark" ? "Switch to OpenStreetMap" : "Switch to Mapbox"}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 text-xs text-cyan-300 border border-slate-800 transition-colors"
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>{mapStyle === "mapbox-dark" ? "Mapbox" : "OpenStreetMap"}</span>
          </button>

          <span className="text-xs text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
            {Math.abs(location.lat).toFixed(4)}° {location.lat >= 0 ? "N" : "S"}, {Math.abs(location.lng).toFixed(4)}° {location.lng >= 0 ? "E" : "W"}
          </span>
          <button
            onClick={handleCenterUser}
            title="Recenter GPS Position"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 transition-colors"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Interactive Leaflet Map Container */}
      <div className="relative rounded-xl overflow-hidden border border-slate-800/80 bg-slate-950">
        <div ref={mapContainerRef} className="h-64 sm:h-72 w-full z-10" />

        {/* Hazard summary overlay */}
        {currentResult && (
          <div className="absolute bottom-3 left-3 right-3 z-20 bg-slate-950/90 backdrop-blur-md p-2.5 rounded-xl border border-slate-800 flex items-center justify-between gap-2 text-xs font-mono">
            <div className="flex items-center gap-2 truncate">
              <ShieldAlert className={cn(
                "w-4 h-4 flex-shrink-0",
                currentResult.severity === "HIGH" ? "text-rose-400" : currentResult.severity === "MEDIUM" || currentResult.severity === "N/A" ? "text-amber-400" : "text-emerald-400"
              )} />
              <span className="text-slate-200 truncate font-semibold">
                {currentResult.detected_hazards.length > 0
                  ? `Reported hazards: ${currentResult.detected_hazards.join(", ")}`
                  : currentResult.severity === "N/A"
                    ? "Hazard status unconfirmed — inspect manually"
                    : "No supported hazards detected"}
              </span>
            </div>
            <span className={cn(
              "px-2 py-0.5 rounded text-[10px] font-bold flex-shrink-0",
              currentResult.severity === "HIGH" ? "bg-rose-950 text-rose-300 border border-rose-500/40" : currentResult.severity === "N/A" ? "bg-amber-950 text-amber-300 border border-amber-500/40" : "bg-cyan-950 text-cyan-300 border border-cyan-500/40"
            )}>
              {currentResult.risk_score === null ? "UNCONFIRMED" : `${currentResult.risk_score} HAZARD SCORE`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
