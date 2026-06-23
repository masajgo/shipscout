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
  mmsi:                 string;
  imo:                  string | null;
  name:                 string;
  callSign:             string | null;
  type:                 string | null;
  position:             { lat: number; lon: number };
  speed:                number;
  course:               number;
  heading:              number | null;
  navStatus:            number;
  length:               number | null;
  beam:                 number | null;
  draught:              number | null;
  destination:          string | null;
  eta:                  string | null;
  builtYear:            number | null;
  scrapScore:           number;
  scrapCategory:        string;
  scrapReasons:         string[];
  flag:                 string | null;
  staticDataAge:        number | null;
  updatedAt:            string | null;
  dwt:                  number | null;
  ldt:                  number | null;
  ldtEstimated:         boolean | null;
  scrapValueUsd:        number | null;
  scrapValueEstimated:  boolean | null;
}

interface SearchResult {
  mmsi:           string;
  imo:            string | null;
  name:           string;
  type:           string | null;
  lat:            string;
  lon:            string;
  scrap_score:    string;
  scrap_category: string;
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
  bg: "#07122E", mid: "#07122E", card: "rgba(255,255,255,0.04)",
  border:      "rgba(255,255,255,0.08)",
  glassBorder: "rgba(255,255,255,0.10)",
  text: "#E8EDF2", muted: "rgba(255,255,255,0.35)",
  green: "#1D9E75", gold: "#C9A84C",
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
  const searchAbortRef    = useRef<AbortController | null>(null);

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
  const [searchQuery,     setSearchQuery]     = useState("");
  const [searchResults,   setSearchResults]   = useState<SearchResult[]>([]);
  const [searchOpen,      setSearchOpen]      = useState(false);

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

