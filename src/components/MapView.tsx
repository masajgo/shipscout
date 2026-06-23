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

interface ApiResponse {
  type:     "vessels";
  source:   string;
  vessels?: ApiVessel[];
  total:    number;
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

const DEBOUNCE_MS  = 300;
const MAX_VESSELS  = 2000;

const S = {
  bg: "#0B1E3D", mid: "#0B1E3D", card: "rgba(255,255,255,0.05)",
  border:      "rgba(255,255,255,0.08)",
  glassBorder: "rgba(255,255,255,0.10)",
  text: "#ffffff", muted: "rgba(255,255,255,0.45)",
  green: "#1D9E75", gold: "#C9A84C",
};

const SCRAP_COLORS: Record<string, string> = {
  critical: "#EF4444",
  high:     "#F97316",
  medium:   "#F59E0B",
  low:      "#64748B",
};

const MARKER_COLORS: Record<string, string> = {
  critical: "#EF4444",
  high:     "#F59E0B",
  medium:   "#3B82F6",
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
  const trackLayerRef     = useRef<any>(null);
  const fetchRef          = useRef<() => void>(() => {});
  const debounceRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef          = useRef<AbortController | null>(null);
  const searchAbortRef    = useRef<AbortController | null>(null);
  const searchInputRef    = useRef<HTMLInputElement>(null);

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
  const [searchExpanded,  setSearchExpanded]  = useState(false);

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

        if (data.vessels) {
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

  // ── Vessel icon factory ───────────────────────────────────────────────────
  function vesselIcon(L: any, v: ApiVessel): any {
    const color  = MARKER_COLORS[v.scrap_category] ?? MARKER_COLORS.low;
    const speed  = parseFloat(v.speed  ?? "0");
    const course = parseFloat(v.course ?? "0");
    const moving = speed > 0.5;
    const type   = (v.type || "").toLowerCase();

    let markerHtml: string;
    if (!moving) {
      markerHtml = `<svg width="12" height="12" viewBox="0 0 12 12" style="display:block"><circle cx="6" cy="6" r="4.5" fill="${color}" stroke="white" stroke-width="1.2"/></svg>`;
    } else {
      markerHtml = `<svg width="14" height="14" viewBox="0 0 14 14" style="display:block;transform:rotate(${course}deg);transform-origin:7px 7px"><polygon points="7,1 12,13 7,10 2,13" fill="${color}" stroke="white" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
    }

    return L.divIcon({
      html:       markerHtml,
      className:  "vessel-marker",
      iconSize:   moving ? [14, 14] : [12, 12],
      iconAnchor: moving ? [7,  7]  : [6,  6],
    });
  }

  // ── Vessel markers ────────────────────────────────────────────────────────
  function diffVesselMarkers(map: any, L: any, vessels: ApiVessel[], filter: string) {
    const active = new Set<string>();

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

      const speed = parseFloat(v.speed ?? "0");
      const cat   = v.scrap_category;

      const marker = L.marker([lat, lon], { icon: vesselIcon(L, v) });

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
        .vessel-marker { background:none !important; border:none !important; cursor:pointer; }
        .vessel-marker:hover { filter:brightness(1.5) drop-shadow(0 0 4px rgba(255,255,255,0.7)); }
        .vt.leaflet-tooltip { background:rgba(11,30,61,0.96) !important; border:1px solid rgba(255,255,255,0.10) !important; color:#fff !important; font-size:11px !important; font-family:'Inter',sans-serif !important; border-radius:6px !important; padding:5px 9px !important; pointer-events:none; backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); }
        .vt.leaflet-tooltip::before { border-top-color:rgba(255,255,255,0.08) !important; }
        .leaflet-control-attribution { background:rgba(11,30,61,0.85) !important; color:rgba(255,255,255,0.25) !important; font-size:9px !important; backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); }
        .leaflet-control-attribution a { color:rgba(255,255,255,0.4) !important; }
        .leaflet-control-zoom { margin-right:14px !important; margin-bottom:14px !important; }
        .leaflet-control-zoom a { background:rgba(11,30,61,0.90) !important; color:#fff !important; border-color:rgba(255,255,255,0.10) !important; backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); font-size:16px !important; width:30px !important; height:30px !important; line-height:30px !important; transition:background 0.15s, color 0.15s !important; }
        .leaflet-control-zoom a:hover { background:rgba(11,30,61,1) !important; color:#C9A84C !important; }
        .map-hover:hover { background:rgba(255,255,255,0.04) !important; }
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
        <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "rgba(11,30,61,0.92)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: `1px solid ${S.glassBorder}`, borderRadius: 20, padding: "5px 14px", zIndex: 400, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: S.green }} />
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontFamily: "monospace" }}>{total.toLocaleString()} vessels · {dataSource}</span>
        </div>
      )}

      {/* ── Left glass panel ── */}
      <aside style={{
        position: "absolute", top: 14, left: 14, bottom: 14, width: 196,
        background: "rgba(11,30,61,0.94)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
        border: `1px solid ${S.glassBorder}`, borderRadius: 12,
        padding: "14px 12px", overflowY: "auto",
        display: "flex", flexDirection: "column", gap: 16,
        zIndex: 500,
      }}>

        {/* Search — collapsible */}
        <div style={{ position: "relative" }}>
          {searchExpanded ? (
            <div style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "7px 10px", transition: "all 0.2s" }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                <circle cx="5" cy="5" r="3.5" stroke="rgba(255,255,255,0.45)" strokeWidth="1.3" />
                <line x1="7.8" y1="7.8" x2="11" y2="11" stroke="rgba(255,255,255,0.45)" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={e => searchVessels(e.target.value)}
                onKeyDown={e => { if (e.key === "Escape") { setSearchExpanded(false); setSearchQuery(""); setSearchResults([]); setSearchOpen(false); } }}
                onBlur={() => setTimeout(() => { setSearchOpen(false); if (!searchQuery.trim()) setSearchExpanded(false); }, 160)}
                placeholder="Vessel name or IMO..."
                style={{ flex: 1, background: "none", border: "none", outline: "none", color: "rgba(255,255,255,0.85)", fontSize: 11, fontFamily: "Inter, sans-serif", minWidth: 0 }}
              />
              <button onClick={() => { setSearchExpanded(false); setSearchQuery(""); setSearchResults([]); setSearchOpen(false); }} style={{ background: "none", border: "none", color: S.muted, cursor: "pointer", fontSize: 15, padding: 0, lineHeight: 1, flexShrink: 0 }}>×</button>
            </div>
          ) : (
            <button
              onClick={() => { setSearchExpanded(true); setTimeout(() => searchInputRef.current?.focus(), 50); }}
              style={{ width: 28, height: 28, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s" }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="5" cy="5" r="3.5" stroke="rgba(255,255,255,0.5)" strokeWidth="1.3" />
                <line x1="7.8" y1="7.8" x2="11" y2="11" stroke="rgba(255,255,255,0.5)" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </button>
          )}

          {/* Results dropdown */}
          {searchOpen && searchResults.length > 0 && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "rgba(11,30,61,0.97)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 7, zIndex: 600, overflow: "hidden" }}>
              {searchResults.map(r => (
                <button key={r.mmsi} onMouseDown={() => selectSearchResult(r)} className="map-hover" style={{ display: "block", width: "100%", textAlign: "left" as const, padding: "7px 10px", background: "none", border: "none", borderBottom: "1px solid rgba(255,255,255,0.06)", color: S.text, cursor: "pointer", fontFamily: "Inter, sans-serif" }}>
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

        {/* SCRAP RISK legend — color swatches */}
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: S.muted, textTransform: "uppercase" as const, marginBottom: 8 }}>Scrap Risk</div>
          {(["critical","high","medium","low"] as const).map(cat => {
            const n   = scrapCounts[cat];
            const pct = totalScrap > 0 ? Math.round(n / totalScrap * 100) : 0;
            return (
              <div key={cat} style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ width: 9, height: 9, borderRadius: "50%", background: MARKER_COLORS[cat], border: "1.5px solid rgba(255,255,255,0.3)", flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: MARKER_COLORS[cat] }}>{cat}</span>
                  </div>
                  <span style={{ fontSize: 9, color: S.muted, fontFamily: "monospace" }}>{n > 0 ? n : "—"}</span>
                </div>
                {n > 0 && (
                  <div style={{ height: 2, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden", marginLeft: 16 }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: MARKER_COLORS[cat], borderRadius: 2, opacity: 0.7 }} />
                  </div>
                )}
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

        {/* STATUS legend — shape meanings */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: S.muted, textTransform: "uppercase" as const, marginBottom: 8 }}>Status</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
              <polygon points="7,1 11,12 7,9 3,12" fill="rgba(255,255,255,0.55)" stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeLinejoin="round"/>
            </svg>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>Underway (arrow = course)</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
              <circle cx="7" cy="7" r="5" fill="rgba(255,255,255,0.55)" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2"/>
            </svg>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>Anchored / moored</span>
          </div>
        </div>

        {/* Vessel type filter */}
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: S.muted, textTransform: "uppercase" as const, marginBottom: 8 }}>Filter type</div>
          {["All", "Cargo", "Tanker", "Passenger", "Fishing", "Tug", "Sailing"].map(t => (
            <button key={t} onClick={() => setTypeFilter(t)} className={typeFilter !== t ? "map-hover" : ""} style={{
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
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 14, marginTop: "auto" }}>
          {[
            ["Visible",  total !== null ? total.toLocaleString() : "—"],
            ["Rendered", `≤${MAX_VESSELS.toLocaleString()}`],
            ["Source",   dataSource || "—"],
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
          background: "rgba(11,30,61,0.94)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          border: `1px solid ${S.glassBorder}`, borderRadius: 12,
          overflowY: "auto", zIndex: 500,
          display: "flex", flexDirection: "column",
        }}>

          {/* Header */}
          <div style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
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
            <div style={{ padding: "6px 10px", background: "rgba(201,168,76,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
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
          <div style={{ padding: "6px 10px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
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
          <div style={{ padding: "6px 10px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
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
