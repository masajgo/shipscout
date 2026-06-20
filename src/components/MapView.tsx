"use client";
import { useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiVessel {
  mmsi:           string;
  name:           string;
  type:           string;
  speed:          string;
  course:         string;
  nav:            string;
  lat:            string;
  lon:            string;
  scrap_score:    string;
  scrap_category: string;
  ts:             string;
}

interface ApiCluster {
  lon:           number;
  lat:           number;
  count:         number;
  mmsis:         string[];
  maxScrapScore: number;
}

interface ApiResponse {
  type:      "vessels" | "clusters";
  source:    string;
  vessels?:  ApiVessel[];
  clusters?: ApiCluster[];
  total:     number;
}

interface VesselDetail {
  mmsi:          string;
  imo:           string | null;
  name:          string;
  callSign:      string | null;
  type:          string | null;
  position:      { lat: number; lon: number };
  speed:         number;
  course:        number;
  heading:       number | null;
  navStatus:     number;
  length:        number | null;
  beam:          number | null;
  draught:       number | null;
  destination:   string | null;
  eta:           string | null;
  builtYear:     number | null;
  scrapScore:    number;
  scrapCategory: string;
  scrapReasons:  string[];
  staticDataAge: number | null;
  updatedAt:     string | null;
}

interface ScrapCounts { critical: number; high: number; medium: number; low: number; }

interface ContactResult {
  company:           string;
  website:           string | null;
  emails:            string[];
  phones:            string[];
  address:           string | null;
  emailFormat:       string | null;
  linkedinSearchUrl: string;
  contactPath:       string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CLUSTER_ZOOM = 12;
const DEBOUNCE_MS  = 300;
const MAX_VESSELS  = 2000;

const S = {
  bg: "#0A0E14", mid: "#0C1118", card: "#0F1520",
  border: "rgba(255,255,255,0.06)",
  text: "#E8EDF2", muted: "rgba(255,255,255,0.25)",
  green: "#1D9E75",
};

const SCRAP_COLORS: Record<string, string> = {
  critical: "#EF4444",
  high:     "#F97316",
  medium:   "#F59E0B",
  low:      "#64748B",
};

const TYPE_COLORS: Record<string, string> = {
  cargo:     "#3B82F6",
  tanker:    "#F59E0B",
  passenger: "#10B981",
  fishing:   "#8B5CF6",
  tug:       "#F97316",
  sailing:   "#06B6D4",
  military:  "#EF4444",
  other:     "#64748B",
};

const NAV_STATUS: Record<number, string> = {
  0: "Underway", 1: "Anchored", 2: "Not under command",
  3: "Restricted", 5: "Moored", 6: "Aground", 7: "Fishing", 8: "Sailing",
};

function vesselColor(type = ""): string {
  const t = type.toLowerCase();
  for (const [k, v] of Object.entries(TYPE_COLORS)) {
    if (t.includes(k)) return v;
  }
  return TYPE_COLORS.other;
}

function markerColor(v: ApiVessel): string {
  const cat = v.scrap_category;
  if (cat && SCRAP_COLORS[cat] && cat !== "low") return SCRAP_COLORS[cat];
  return vesselColor(v.type);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
      <span style={{ fontSize: 10, color: S.muted, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 10, fontWeight: 500, color: S.text, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function field(val: string | number | null | undefined, unit = ""): string {
  return (val != null && val !== "" && val !== 0) ? `${val}${unit}` : "—";
}

function VesselPanel({ vessel }: { vessel: VesselDetail | null }) {
  if (!vessel) return (
    <div style={{ padding: "12px 0" }}>
      {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
        <div key={i} style={{ height: 10, background: "rgba(255,255,255,0.04)", borderRadius: 4, marginBottom: 10, width: i % 2 === 0 ? "60%" : "80%" }} />
      ))}
    </div>
  );

  const currentYear = new Date().getFullYear();
  const age         = vessel.builtYear ? currentYear - vessel.builtYear : null;

  return (
    <div>
      <Row label="Name"        value={vessel.name || "Unknown vessel"} />
      <Row label="IMO"         value={field(vessel.imo)} />
      <Row label="Call sign"   value={field(vessel.callSign)} />
      <Row label="Built"       value={vessel.builtYear ? `${vessel.builtYear} (${age}y)` : "—"} />
      <Row label="Length"      value={field(vessel.length,  " m")} />
      <Row label="Beam"        value={field(vessel.beam,    " m")} />
      <Row label="Draught"     value={field(vessel.draught, " m")} />
      <Row label="Destination" value={field(vessel.destination)} />
      <Row label="ETA"         value={field(vessel.eta)} />
      <Row label="Speed"       value={field(vessel.speed,   " kn")} />
      <Row label="Course"      value={field(vessel.course,  "°")} />
      <Row label="Nav status"  value={NAV_STATUS[vessel.navStatus] ?? `Code ${vessel.navStatus}`} />
      <Row label="Position"    value={`${vessel.position.lat.toFixed(4)}°, ${vessel.position.lon.toFixed(4)}°`} />
      <Row label="Updated"     value={vessel.updatedAt ? new Date(vessel.updatedAt).toLocaleTimeString() : "—"} />
      {vessel.staticDataAge == null && (
        <p style={{ fontSize: 10, color: S.muted, marginTop: 10, lineHeight: 1.5 }}>
          Awaiting static data (arrives every few min)…
        </p>
      )}
    </div>
  );
}

function ScrapBadge({ category, score }: { category: string; score: number }) {
  const color = SCRAP_COLORS[category] ?? S.muted;
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
      background: `${color}22`, color, border: `1px solid ${color}44`,
    }}>
      {category} · {score}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MapView() {
  const mapRef            = useRef<HTMLDivElement>(null);
  const mapInstanceRef    = useRef<any>(null);
  const leafletRef        = useRef<any>(null);
  const canvasRef         = useRef<any>(null);
  const vesselMarkersRef  = useRef<Map<string, any>>(new Map());
  const clusterMarkersRef = useRef<Map<string, any>>(new Map());
  const trackLayerRef     = useRef<any>(null);
  const fetchRef          = useRef<() => void>(() => {});
  const debounceRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef          = useRef<AbortController | null>(null);

  const [mapReady,      setMapReady]      = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [total,         setTotal]         = useState<number | null>(null);
  const [dataSource,    setDataSource]    = useState("");
  const [typeFilter,    setTypeFilter]    = useState("All");
  const [selected,      setSelected]      = useState<ApiVessel | null>(null);
  const [detail,        setDetail]        = useState<VesselDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [trackPoints,     setTrackPoints]     = useState(0);
  const [scrapCounts,     setScrapCounts]     = useState<ScrapCounts>({ critical: 0, high: 0, medium: 0, low: 0 });
  const [showScrap,       setShowScrap]       = useState(false);
  const [contact,         setContact]         = useState<ContactResult | null>(null);
  const [contactLoading,  setContactLoading]  = useState(false);

  // ── Init map ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || mapInstanceRef.current || !mapRef.current) return;

    import("leaflet").then((mod) => {
      if (mapInstanceRef.current) return;
      const L = mod.default ?? mod;
      leafletRef.current = L;
      canvasRef.current  = L.canvas({ padding: 0.5 });

      const map = L.map(mapRef.current!, {
        center: [20, 20], zoom: 3, zoomControl: true, preferCanvas: true,
      });

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        { attribution: '© <a href="https://carto.com/">CARTO</a> © <a href="https://www.openstreetmap.org/copyright">OSM</a>', subdomains: "abcd", maxZoom: 18 },
      ).addTo(map);

      mapInstanceRef.current = map;
      map.on("moveend", () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => fetchRef.current(), DEBOUNCE_MS);
      });
      // Ensure Leaflet picks up the correct container size after React renders
      setTimeout(() => map.invalidateSize(), 0);
      setMapReady(true);
    });

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // ── Fetch viewport ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return;
    const map = mapInstanceRef.current;
    const L   = leafletRef.current;
    if (!map || !L) return;

    const filter   = typeFilter;
    const scrapOnly = showScrap;

    async function fetchViewport() {
      const bounds = map.getBounds();
      const zoom   = map.getZoom();
      const bbox   = [
        bounds.getWest().toFixed(5), bounds.getSouth().toFixed(5),
        bounds.getEast().toFixed(5), bounds.getNorth().toFixed(5),
      ].join(",");

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setLoading(true);
      try {
        const url = `/api/vessels?bbox=${bbox}&zoom=${zoom}${scrapOnly ? "&scrap=critical,high" : ""}`;
        const res  = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) return;
        const data: ApiResponse = await res.json();
        setTotal(data.total ?? 0);
        setDataSource(data.source ?? "");

        if (data.type === "clusters" && data.clusters) {
          clearVesselMarkers(map);
          setScrapCounts({ critical: 0, high: 0, medium: 0, low: 0 });
          diffClusterMarkers(map, L, data.clusters);
        } else if (data.type === "vessels" && data.vessels) {
          clearClusterMarkers(map);
          // Compute scrap distribution
          const counts = { critical: 0, high: 0, medium: 0, low: 0 };
          for (const v of data.vessels) {
            const cat = v.scrap_category as keyof ScrapCounts;
            if (cat in counts) counts[cat]++;
          }
          setScrapCounts(counts);
          diffVesselMarkers(map, L, data.vessels, filter);
        }
      } catch (e: any) {
        if (e.name !== "AbortError") console.error("[MapView]", e.message);
      } finally {
        setLoading(false);
      }
    }

    fetchRef.current = fetchViewport;
    fetchViewport();
  }, [mapReady, typeFilter, showScrap]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cluster markers ───────────────────────────────────────────────────────
  function diffClusterMarkers(map: any, L: any, clusters: ApiCluster[]) {
    const active = new Set<string>();
    for (const c of clusters) {
      const key = `${c.lon.toFixed(3)},${c.lat.toFixed(3)}`;
      active.add(key);
      if (clusterMarkersRef.current.has(key)) {
        const inner = clusterMarkersRef.current.get(key).getElement?.()?.querySelector?.(".cs-n");
        if (inner) inner.textContent = fmtCount(c.count);
        continue;
      }
      const sz   = clamp(28 + Math.log2(c.count + 1) * 5, 28, 52);
      const icon = L.divIcon({
        className: "", iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2],
        html: `<div class="cs" style="width:${sz}px;height:${sz}px"><div class="cs-n">${fmtCount(c.count)}</div></div>`,
      });
      const marker = L.marker([c.lat, c.lon], { icon, interactive: true });
      marker.on("click", () => {
        const z = Math.min(map.getZoom() + 3, CLUSTER_ZOOM + 1);
        map.flyTo([c.lat, c.lon], z, { animate: true, duration: 0.5 });
      });
      marker.addTo(map);
      clusterMarkersRef.current.set(key, marker);
    }
    clusterMarkersRef.current.forEach((m, key) => {
      if (!active.has(key)) { map.removeLayer(m); clusterMarkersRef.current.delete(key); }
    });
  }

  function clearClusterMarkers(map: any) {
    clusterMarkersRef.current.forEach(m => map.removeLayer(m));
    clusterMarkersRef.current.clear();
  }

  // ── Vessel markers ────────────────────────────────────────────────────────
  function diffVesselMarkers(map: any, L: any, vessels: ApiVessel[], filter: string) {
    const renderer = canvasRef.current;
    const active   = new Set<string>();

    for (const v of vessels) {
      if (active.size >= MAX_VESSELS) break;
      if (filter !== "All" && !v.type?.toLowerCase().includes(filter.toLowerCase())) continue;

      const lat = parseFloat(v.lat);
      const lon = parseFloat(v.lon);
      if (isNaN(lat) || isNaN(lon)) continue;

      active.add(v.mmsi);

      if (vesselMarkersRef.current.has(v.mmsi)) {
        vesselMarkersRef.current.get(v.mmsi).setLatLng([lat, lon]);
        continue;
      }

      const color  = markerColor(v);
      const speed  = parseFloat(v.speed ?? "0");
      const cat    = v.scrap_category;
      // Critical/high vessels slightly larger
      const radius = cat === "critical" ? 6 : cat === "high" ? 5 : speed > 5 ? 5 : speed > 1 ? 4 : 3;

      const marker = L.circleMarker([lat, lon], {
        renderer, radius,
        fillColor: color, fillOpacity: 0.85,
        color: "rgba(0,0,0,0.3)", weight: 0.8,
      });

      marker.bindTooltip(
        `<b>${v.name || v.mmsi}</b><br>${v.type || "—"} · ${speed.toFixed(1)} kn` +
        (cat !== "low" ? `<br><span style="color:${SCRAP_COLORS[cat]}">${cat} risk</span>` : ""),
        { sticky: true, className: "vt" },
      );

      marker.on("click", () => {
        setSelected(v);
        setDetail(null);
        setContact(null);
        loadVesselDetail(v.mmsi);
        loadTrack(v.mmsi);
        loadContact(v.mmsi);
      });

      marker.addTo(map);
      vesselMarkersRef.current.set(v.mmsi, marker);
    }

    vesselMarkersRef.current.forEach((m, key) => {
      if (!active.has(key)) { map.removeLayer(m); vesselMarkersRef.current.delete(key); }
    });
  }

  function clearVesselMarkers(map: any) {
    vesselMarkersRef.current.forEach(m => map.removeLayer(m));
    vesselMarkersRef.current.clear();
  }

  // ── Vessel detail ─────────────────────────────────────────────────────────
  async function loadVesselDetail(mmsi: string) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/vessels/${mmsi}`);
      if (!res.ok) return;
      const data = await res.json();
      setDetail(data.vessel ?? null);
    } catch {
    } finally {
      setDetailLoading(false);
    }
  }

  // ── Contact enrichment ────────────────────────────────────────────────────
  async function loadContact(mmsi: string) {
    setContact(null);
    setContactLoading(true);
    try {
      const res = await fetch(`/api/vessels/${mmsi}/contact`);
      if (!res.ok) return;
      const data = await res.json();
      setContact(data.contact ?? null);
    } catch {
    } finally {
      setContactLoading(false);
    }
  }

  // ── Track ─────────────────────────────────────────────────────────────────
  async function loadTrack(mmsi: string) {
    clearTrack();
    try {
      const res = await fetch(`/api/vessels/${mmsi}/track?hours=24`);
      if (!res.ok) return;
      const data = await res.json();
      setTrackPoints(data.count ?? 0);
      if (!data.geojson || !mapInstanceRef.current || !leafletRef.current) return;
      trackLayerRef.current = leafletRef.current.geoJSON(data.geojson, {
        style: { color: S.green, weight: 2.5, opacity: 0.75, dashArray: "4 4" },
      }).addTo(mapInstanceRef.current);
    } catch {}
  }

  function clearTrack() {
    if (trackLayerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(trackLayerRef.current);
      trackLayerRef.current = null;
    }
    setTrackPoints(0);
  }

  function closePanel() {
    setSelected(null);
    setDetail(null);
    setContact(null);
    clearTrack();
  }

  const totalScrap = scrapCounts.critical + scrapCounts.high + scrapCounts.medium + scrapCounts.low;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: S.bg, color: S.text, display: "flex", height: "calc(100vh - 56px)", fontFamily: "Inter, sans-serif" }}>

      <style>{`
        .cs { border-radius:50%; background:#1D9E75; border:2px solid rgba(255,255,255,0.25); box-shadow:0 2px 8px rgba(0,0,0,0.35); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:transform 0.15s; }
        .cs:hover { transform:scale(1.12); }
        .cs-n { color:#fff; font-size:11px; font-weight:700; font-family:'Inter',sans-serif; letter-spacing:-0.3px; }
        .vt.leaflet-tooltip { background:#0F1520 !important; border:1px solid rgba(255,255,255,0.1) !important; color:#E8EDF2 !important; font-size:11px !important; font-family:'Inter',monospace !important; border-radius:5px !important; padding:5px 9px !important; pointer-events:none; }
        .vt.leaflet-tooltip::before { border-top-color:rgba(255,255,255,0.08) !important; }
        .leaflet-control-attribution { background:rgba(10,14,20,0.85) !important; color:rgba(255,255,255,0.18) !important; font-size:9px !important; }
        .leaflet-control-attribution a { color:rgba(255,255,255,0.28) !important; }
        .leaflet-control-zoom a { background:#0C1118 !important; color:#E8EDF2 !important; border-color:rgba(255,255,255,0.08) !important; }
        .leaflet-control-zoom a:hover { background:#0F1520 !important; }
        @keyframes loading-sweep { from{transform:translateX(-100%)} to{transform:translateX(100%)} }
      `}</style>

      {/* ── Left sidebar ── */}
      <aside style={{ width: 200, background: S.mid, borderRight: `1px solid ${S.border}`, padding: "18px 16px", flexShrink: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Status */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: loading ? "#D97706" : dataSource ? S.green : "#475569", flexShrink: 0, transition: "background 0.3s" }} />
          <span style={{ fontSize: 10, color: loading ? "#D97706" : S.green, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>
            {loading ? "Loading…" : dataSource ? "DB · PostGIS" : "AIS Live"}
          </span>
        </div>

        {/* Scrap risk legend (only when vessels visible) */}
        {totalScrap > 0 && (
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: S.muted, textTransform: "uppercase" as const, marginBottom: 8 }}>Scrap risk</div>
            {(["critical","high","medium","low"] as const).map(cat => {
              const n   = scrapCounts[cat];
              const pct = totalScrap > 0 ? Math.round(n / totalScrap * 100) : 0;
              return (
                <div key={cat} style={{ marginBottom: 7 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 10, color: SCRAP_COLORS[cat] }}>{cat}</span>
                    <span style={{ fontSize: 10, color: S.muted, fontFamily: "monospace" }}>{n}</span>
                  </div>
                  <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: SCRAP_COLORS[cat], borderRadius: 2, opacity: 0.7 }} />
                  </div>
                </div>
              );
            })}

            {/* Scrap-only toggle */}
            <button onClick={() => setShowScrap(s => !s)} style={{
              marginTop: 6, display: "block", width: "100%", textAlign: "left" as const,
              background: showScrap ? "rgba(239,68,68,0.1)" : "transparent",
              border: `1px solid ${showScrap ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.06)"}`,
              borderRadius: 4, padding: "5px 10px",
              color: showScrap ? "#EF4444" : S.muted,
              fontSize: 10, cursor: "pointer", fontFamily: "Inter, sans-serif",
            }}>
              {showScrap ? "✓ " : ""}critical + high only
            </button>
          </div>
        )}

        {/* Vessel type filter */}
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: S.muted, textTransform: "uppercase" as const, marginBottom: 8 }}>Vessel type</div>
          {["All", "Cargo", "Tanker", "Passenger", "Fishing", "Tug", "Sailing"].map(t => (
            <button key={t} onClick={() => setTypeFilter(t)} style={{
              display: "block", width: "100%", textAlign: "left" as const,
              background: typeFilter === t ? "rgba(29,158,117,0.1)" : "transparent",
              border: `1px solid ${typeFilter === t ? "rgba(29,158,117,0.25)" : "transparent"}`,
              borderRadius: 4, padding: "5px 10px",
              color: typeFilter === t ? S.green : "rgba(255,255,255,0.3)",
              fontSize: 11, cursor: "pointer", marginBottom: 2, fontFamily: "Inter, sans-serif",
            }}>
              {t !== "All" && <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: vesselColor(t), marginRight: 7, verticalAlign: "middle" }} />}
              {t}
            </button>
          ))}
        </div>

        {/* Stats footer */}
        <div style={{ borderTop: `1px solid ${S.border}`, paddingTop: 16, marginTop: "auto" }}>
          {[
            ["In viewport", total !== null ? total.toLocaleString() : "—"],
            ["Renderer",    "Canvas"],
            ["Source",      dataSource || "—"],
          ].map(([l, v]) => (
            <div key={String(l)} style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
              <span style={{ fontSize: 10, color: S.muted }}>{l}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: S.text }}>{v}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* ── Map ── */}
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        <div ref={mapRef} style={{ position: "absolute", inset: 0 }} />
        {loading && (
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, zIndex: 900, background: "linear-gradient(90deg,transparent,#1D9E75,transparent)", animation: "loading-sweep 1.2s linear infinite" }} />
        )}
        {total !== null && !loading && (
          <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "rgba(10,14,20,0.88)", border: `1px solid ${S.border}`, borderRadius: 20, padding: "5px 14px", zIndex: 400, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: S.green }} />
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", fontFamily: "monospace" }}>{total.toLocaleString()} vessels · {dataSource}</span>
          </div>
        )}
      </div>

      {/* ── Right detail panel ── */}
      {selected && (
        <aside style={{ width: 268, background: S.mid, borderLeft: `1px solid ${S.border}`, padding: 18, overflowY: "auto", flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: S.muted, textTransform: "uppercase" as const, marginBottom: 4 }}>Live Vessel</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: S.text, letterSpacing: "-0.3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {detail?.name || selected.name || `MMSI ${selected.mmsi}`}
              </div>
              <div style={{ fontSize: 10, color: S.muted, marginTop: 3, fontFamily: "monospace" }}>MMSI {selected.mmsi}</div>
            </div>
            <button onClick={closePanel} style={{ background: "none", border: "none", color: S.muted, cursor: "pointer", fontSize: 18, padding: 2, lineHeight: 1, flexShrink: 0 }}>×</button>
          </div>

          {/* Badges */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
            {(detail?.type || selected.type) && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: `${vesselColor(detail?.type || selected.type)}22`, color: vesselColor(detail?.type || selected.type), border: `1px solid ${vesselColor(detail?.type || selected.type)}44` }}>
                {detail?.type || selected.type}
              </span>
            )}
            {detail
              ? <ScrapBadge category={detail.scrapCategory} score={detail.scrapScore} />
              : selected.scrap_category !== "low" && (
                  <ScrapBadge category={selected.scrap_category} score={parseInt(selected.scrap_score) || 0} />
                )
            }
          </div>

          {/* Vessel fields */}
          <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 8, padding: "12px 14px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: S.muted, textTransform: "uppercase" as const, marginBottom: 10 }}>
              {detailLoading ? "Fetching detail…" : "Vessel data"}
            </div>
            <VesselPanel vessel={detailLoading ? null : detail} />
          </div>

          {/* Scrap signals */}
          {detail && detail.scrapReasons.length > 0 && (
            <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: S.muted, textTransform: "uppercase" as const, marginBottom: 8 }}>Scrap signals</div>
              {detail.scrapReasons.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <div style={{ width: 4, height: 4, borderRadius: "50%", background: SCRAP_COLORS[detail.scrapCategory] ?? S.muted, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: S.text }}>{r}</span>
                </div>
              ))}
            </div>
          )}

          {/* 24h Track */}
          <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 8, padding: "12px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: S.muted, textTransform: "uppercase" as const }}>24h Track</div>
              <span style={{ fontSize: 10, color: trackPoints ? S.green : S.muted }}>
                {trackPoints ? `${trackPoints} pts` : "Loading…"}
              </span>
            </div>
            <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: trackPoints ? "100%" : "40%", background: trackPoints ? S.green : "rgba(255,255,255,0.12)", borderRadius: 2, transition: "width 0.6s" }} />
            </div>
          </div>

          {/* ── Contact ── */}
          <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 8, padding: "12px 14px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: S.muted, textTransform: "uppercase" as const, marginBottom: 10 }}>
              Owner / Manager
            </div>
            {contactLoading ? (
              <div style={{ fontSize: 10, color: S.muted }}>Searching contacts…</div>
            ) : contact ? (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: S.text, marginBottom: 8 }}>{contact.company}</div>
                {contact.website && (
                  <a href={`https://${contact.website}`} target="_blank" rel="noreferrer"
                    style={{ display: "block", fontSize: 10, color: S.green, marginBottom: 6, textDecoration: "none" }}>
                    🌐 {contact.website}
                  </a>
                )}
                {contact.emails.slice(0, 2).map(e => (
                  <a key={e} href={`mailto:${e}`}
                    style={{ display: "block", fontSize: 10, color: "#94A3B8", marginBottom: 4, textDecoration: "none" }}>
                    ✉ {e}
                  </a>
                ))}
                {contact.phones.slice(0, 2).map(p => (
                  <div key={p} style={{ fontSize: 10, color: "#94A3B8", marginBottom: 4 }}>
                    📞 {p}
                  </div>
                ))}
                {contact.emailFormat && (
                  <div style={{ fontSize: 9, color: S.muted, marginTop: 6, fontFamily: "monospace" }}>
                    format: {contact.emailFormat}
                  </div>
                )}
                <a href={contact.linkedinSearchUrl} target="_blank" rel="noreferrer"
                  style={{ display: "inline-block", marginTop: 8, fontSize: 10, fontWeight: 600, color: "#60A5FA", textDecoration: "none" }}>
                  LinkedIn →
                </a>
              </div>
            ) : (
              <div style={{ fontSize: 10, color: S.muted }}>No owner data available</div>
            )}
          </div>

          <button
            onClick={() => window.open(`/api/vessels/${selected.mmsi}`, "_blank")}
            style={{ background: "rgba(29,158,117,0.1)", border: `1px solid rgba(29,158,117,0.25)`, borderRadius: 6, padding: "8px 14px", color: S.green, fontSize: 11, fontWeight: 600, cursor: "pointer", letterSpacing: "0.06em", fontFamily: "Inter, sans-serif" }}>
            Full detail JSON →
          </button>
        </aside>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }
function fmtCount(n: number) { return n > 9999 ? `${(n / 1000).toFixed(0)}k` : n > 999 ? `${(n / 1000).toFixed(1)}k` : String(n); }