  async function searchVessels(q: string) {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); setSearchOpen(false); return; }
    searchAbortRef.current?.abort();
    const ctrl = new AbortController();
    searchAbortRef.current = ctrl;
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=6`, { signal: ctrl.signal });
      if (!res.ok) return;
      const data = await res.json();
      setSearchResults(data.results || []);
      setSearchOpen(true);
    } catch (e: any) {
      if (e.name !== "AbortError") console.error(e);
    }
  }

  function selectSearchResult(r: SearchResult) {
    const lat = parseFloat(r.lat);
    const lon = parseFloat(r.lon);
    if (!isNaN(lat) && !isNaN(lon)) {
      mapInstanceRef.current?.flyTo([lat, lon], 14, { animate: true, duration: 0.8 });
    }
    const v: ApiVessel = {
      mmsi: r.mmsi, name: r.name, type: r.type || "",
      speed: "0", course: "0", nav: "0",
      lat: r.lat, lon: r.lon,
      scrap_score: r.scrap_score, scrap_category: r.scrap_category, ts: "",
    };
    setSelected(v); setDetail(null); setContact(null);
    loadVesselDetail(r.mmsi); loadTrack(r.mmsi); loadContact(r.mmsi);
    setSearchQuery(""); setSearchResults([]); setSearchOpen(false);
  }

  function closePanel() {
    setSelected(null);
    setDetail(null);
    setContact(null);
    clearTrack();
  }

  const totalScrap = scrapCounts.critical + scrapCounts.high + scrapCounts.medium + scrapCounts.low;

  const fmtScrapVal = (usd: number | null | undefined, est: boolean | null | undefined) => {
    if (!usd || usd < 100_000) return null;
    const m = usd / 1_000_000;
    return `${est ? "~" : ""}$${m >= 10 ? m.toFixed(1) : m.toFixed(2)}M`;
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: "relative", height: "calc(100vh - 64px)", overflow: "hidden", fontFamily: "Inter, sans-serif", color: S.text }}>

      <style>{`
        .cs { border-radius:50%; background:#1D9E75; border:2px solid rgba(255,255,255,0.25); box-shadow:0 2px 8px rgba(0,0,0,0.35); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:transform 0.15s; }
        .cs:hover { transform:scale(1.12); }
        .cs-n { color:#fff; font-size:11px; font-weight:700; font-family:'Inter',sans-serif; letter-spacing:-0.3px; }
        .vt.leaflet-tooltip { background:#07122E !important; border:1px solid rgba(255,255,255,0.10) !important; color:#E8EDF2 !important; font-size:11px !important; font-family:'Inter',sans-serif !important; border-radius:6px !important; padding:5px 9px !important; pointer-events:none; backdrop-filter:blur(8px); }
        .vt.leaflet-tooltip::before { border-top-color:rgba(255,255,255,0.08) !important; }
        .leaflet-control-attribution { background:rgba(7,18,48,0.80) !important; color:rgba(255,255,255,0.22) !important; font-size:9px !important; backdrop-filter:blur(6px); }
        .leaflet-control-attribution a { color:rgba(255,255,255,0.35) !important; }
        .leaflet-control-zoom { margin-right:14px !important; margin-bottom:14px !important; }
        .leaflet-control-zoom a { background:rgba(7,18,48,0.80) !important; color:#E8EDF2 !important; border-color:rgba(255,255,255,0.10) !important; backdrop-filter:blur(16px); font-size:16px !important; width:30px !important; height:30px !important; line-height:30px !important; }
        .leaflet-control-zoom a:hover { background:rgba(7,18,48,0.96) !important; color:#C9A84C !important; }
        @keyframes loading-sweep { from{transform:translateX(-100%)} to{transform:translateX(100%)} }
      `}</style>

      {/* ── Full-screen map ── */}
      <div ref={mapRef} style={{ position: "absolute", inset: 0 }} />

      {/* Loading bar */}
      {loading && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, zIndex: 900, background: "linear-gradient(90deg,transparent,#C9A84C,transparent)", animation: "loading-sweep 1.2s linear infinite" }} />
      )}

      {/* Vessel count badge */}
      {total !== null && !loading && (
        <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "rgba(7,18,48,0.82)", backdropFilter: "blur(16px)", border: `1px solid ${S.glassBorder}`, borderRadius: 20, padding: "5px 14px", zIndex: 400, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: S.green }} />
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontFamily: "monospace" }}>{total.toLocaleString()} vessels · {dataSource}</span>
        </div>
      )}

      {/* ── Left glass panel ── */}
      <aside style={{
        position: "absolute", top: 14, left: 14, bottom: 14, width: 196,
        background: "rgba(7,18,48,0.55)", backdropFilter: "blur(24px)",
        border: `1px solid ${S.glassBorder}`, borderRadius: 12,
        padding: "14px 12px", overflowY: "auto",
        display: "flex", flexDirection: "column", gap: 16,
        zIndex: 500,
      }}>

        {/* Search */}
        <div style={{ position: "relative" }}>
          <input
            value={searchQuery}
            onChange={e => searchVessels(e.target.value)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
            placeholder="Search vessel or IMO..."
            style={{
              width: "100%", padding: "7px 10px", borderRadius: 6, boxSizing: "border-box" as const,
              background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.8)", fontSize: 11, outline: "none", fontFamily: "Inter, sans-serif",
            }}
          />
          {searchOpen && searchResults.length > 0 && (
            <div style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
              background: "rgba(7,18,48,0.96)", backdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, zIndex: 600, overflow: "hidden",
            }}>
              {searchResults.map(r => (
                <button key={r.mmsi} onMouseDown={() => selectSearchResult(r)} style={{
                  display: "block", width: "100%", textAlign: "left" as const,
                  padding: "7px 10px", background: "none", border: "none",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  color: S.text, cursor: "pointer", fontFamily: "Inter, sans-serif",
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name || r.mmsi}</div>
                  <div style={{ fontSize: 9, color: S.muted }}>{r.type || "—"} · {r.imo ? `IMO ${r.imo}` : `MMSI ${r.mmsi}`}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Status */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: loading ? "#D97706" : dataSource ? S.green : "#475569", flexShrink: 0, transition: "background 0.3s" }} />
          <span style={{ fontSize: 10, color: loading ? "#D97706" : S.green, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>
            {loading ? "Loading…" : dataSource ? "DB · PostGIS" : "AIS Live"}
          </span>
        </div>

        {/* Scrap risk legend */}
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
                  <div style={{ height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: SCRAP_COLORS[cat], borderRadius: 2, opacity: 0.75 }} />
                  </div>
                </div>
              );
            })}
            <button onClick={() => setShowScrap(s => !s)} style={{
              marginTop: 6, display: "block", width: "100%", textAlign: "left" as const,
              background: showScrap ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${showScrap ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.08)"}`,
              borderRadius: 5, padding: "5px 10px",
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
              background: typeFilter === t ? "rgba(201,168,76,0.12)" : "transparent",
              border: `1px solid ${typeFilter === t ? "rgba(201,168,76,0.3)" : "transparent"}`,
              borderRadius: 5, padding: "5px 10px",
              color: typeFilter === t ? S.gold : "rgba(255,255,255,0.32)",
              fontSize: 11, cursor: "pointer", marginBottom: 2, fontFamily: "Inter, sans-serif",
            }}>
              {t !== "All" && <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: vesselColor(t), marginRight: 7, verticalAlign: "middle" }} />}
              {t}
            </button>
          ))}
        </div>

        {/* Stats footer */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 14, marginTop: "auto" }}>
          {[
            ["In viewport", total !== null ? total.toLocaleString() : "—"],
            ["Renderer",    "Canvas"],
            ["Source",      dataSource || "—"],
          ].map(([l, v]) => (
            <div key={String(l)} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: S.muted }}>{l}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: S.text }}>{v}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* ── Right glass mini popup ── */}
      {selected && (
        <aside style={{
          position: "absolute", top: 14, right: 48, width: 175,
          maxHeight: "calc(100% - 28px)",
          background: "rgba(7,18,48,0.60)", backdropFilter: "blur(24px)",
          border: `1px solid ${S.glassBorder}`, borderRadius: 11,
          overflowY: "auto", zIndex: 500,
          display: "flex", flexDirection: "column",
        }}>

          {/* Header */}
          <div style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", color: S.muted, textTransform: "uppercase" as const, marginBottom: 2 }}>Live Vessel</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: S.text, letterSpacing: "-0.3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {detail?.name || selected.name || `MMSI ${selected.mmsi}`}
                </div>
                <div style={{ fontSize: 8, color: S.muted, marginTop: 1, fontFamily: "monospace" }}>MMSI {selected.mmsi}</div>
              </div>
              <button onClick={closePanel} style={{ background: "none", border: "none", color: S.muted, cursor: "pointer", fontSize: 15, padding: "0 0 0 4px", lineHeight: 1, flexShrink: 0 }}>×</button>
            </div>

            {/* Badges */}
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const, marginTop: 6 }}>
              {(detail?.type || selected.type) && (
                <span style={{ fontSize: 8, fontWeight: 600, padding: "1px 6px", borderRadius: 8, background: `${vesselColor(detail?.type || selected.type)}22`, color: vesselColor(detail?.type || selected.type), border: `1px solid ${vesselColor(detail?.type || selected.type)}44` }}>
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
          </div>

          {/* Scrap value — gold highlight */}
          {detail && (
            <div style={{ padding: "6px 10px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", color: S.muted, textTransform: "uppercase" as const, marginBottom: 3 }}>Est. Scrap Value</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: fmtScrapVal(detail.scrapValueUsd, detail.scrapValueEstimated) ? S.gold : S.muted, letterSpacing: "-0.3px" }}>
                {fmtScrapVal(detail.scrapValueUsd, detail.scrapValueEstimated) ?? "N/A"}
              </div>
              {detail.ldt && (
                <div style={{ fontSize: 8, color: S.muted, marginTop: 1 }}>
                  LDT {detail.ldt.toLocaleString()}t{detail.ldtEstimated ? " ~est." : ""}
                </div>
              )}
            </div>
          )}

          {/* Compact 4-field data grid */}
          <div style={{ padding: "6px 10px" }}>
            <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", color: S.muted, textTransform: "uppercase" as const, marginBottom: 6 }}>
              {detailLoading ? "Fetching…" : "Vessel data"}
            </div>
            {detailLoading ? (
              [1,2,3,4].map(i => <div key={i} style={{ height: 8, background: "rgba(255,255,255,0.04)", borderRadius: 3, marginBottom: 6, width: i%2===0?"55%":"75%" }} />)
            ) : detail ? (
              <div>
                {([
                  ["Built",  detail.builtYear ? `${detail.builtYear} (${new Date().getFullYear()-detail.builtYear}y)` : "—"],
                  ["Flag",   detail.flag || "—"],
                  ["Length", detail.length ? `${detail.length} m` : "—"],
                  ["Status", NAV_STATUS[detail.navStatus] ?? `Code ${detail.navStatus}`],
                ] as [string, string][]).map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 6, marginBottom: 5 }}>
                    <span style={{ fontSize: 9, color: S.muted, flexShrink: 0 }}>{l}</span>
                    <span style={{ fontSize: 9, fontWeight: 500, color: S.text, textAlign: "right" as const, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "65%" }}>{v}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* 24h Track */}
          <div style={{ padding: "6px 10px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
              <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", color: S.muted, textTransform: "uppercase" as const }}>24h Track</div>
              <span style={{ fontSize: 8, color: trackPoints ? S.green : S.muted }}>
                {trackPoints ? `${trackPoints} pts` : "…"}
              </span>
            </div>
            <div style={{ height: 2, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: trackPoints ? "100%" : "40%", background: trackPoints ? S.green : "rgba(255,255,255,0.12)", borderRadius: 2, transition: "width 0.6s" }} />
            </div>
          </div>

          {/* Owner / Manager */}
          <div style={{ padding: "6px 10px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", color: S.muted, textTransform: "uppercase" as const, marginBottom: 6 }}>Owner / Manager</div>
            {contactLoading ? (
              <div style={{ fontSize: 9, color: S.muted }}>Searching…</div>
            ) : contact ? (
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: S.text, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{contact.company}</div>
                {contact.emails[0] && (
                  <div style={{ fontSize: 9, color: "#94A3B8", marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>✉ {contact.emails[0]}</div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <a href={contact.linkedinSearchUrl} target="_blank" rel="noreferrer" style={{ display: "block", textAlign: "center" as const, background: "rgba(96,165,250,0.10)", border: "1px solid rgba(96,165,250,0.28)", borderRadius: 4, padding: "5px 6px", color: "#60A5FA", fontSize: 9, fontWeight: 600, textDecoration: "none" }}>
                    LinkedIn →
                  </a>
                  {contact.emails.length > 0 && (
                    <a href={buildOfferMailto(contact, detail, selected)} style={{ display: "block", textAlign: "center" as const, background: "rgba(29,158,117,0.10)", border: "1px solid rgba(29,158,117,0.28)", borderRadius: 4, padding: "5px 6px", color: S.green, fontSize: 9, fontWeight: 600, textDecoration: "none" }}>
                      ✉ Email teklifi
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 9, color: S.muted, fontStyle: "italic" }}>Owner bilgisi toplanıyor — yarın güncellenir</div>
            )}
          </div>

        </aside>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }
function fmtCount(n: number) { return n > 9999 ? `${(n / 1000).toFixed(0)}k` : n > 999 ? `${(n / 1000).toFixed(1)}k` : String(n); }

function buildOfferMailto(
  contact: ContactResult,
  detail: VesselDetail | null,
  selected: ApiVessel | null,
): string {
  const to = contact.emails[0] || "";
  const name      = detail?.name || selected?.name || "Vessel";
  const imo       = detail?.imo || "—";
  const mmsi      = detail?.mmsi || selected?.mmsi || "—";
  const builtYr   = detail?.builtYear || "—";
  const ageStr    = detail?.builtYear ? ` (${new Date().getFullYear() - detail.builtYear}y)` : "";
  const type      = detail?.type || selected?.type || "—";
  const length    = detail?.length ? `${detail.length} m` : "—";
  const draught   = detail?.draught ? `${detail.draught} m` : "—";
  const dest      = detail?.destination || "—";

  const subject = `Re: ${name} (IMO ${imo}) — Sale/Purchase Inquiry`;
  const body =
`Dear ${contact.company} team,

We are reaching out via ShipScout regarding the vessel below, currently under your management.

  Vessel:       ${name}
  IMO:          ${imo}
  MMSI:         ${mmsi}
  Type:         ${type}
  Built:        ${builtYr}${ageStr}
  Length:       ${length}
  Draught:      ${draught}
  Destination:  ${dest}

We have a buyer interested in discussing a sale/purchase opportunity for this vessel.

Could you confirm whether the vessel is potentially available, and share the appropriate commercial contact?

Best regards,
ShipScout — Maritime Intelligence
https://shipscout.io
`;

  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
