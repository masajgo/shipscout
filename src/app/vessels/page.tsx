"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import VesselPanel from "@/components/VesselPanel";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Vessel = {
  imo: string; mmsi: string; name: string; type: string; flag: string;
  age: number | null; builtYear: number | null;
  deadweight: number | null; ldt: number | null; ldtEstimated: boolean;
  scrapScore: number | null; scrapCategory: string | null;
  detentionCount: number; deficiencyCount: number;
  specialSurveyDate: string | null;
  manager: string | null; ownerName: string | null;
  bestEmail: string | null; emailStatus: string | null;
  phone: string | null; website: string | null; linkedinUrl: string | null;
  photoThumb: string | null; photoArtist: string | null;
  photoLicense: string | null; photoPageUrl: string | null;
};

type Filters = {
  hasContact:       boolean;
  emailStatus:      string[];
  scrapRisk:        string[];
  ageMin:           string;
  ageMax:           string;
  type:             string[];
  flag:             string;
  dwtMin:           string;
  dwtMax:           string;
  ldtMin:           string;
  ldtMax:           string;
  specialSurvey6mo: boolean;
  hasDetention:     boolean;
};

const DEFAULT_FILTERS: Filters = {
  hasContact: true, emailStatus: [], scrapRisk: [],
  ageMin: "", ageMax: "", type: [], flag: "",
  dwtMin: "", dwtMax: "", ldtMin: "", ldtMax: "",
  specialSurvey6mo: false, hasDetention: false,
};

const VESSEL_TYPES = [
  "Bulk Carrier","Tanker","Container","General Cargo","Offshore","Cruise",
];

// ─── Colours ───────────────────────────────────────────────────────────────────

const C = {
  navy: "#07122E", mid: "#0F1E3D", card: "#111C35",
  border: "rgba(255,255,255,0.08)",
  gold: "#C9A84C", fg: "#E8F0F3", steel: "#8FA8B2",
  green: "#1D9E75", red: "#E24B4A", orange: "#FB923C",
};

// ─── Small helpers ─────────────────────────────────────────────────────────────

function ScrapBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const [bg, label] =
    score >= 70 ? [C.red,    "Critical"] :
    score >= 50 ? [C.orange, "High"]     :
    score >= 25 ? ["#854D0E","Medium"]   :
                  ["rgba(143,168,178,0.15)", "Low"];
  return (
    <span style={{ background: bg, color: "#fff", fontSize: 9, fontWeight: 700,
      borderRadius: 4, padding: "2px 6px", letterSpacing: "0.05em" }}>
      {score} · {label}
    </span>
  );
}

function EmailBadge({ status }: { status: string | null }) {
  if (!status || status === "unchecked") return <span style={{ fontSize: 9, color: C.steel }}>—</span>;
  const [dot, label] =
    status === "verified"  ? ["#22c55e", "verified"]  :
    status === "catch-all" ? ["#eab308", "catch-all"] :
    status === "invalid"   ? [C.red,     "invalid"]   :
                             [C.steel,   status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: dot, flexShrink: 0 }} />
      <span style={{ fontSize: 9, color: dot }}>{label}</span>
    </span>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
      <span onClick={() => onChange(!checked)} style={{
        width: 36, height: 20, borderRadius: 10, position: "relative",
        background: checked ? C.gold : "rgba(143,168,178,0.2)",
        transition: "background 0.2s", flexShrink: 0,
        display: "inline-block", cursor: "pointer",
      }}>
        <span style={{
          position: "absolute", top: 3, left: checked ? 18 : 3,
          width: 14, height: 14, borderRadius: "50%", background: "#fff",
          transition: "left 0.2s",
        }} />
      </span>
      <span style={{ fontSize: 12, color: C.fg }}>{label}</span>
    </label>
  );
}

