"use client";
import { useEffect, useState, useRef, useMemo } from "react";
import { useAISStream } from "@/hooks/useAISStream";

const S = {
  bg: "#0A0E14", mid: "#0C1118", card: "#0F1520",
  border: "rgba(255,255,255,0.06)",
  text: "#E8EDF2", muted: "rgba(255,255,255,0.25)",
  green: "#1D9E75", red: "#E24B4A", amber: "#D97706",
};

const scoreColor = (s: number) =>
  s >= 90 ? S.red : s >= 80 ? S.amber : s >= 70 ? "#FACC15" : S.green;

const scoreLabel = (s: number) =>
  s >= 90 ? "Critical" : s >= 80 ? "High" : s >= 70 ? "Medium" : "Low";

export default function MapView() {
  const { vessels, connected, messageCount } = useAISStream();
  const mapRef        = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const leafletRef    = useRef<any>(null);
  const markersRef    = useRef<Map<string, any>>(new Map());
  const [selected, setSelected] = useState<typeof vessels[0] | null>(null);
  const [minScore, setMinScore]  = useState(50);
  const [typeFilter, setTypeFilter] = useState("All");
  const [mapReady, setMapReady]  = useState(false);

  const filtered = useMemo(() =>
    vessels
      .filter(v => v.score >= minScore && (typeFilter === "All" || v.typeLabel === typeFilter))
      .slice(0, 300),
    [vessels, minScore, typeFilter]
  );

  // Init Leaflet once
  useEffect(() => {
    if (typeof window === "undefined" || mapInstanceRef.current || !mapRef.current) return;
    import("leaflet").then(L => {
      if (mapInstanceRef.current) return;
      leafletRef.current = L;
      const map = L.map(mapRef.current!, { center: [20, 40], zoom: 3, zoomControl: true });
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        { attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', subdomains: "abcd", maxZoom: 18 }
      ).addTo(map);
      mapInstanceRef.current = map;
      setMapReady(true);
    });
    return () => { mapInstanceRef.current?.remove(); mapInstanceRef.current = null; };
  }, []);

  // Update markers
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapInstanceRef.current;
    if (!map || !mapReady || !L) return;

    const current = new Set(filtered.map(v => v.mmsi));
    markersRef.current.forEach((marker, mmsi) => {
      if (!current.has(mmsi)) { map.removeLayer(marker); markersRef.current.delete(mmsi); }
    });

    filtered.forEach(v => {
      const color = scoreColor(v.score);
      const size  = v.score >= 90 ? 14 : v.score >= 80 ? 11 : 9;
      const icon  = L.divIcon({
        html: `<div style="width:${size}px;height:${size}px;background:${color};border:2px solid rgba(0,0,0,0.4);border-radius:50%;box-shadow:0 0 ${v.score>=80?8:4}px ${color}99;cursor:pointer;"></div>`,
        className: "", iconSize: [size, size], iconAnchor: [size/2, size/2],
      });
      if (markersRef.current.has(v.mmsi)) {
        markersRef.current.get(v.mmsi).setLatLng([v.lat, v.lon]).setIcon(icon);
      } else {
        const marker = L.marker([v.lat, v.lon], { icon });
        marker.on("click", () => setSelected(v));
        marker.bindTooltip(v.name, { permanent: false, direction: "top" });
        marker.addTo(map);
        markersRef.current.set(v.mmsi, marker);
      }
    });
  }, [filtered, mapReady]);

  return (
    <div style={{ background: S.bg, color: S.text, display: "flex", height: "calc(100vh - 94px)", fontFamily: "Inter, sans-serif" }}>
      <style>{`
        .leaflet-tooltip { background: #0F1520 !important; border: 1px solid rgba(255,255,255,0.1) !important; color: #E8EDF2 !important; font-size: 11px !important; font-family: monospace !important; border-radius: 4px !important; }
        .leaflet-tooltip-top:before { border-top-color: rgba(255,255,255,0.1) !important; }
        .leaflet-control-attribution { background: rgba(10,14,20,0.85) !important; color: rgba(255,255,255,0.2) !important; font-size: 9px !important; }
        .leaflet-control-attribution a { color: rgba(255,255,255,0.3) !important; }
        .leaflet-control-zoom a { background: #0C1118 !important; color: #E8EDF2 !important; border-color: rgba(255,255,255,0.08) !important; }
        .leaflet-control-zoom a:hover { background: #0F1520 !important; }
      `}</style>

      {/* SIDEBAR */}
      <aside style={{ width: 200, background: S.mid, borderRight: `1px solid ${S.border}`, padding: 20, flexShrink: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* AIS status */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: connected ? S.green : S.amber, flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: connected ? S.green : S.amber, letterSpacing: "0.1em", textTransform: "uppercase" as const }}>
            {connected ? "Live AIS" : "Connecting"}
          </span>
        </div>

        {/* Score filter */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: S.muted, textTransform: "uppercase" as const }}>Min Score</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: S.green }}>{minScore}+</span>
          </div>
          <input type="range" min={0} max={90} step={5} value={minScore}
            onChange={e => setMinScore(Number(e.target.value))}
            style={{ width: "100%", accentColor: S.green }} />
        </div>

        {/* Type filter */}
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: S.muted, textTransform: "uppercase" as const, marginBottom: 8 }}>Type</div>
          {["All", "Cargo", "Tanker", "Special", "Fishing", "Other"].map(t => (
            <button key={t} onClick={() => setTypeFilter(t)} style={{
              display: "block", width: "100%", textAlign: "left" as const,
              background: typeFilter === t ? "rgba(29,158,117,0.1)" : "transparent",
              border: `1px solid ${typeFilter === t ? "rgba(29,158,117,0.25)" : "transparent"}`,
              borderRadius: 4, padding: "5px 10px",
              color: typeFilter === t ? S.green : "rgba(255,255,255,0.3)",
              fontSize: 11, cursor: "pointer", marginBottom: 2, fontFamily: "Inter, sans-serif",
              letterSpacing: "0.04em",
            }}>{t}</button>
          ))}
        </div>

        {/* Legend */}
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: S.muted, textTransform: "uppercase" as const, marginBottom: 10 }}>Legend</div>
          {[["Critical 90+", S.red], ["High 80+", S.amber], ["Medium 70+", "#FACC15"], ["Low <70", S.green]].map(([l, c]) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: c, boxShadow: `0 0 5px ${c}88`, flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{l}</span>
            </div>
          ))}
        </div>

        {/* Stats */}
        <div style={{ borderTop: `1px solid ${S.border}`, paddingTop: 16 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: S.muted, textTransform: "uppercase" as const, marginBottom: 10 }}>Stats</div>
          {[
            ["Tracked",    vessels.length],
            ["Showing",    filtered.length],
            ["Critical",   vessels.filter(v => v.score >= 90).length],
            ["High",       vessels.filter(v => v.score >= 80).length],
            ["Idle",       vessels.filter(v => v.status === "Idle").length],
            ["Messages",   messageCount.toLocaleString()],
          ].map(([l, v]) => (
            <div key={String(l)} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>{l}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: S.text }}>{v}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* MAP */}
      <div style={{ flex: 1, position: "relative" }}>
        <div ref={mapRef} style={{ width: "100%", height: "100%" }} />

        {vessels.length === 0 && (
          <div style={{
            position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
            background: "rgba(10,14,20,0.92)", border: `1px solid ${S.border}`,
            borderRadius: 8, padding: "10px 20px", zIndex: 400,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: connected ? S.green : S.amber }} />
            <span style={{ fontSize: 11, color: S.text, fontFamily: "monospace", letterSpacing: "0.06em" }}>
              {connected ? "Connected — receiving vessel data..." : "Connecting to AIS stream..."}
            </span>
          </div>
        )}
      </div>

      {/* DETAIL PANEL */}
      {selected && (
        <aside style={{ width: 260, background: S.mid, borderLeft: `1px solid ${S.border}`, padding: 20, overflowY: "auto", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: S.muted, textTransform: "uppercase" as const }}>Live Vessel</span>
            <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: S.muted, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
          </div>

          <div style={{ fontSize: 14, fontWeight: 700, color: S.text, marginBottom: 4, letterSpacing: "-0.3px" }}>{selected.name}</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginBottom: 16, fontFamily: "monospace" }}>MMSI {selected.mmsi} · {selected.typeLabel}</div>

          {/* Score */}
          <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 8, padding: "14px 16px", marginBottom: 10, textAlign: "center" as const }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: S.muted, textTransform: "uppercase" as const, marginBottom: 6 }}>Scrap Score</div>
            <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-1.5px", color: scoreColor(selected.score), lineHeight: 1 }}>{selected.score}</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: scoreColor(selected.score), marginTop: 4 }}>{scoreLabel(selected.score)}</div>
            <div style={{ marginTop: 10, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${selected.score}%`, background: scoreColor(selected.score), borderRadius: 2 }} />
            </div>
          </div>

          {/* Live data */}
          <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 8, padding: "14px 16px", marginBottom: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: S.muted, textTransform: "uppercase" as const, marginBottom: 10 }}>Live Data</div>
            {[
              ["Position",    `${selected.lat.toFixed(3)}°, ${selected.lon.toFixed(3)}°`],
              ["Speed",       `${selected.speed.toFixed(1)} kn`],
              ["Course",      `${selected.course.toFixed(0)}°`],
              ["Status",      selected.status],
              ["Length",      selected.length ? `${selected.length}m` : "—"],
              ["Draught",     selected.draught ? `${selected.draught}m` : "—"],
              ["Destination", selected.destination || "—"],
            ].map(([l, v]) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, gap: 8 }}>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>{l}</span>
                <span style={{ fontSize: 10, fontWeight: 500, color: S.text, textAlign: "right" as const }}>{v}</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => window.location.href = `mailto:ardavcioglu@gmail.com?subject=Vessel%20Inquiry%20%E2%80%94%20${encodeURIComponent(selected.name)}&body=MMSI%3A%20${selected.mmsi}%0AType%3A%20${selected.typeLabel}%0AScrap%20Score%3A%20${selected.score}%2F100%0A%0AWe%20are%20interested%20in%20this%20vessel.%20Please%20advise%20on%20availability.`}
            style={{ width: "100%", background: S.green, border: "none", borderRadius: 6, padding: "10px", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: "0.06em" }}>
            DRAFT OFFER EMAIL →
          </button>
        </aside>
      )}
    </div>
  );
}