function MultiCheck({ options, value, onChange }: {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {options.map(o => {
        const checked = value.includes(o.value);
        return (
          <label key={o.value} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={checked} onChange={() =>
              onChange(checked ? value.filter(v => v !== o.value) : [...value, o.value])
            } style={{ accentColor: C.gold }} />
            <span style={{ fontSize: 12, color: C.fg }}>{o.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function NumberRange({ labelMin, labelMax, valMin, valMax, onMin, onMax }: {
  labelMin: string; labelMax: string;
  valMin: string; valMax: string;
  onMin: (v: string) => void; onMax: (v: string) => void;
}) {
  const inp = { background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`,
    borderRadius: 6, padding: "5px 8px", color: C.fg, fontSize: 12, width: "100%", boxSizing: "border-box" as const };
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <input type="number" placeholder={labelMin} value={valMin} onChange={e => onMin(e.target.value)} style={inp} />
      <input type="number" placeholder={labelMax} value={valMax} onChange={e => onMax(e.target.value)} style={inp} />
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function VesselsPage() {
  const [filters,       setFilters]       = useState<Filters>(DEFAULT_FILTERS);
  const [results,       setResults]       = useState<Vessel[]>([]);
  const [total,         setTotal]         = useState(0);
  const [pages,         setPages]         = useState(1);
  const [page,          setPage]          = useState(1);
  const [loading,       setLoading]       = useState(false);
  const [selectedImo,   setSelectedImo]   = useState<string | null>(null);
  const [selected,      setSelected]      = useState<Set<string>>(new Set());
  const [aiQuery,       setAiQuery]       = useState("");
  const [aiLoading,     setAiLoading]     = useState(false);
  const [aiMsg,         setAiMsg]         = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── build query string ────────────────────────────────────────────────────────
  const buildParams = useCallback((f: Filters, pg: number) => {
    const p = new URLSearchParams();
    p.set("hasContact",  String(f.hasContact));
    if (f.emailStatus.length) p.set("emailStatus", f.emailStatus.join(","));
    if (f.scrapRisk.length)   p.set("scrapRisk",   f.scrapRisk.join(","));
    if (f.ageMin)  p.set("ageMin",  f.ageMin);
    if (f.ageMax)  p.set("ageMax",  f.ageMax);
    if (f.type.length) p.set("type", f.type.join(","));
    if (f.flag)    p.set("flag",    f.flag);
    if (f.dwtMin)  p.set("dwtMin",  f.dwtMin);
    if (f.dwtMax)  p.set("dwtMax",  f.dwtMax);
    if (f.ldtMin)  p.set("ldtMin",  f.ldtMin);
    if (f.ldtMax)  p.set("ldtMax",  f.ldtMax);
    if (f.specialSurvey6mo) p.set("specialSurvey6mo", "true");
    if (f.hasDetention)     p.set("hasDetention",     "true");
    p.set("page", String(pg));
    return p.toString();
  }, []);

  // ── fetch results ─────────────────────────────────────────────────────────────
  const fetchResults = useCallback(async (f: Filters, pg: number) => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/vessels/search?${buildParams(f, pg)}`);
      const data = await res.json();
      setResults(data.results ?? []);
      setTotal(data.total ?? 0);
      setPages(data.pages ?? 1);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [buildParams]);

  // ── debounced filter change ───────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchResults(filters, 1);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [filters, fetchResults]);

  // ── page change ───────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchResults(filters, page);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // ── filter helpers ────────────────────────────────────────────────────────────
  const setF = <K extends keyof Filters>(key: K, val: Filters[K]) =>
    setFilters(f => ({ ...f, [key]: val }));

  // ── AI search ─────────────────────────────────────────────────────────────────
  async function handleAiSearch() {
    if (!aiQuery.trim()) return;
    setAiLoading(true);
    setAiMsg(null);
    try {
      const res  = await fetch("/api/parse-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: aiQuery }),
      });
      const data = await res.json();
      if (data.noKey)     { setAiMsg("AI arama yapılandırılmamış."); return; }
      if (data.noCredits) { setAiMsg("AI arama için bakiye gerekli — filtreler yine çalışır."); return; }
      if (data.error)     { setAiMsg(`Hata: ${data.error}`); return; }

      const f = data.filters as Partial<Filters & { type: string[] }>;
      setFilters(prev => ({
        ...prev,
        ...(f.type             ? { type:             f.type             } : {}),
        ...(f.flag             ? { flag:             f.flag             } : {}),
        ...(f.scrapRisk        ? { scrapRisk:        f.scrapRisk        } : {}),
        ...(f.ageMin           ? { ageMin:           String(f.ageMin)   } : {}),
        ...(f.ageMax           ? { ageMax:           String(f.ageMax)   } : {}),
        ...(f.dwtMin           ? { dwtMin:           String(f.dwtMin)   } : {}),
        ...(f.dwtMax           ? { dwtMax:           String(f.dwtMax)   } : {}),
        ...(f.ldtMin           ? { ldtMin:           String(f.ldtMin)   } : {}),
        ...(f.ldtMax           ? { ldtMax:           String(f.ldtMax)   } : {}),
        ...(f.hasDetention     !== undefined ? { hasDetention:     f.hasDetention     } : {}),
        ...(f.specialSurvey6mo !== undefined ? { specialSurvey6mo: f.specialSurvey6mo } : {}),
        ...(f.hasContact       !== undefined ? { hasContact:       f.hasContact       } : {}),
      }));
      setAiMsg("Filtreler uygulandı ✓");
    } catch { setAiMsg("Bağlantı hatası."); }
    finally { setAiLoading(false); }
  }

  // ── CSV download ──────────────────────────────────────────────────────────────
  function downloadCsv() {
    window.open(`/api/vessels/search?${buildParams(filters, 1)}&csv=true`);
  }

  // ── select all ────────────────────────────────────────────────────────────────
  function toggleSelectAll() {
    if (selected.size === results.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(results.map(r => r.imo)));
    }
  }

  const inp = {
    background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`,
    borderRadius: 6, padding: "5px 8px", color: C.fg, fontSize: 12,
    width: "100%", boxSizing: "border-box" as const,
  };

  return (
    <div style={{ display: "flex", minHeight: "calc(100vh - 110px)", background: C.navy, color: C.fg, fontFamily: "Inter, sans-serif" }}>

      {/* ── Filter panel ─────────────────────────────────────────────────────── */}
      <div style={{
        width: 240, flexShrink: 0, background: C.mid,
        borderRight: `1px solid ${C.border}`,
        padding: "20px 16px", overflowY: "auto", position: "sticky",
        top: 0, maxHeight: "calc(100vh - 110px)",
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.steel, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16 }}>
          Filtreler
        </div>

        {/* hasContact toggle */}
        <div style={{ marginBottom: 20 }}>
          <Toggle checked={filters.hasContact} onChange={v => setF("hasContact", v)} label="İletişimi olanlar" />
        </div>

        {/* Email confidence */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: C.steel, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Email güveni</div>
          <MultiCheck
            options={[
              { value: "verified",  label: "🟢 Doğrulandı" },
              { value: "catch-all", label: "🟡 Catch-all" },
              { value: "unchecked", label: "⚪ Doğrulanmadı" },
            ]}
            value={filters.emailStatus}
            onChange={v => setF("emailStatus", v)}
          />
        </div>

        {/* Scrap risk */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: C.steel, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Scrap riski</div>
          <MultiCheck
            options={[
              { value: "critical", label: "🔴 Critical (≥70)" },
              { value: "high",     label: "🟠 High (50-69)"   },
              { value: "medium",   label: "🟡 Medium (25-49)" },
            ]}
            value={filters.scrapRisk}
            onChange={v => setF("scrapRisk", v)}
          />
        </div>

        {/* Age */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: C.steel, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Yaş (yıl)</div>
          <NumberRange labelMin="Min" labelMax="Max" valMin={filters.ageMin} valMax={filters.ageMax}
            onMin={v => setF("ageMin", v)} onMax={v => setF("ageMax", v)} />
        </div>

        {/* Type */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: C.steel, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Gemi tipi</div>
          <MultiCheck
            options={VESSEL_TYPES.map(t => ({ value: t, label: t }))}
            value={filters.type}
            onChange={v => setF("type", v)}
          />
        </div>

        {/* Flag */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: C.steel, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Bayrak</div>
          <input style={inp} placeholder="Panama, Liberia…" value={filters.flag}
            onChange={e => setF("flag", e.target.value)} />
        </div>

        {/* DWT */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: C.steel, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>DWT</div>
          <NumberRange labelMin="Min" labelMax="Max" valMin={filters.dwtMin} valMax={filters.dwtMax}
            onMin={v => setF("dwtMin", v)} onMax={v => setF("dwtMax", v)} />
        </div>

        {/* LDT */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: C.steel, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>LDT</div>
          <NumberRange labelMin="Min" labelMax="Max" valMin={filters.ldtMin} valMax={filters.ldtMax}
            onMin={v => setF("ldtMin", v)} onMax={v => setF("ldtMax", v)} />
        </div>

        {/* Extras */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: C.steel, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Özel</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={filters.specialSurvey6mo}
                onChange={e => setF("specialSurvey6mo", e.target.checked)}
                style={{ accentColor: C.gold }} />
              <span style={{ fontSize: 12, color: C.fg }}>Special survey ≤6 ay</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={filters.hasDetention}
                onChange={e => setF("hasDetention", e.target.checked)}
                style={{ accentColor: C.gold }} />
              <span style={{ fontSize: 12, color: C.fg }}>Detention var</span>
            </label>
          </div>
        </div>

        {/* Reset */}
        <button
          onClick={() => setFilters(DEFAULT_FILTERS)}
          style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`,
            borderRadius: 6, padding: "7px 0", color: C.steel, fontSize: 12, cursor: "pointer" }}
        >
          Temizle
        </button>
      </div>

      {/* ── Results panel ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* AI search bar */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, background: C.mid }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              style={{ ...inp, flex: 1, fontSize: 13, padding: "8px 12px" }}
              placeholder='AI arama: "25 yaş üzeri Türk bayraklı tankerler" veya "critical scrap, iletişimi olan bulk carrier"'
              value={aiQuery}
              onChange={e => setAiQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAiSearch()}
            />
            <button
              onClick={handleAiSearch}
              disabled={aiLoading}
              style={{ background: C.gold, border: "none", borderRadius: 6, padding: "8px 16px",
                color: C.navy, fontSize: 12, fontWeight: 700, cursor: aiLoading ? "default" : "pointer",
                opacity: aiLoading ? 0.7 : 1, whiteSpace: "nowrap" }}
            >
              {aiLoading ? "…" : "AI Ara"}
            </button>
          </div>
          {aiMsg && (
            <div style={{ fontSize: 11, color: C.steel, marginTop: 6 }}>{aiMsg}</div>
          )}
        </div>

        {/* Toolbar */}
        <div style={{ padding: "10px 20px", borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: C.navy }}>
          <div style={{ fontSize: 12, color: C.steel }}>
            {loading ? "Yükleniyor…" : `${total.toLocaleString()} sonuç`}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={toggleSelectAll}
              style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`,
                borderRadius: 6, padding: "5px 12px", color: C.fg, fontSize: 11, cursor: "pointer" }}
            >
              {selected.size === results.length && results.length > 0 ? "Seçimi Kaldır" : "Tümünü Seç"}
            </button>
            <button
              onClick={downloadCsv}
              style={{ background: "rgba(29,158,117,0.15)", border: `1px solid rgba(29,158,117,0.3)`,
                borderRadius: 6, padding: "5px 12px", color: C.green, fontSize: 11, fontWeight: 600, cursor: "pointer" }}
            >
              ↓ CSV İndir
            </button>
          </div>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.card, position: "sticky", top: 0, zIndex: 5 }}>
                <th style={{ ...th, width: 44 }}></th>
                <th style={th}><input type="checkbox"
                  checked={selected.size === results.length && results.length > 0}
                  onChange={toggleSelectAll} style={{ accentColor: C.gold }} /></th>
                <th style={th}>Gemi</th>
                <th style={th}>IMO</th>
                <th style={th}>Yaş</th>
                <th style={th}>Tip</th>
                <th style={th}>DWT</th>
                <th style={th}>Scrap</th>
                <th style={th}>Yönetici</th>
                <th style={th}>Email</th>
                <th style={th}>Telefon</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {results.map((v, i) => (
                <tr key={v.imo}
                  style={{ background: i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent",
                    borderBottom: `1px solid ${C.border}`, cursor: "default" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(201,168,76,0.05)")}
                  onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent")}
                >
                  {/* Photo thumbnail */}
                  <td style={{ ...td, padding: "4px 6px", width: 44 }}>
                    {v.photoThumb ? (
                      <a href={v.photoPageUrl ?? v.photoThumb} target="_blank" rel="noreferrer" title={`© ${v.photoArtist ?? "Unknown"} / ${v.photoLicense ?? ""}`}>
                        <img
                          src={v.photoThumb}
                          alt={v.name}
                          style={{ width: 40, height: 30, objectFit: "cover", borderRadius: 4, display: "block", border: "1px solid rgba(255,255,255,0.1)" }}
                          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      </a>
                    ) : (
                      <div style={{ width: 40, height: 30, borderRadius: 4, background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg viewBox="0 0 40 30" width={36} height={28} style={{ opacity: 0.15 }}>
                          <path d={
                            (v.type || "").toLowerCase().includes("tanker")
                              ? "M2 26 L5 18 L10 16 L30 16 L35 20 L38 26 Z M11 16 L12 11 L16 11 L16 16 Z"
                              : "M2 26 L5 18 L10 15 L30 15 L35 18 L38 26 Z M11 15 L11 10 L18 10 L18 15 Z"
                          } fill="#8FA8B2" />
                        </svg>
                      </div>
                    )}
                  </td>
                  <td style={td}>
                    <input type="checkbox" checked={selected.has(v.imo)}
                      onChange={() => setSelected(s => {
                        const n = new Set(s);
                        n.has(v.imo) ? n.delete(v.imo) : n.add(v.imo);
                        return n;
                      })} style={{ accentColor: C.gold }} />
                  </td>
                  <td style={{ ...td, fontWeight: 600, color: C.fg, maxWidth: 160 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name || "—"}</div>
                    {v.flag && <div style={{ fontSize: 10, color: C.steel, marginTop: 1 }}>{v.flag}</div>}
                  </td>
                  <td style={{ ...td, fontFamily: "monospace", color: C.steel, fontSize: 11 }}>{v.imo}</td>
                  <td style={td}>{v.age ? `${v.age}y` : "—"}</td>
                  <td style={{ ...td, color: C.steel, maxWidth: 120 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.type || "—"}</div>
                  </td>
                  <td style={{ ...td, color: C.steel }}>{v.deadweight ? `${Math.round(v.deadweight/1000)}k` : "—"}</td>
                  <td style={td}><ScrapBadge score={v.scrapScore} /></td>
                  <td style={{ ...td, color: C.steel, maxWidth: 140 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {v.manager || v.ownerName || "—"}
                    </div>
                  </td>
                  <td style={td}>
                    {v.bestEmail ? (
                      <div>
                        <div style={{ fontFamily: "monospace", fontSize: 10, color: C.fg,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
                          {v.bestEmail}
                        </div>
                        <EmailBadge status={v.emailStatus} />
                      </div>
                    ) : <span style={{ color: C.steel }}>—</span>}
                  </td>
                  <td style={{ ...td, fontFamily: "monospace", fontSize: 10, color: C.steel }}>
                    {v.phone || "—"}
                  </td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      {v.bestEmail && (
                        <a
                          href={`mailto:${v.bestEmail}?subject=Sale/Purchase Inquiry — MV ${v.name} (IMO ${v.imo})`}
                          style={{ fontSize: 10, color: C.green, textDecoration: "none",
                            padding: "2px 6px", border: `1px solid rgba(29,158,117,0.3)`,
                            borderRadius: 4, display: "inline-block" }}
                          title="Email gönder"
                        >✉</a>
                      )}
                      <button
                        onClick={() => setSelectedImo(v.imo)}
                        style={{ fontSize: 10, color: C.gold, background: "none",
                          border: `1px solid rgba(201,168,76,0.3)`, borderRadius: 4,
                          padding: "2px 6px", cursor: "pointer" }}
                        title="Panelde aç"
                      >↗</button>
                      <a
                        href={v.linkedinUrl || `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(v.manager || v.name || "")}`}
                        target="_blank" rel="noreferrer"
                        style={{ fontSize: 10, color: "#6CB8E6", textDecoration: "none",
                          padding: "2px 6px", border: `1px solid rgba(108,184,230,0.3)`, borderRadius: 4 }}
                        title="LinkedIn"
                      >in</a>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && results.length === 0 && (
                <tr><td colSpan={11} style={{ padding: 40, textAlign: "center", color: C.steel }}>
                  Sonuç bulunamadı — filtreleri değiştirin.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            background: C.mid }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              style={pgBtn(page === 1)}>← Önceki</button>
            <span style={{ fontSize: 12, color: C.steel }}>
              {page} / {pages}
            </span>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
              style={pgBtn(page === pages)}>Sonraki →</button>
          </div>
        )}
      </div>

      {/* Vessel panel overlay */}
      {selectedImo && (
        <VesselPanel imo={selectedImo} onClose={() => setSelectedImo(null)} />
      )}
    </div>
  );
}

// ─── Table styles ──────────────────────────────────────────────────────────────

const th: React.CSSProperties = {
  padding: "10px 12px", textAlign: "left", fontSize: 10,
  fontWeight: 700, color: "#8FA8B2", textTransform: "uppercase",
  letterSpacing: "0.08em", borderBottom: "1px solid rgba(255,255,255,0.08)",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "10px 12px", verticalAlign: "middle",
};

const pgBtn = (disabled: boolean): React.CSSProperties => ({
  background: disabled ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6, padding: "6px 14px", color: disabled ? "#8FA8B2" : "#E8F0F3",
  fontSize: 12, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1,
});
