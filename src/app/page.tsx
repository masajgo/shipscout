"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import VesselPanel from "@/components/VesselPanel";

const SHIP_TYPES = ["All", "Bulk Carrier", "Tanker", "Container", "General Cargo", "Cruise", "Offshore"];
const SIGNALS    = ["All Signals", "Detained", "AIS Dark", "Lay-up", "P&I Withdrawn", "Survey Due"];

const STATUS_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  r: { color: "#F04438", bg: "#FEF3F2", border: "#FECDCA" },
  a: { color: "#DC6803", bg: "#FFFAEB", border: "#FEF0C7" },
  b: { color: "#2563EB", bg: "#EFF8FF", border: "#B2DDFF" },
  g: { color: "#1D9E75", bg: "#ECFDF3", border: "#A9EFC5" },
};

const SHIP_TYPE_ICONS: Record<string, string> = {
  "Bulk Carrier":  "BC",
  "Tanker":        "TK",
  "Container":     "CT",
  "General Cargo": "GC",
  "Cruise":        "CR",
  "Offshore":      "OS",
};

function fmtScrap(usd: number | null | undefined, est: boolean | null | undefined): string | null {
  if (!usd || usd < 100_000) return null;
  const m = usd / 1_000_000;
  return `${est ? "~" : ""}$${m >= 10 ? m.toFixed(1) : m.toFixed(2)}M`;
}

type Stats = {
  totalVessels: number;
  critical: number;
  highRisk: number;
  withImo: number;
  ownersFound: number;
};

export default function Home() {
  const [vessels, setVessels]       = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [typeFilter, setTypeFilter] = useState("All");
  const [signalFilter, setSignalFilter] = useState("All Signals");
  const [selectedIMO, setSelectedIMO]  = useState<string | null>(null);
  const [sortBy, setSortBy]             = useState<"score"|"age"|"value">("score");
  const [stats, setStats]               = useState<Stats | null>(null);
  const [search, setSearch]             = useState("");
  const router = useRouter();

  useEffect(() => {
    fetch("/api/vessels?list=1")
      .then(r => r.json())
      .then(d => { setVessels(d.vessels || []); setLoading(false); })
      .catch(() => { setFetchError(true); setLoading(false); });
  }, []);

  useEffect(() => {
    fetch("/api/stats")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error) setStats(d); })
      .catch(() => {});
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (search.trim()) router.push(`/map?search=${encodeURIComponent(search.trim())}`);
  }

  const currentYear = new Date().getFullYear();
  const filtered = vessels
    .filter(v => {
      if (typeFilter !== "All" && !(v.type || "").toLowerCase().includes(typeFilter.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "age")   return (a.age ?? 0) < (b.age ?? 0) ? 1 : -1;
      if (sortBy === "value") return (b.scrap_value_usd ?? 0) - (a.scrap_value_usd ?? 0);
      return (b.score ?? 0) - (a.score ?? 0);
    });

  return (
    <div style={{ background: "#F9FAFB", minHeight: "100vh" }}>

      {/* HERO */}
      <div style={{ background: "#F8F9FA", padding: "72px 48px 60px", position: "relative", overflow: "hidden", borderBottom: "1px solid #E2E8F0" }}>
        {/* Dot grid */}
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(11,30,61,0.05) 1px, transparent 1px)", backgroundSize: "28px 28px", pointerEvents: "none" }} />
        {/* Navy glow bottom-left */}
        <div style={{ position: "absolute", bottom: -100, left: -100, width: 500, height: 500, background: "radial-gradient(ellipse, rgba(11,30,61,0.07), transparent 65%)", pointerEvents: "none" }} />

        <div style={{ position: "relative", zIndex: 2, maxWidth: 1200, margin: "0 auto", display: "flex", gap: 64, alignItems: "center" }}>

          {/* LEFT */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Live badge */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid #C9A84C", borderRadius: 100, padding: "5px 14px", marginBottom: 24, background: "rgba(201,168,76,0.06)" }}>
              <span style={{ color: "#1D9E75", fontSize: 10 }}>●</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#0B1E3D", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>Live AIS Tracking</span>
            </div>

            <h1 style={{ fontSize: 52, fontWeight: 800, color: "#0B1E3D", letterSpacing: "-2px", lineHeight: 1.05, margin: "0 0 20px" }}>
              The World&apos;s Most<br />
              Comprehensive Vessel<br />
              Intelligence <span style={{ color: "#C9A84C" }}>Platform</span>
            </h1>

            <p style={{ fontSize: 18, color: "#4A5568", lineHeight: 1.6, margin: "0 0 36px", fontWeight: 400 }}>
              Search. Compare. Contact Owners.
            </p>

            {/* Search box */}
            <form onSubmit={handleSearch} style={{ display: "flex", background: "#fff", borderRadius: 12, border: "1px solid #E2E8F0", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", overflow: "hidden", marginBottom: 44 }}>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by vessel name, IMO, MMSI..."
                style={{ flex: 1, padding: "18px 22px", fontSize: 14, border: "none", outline: "none", color: "#1A1A2E", background: "transparent", fontFamily: "Inter, sans-serif" }}
              />
              <button type="submit" style={{ padding: "18px 32px", background: "#0B1E3D", color: "#fff", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", letterSpacing: "0.04em", flexShrink: 0 }}>
                Search
              </button>
            </form>

            {/* Stats row */}
            <div style={{ display: "flex", gap: 36, flexWrap: "wrap" as const }}>
              {[
                { icon: "⚓", value: stats ? stats.totalVessels.toLocaleString() : "—", label: "Vessels Tracked" },
                { icon: "👤", value: stats ? stats.ownersFound.toLocaleString() : "—", label: "Owners Found" },
                { icon: "🌍", value: "150+", label: "Countries" },
                { icon: "🕐", value: "24/7", label: "Real-time AIS" },
              ].map(s => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 22 }}>{s.icon}</div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#0B1E3D", lineHeight: 1 }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: "#8896A5", textTransform: "uppercase" as const, letterSpacing: "0.04em", marginTop: 2 }}>{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT — featured vessel card */}
          <div className="hero-right" style={{ width: 380, flexShrink: 0 }}>
            {(() => {
              const featured = vessels[0];
              if (!featured) return (
                <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E2E8F0", padding: 40, textAlign: "center", color: "#8896A5" }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>⚓</div>
                  <div style={{ fontSize: 13 }}>{loading ? "Loading..." : "No data"}</div>
                </div>
              );
              const catColors: Record<string, { bg: string; color: string }> = {
                critical: { bg: "#7F1D1D", color: "#FCA5A5" },
                high:     { bg: "#78350F", color: "#FCD34D" },
                medium:   { bg: "#1C3D5A", color: "#93C5FD" },
                low:      { bg: "#1A2E1A", color: "#86EFAC" },
              };
              const cat = catColors[featured.scrap_category] ?? catColors.low;
              const sv = featured.scrap_value_usd && featured.scrap_value_usd > 100_000
                ? `${featured.scrap_value_estimated ? "~" : ""}$${(featured.scrap_value_usd / 1_000_000).toFixed(1)}M`
                : null;
              return (
                <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E2E8F0", padding: 24, boxShadow: "0 8px 32px rgba(11,30,61,0.10)" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#C9A84C", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 16 }}>
                    Featured Vessel
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#0B1E3D", lineHeight: 1.2 }}>
                      {featured.name || `IMO ${featured.imo}`}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 100, background: cat.bg, color: cat.color, flexShrink: 0 }}>
                      {(featured.scrap_category || "").toUpperCase()}
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px", marginBottom: 20 }}>
                    {[
                      { label: "IMO",   value: featured.imo },
                      { label: "Type",  value: featured.type || "—" },
                      { label: "Built", value: featured.built_year ? `${featured.built_year} · ${featured.age}y` : "—" },
                      { label: "Flag",  value: featured.flag || "—" },
                    ].map(r => (
                      <div key={r.label}>
                        <div style={{ fontSize: 10, color: "#8896A5", textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 2 }}>{r.label}</div>
                        <div style={{ fontSize: 13, color: "#0B1E3D", fontWeight: 500 }}>{r.value}</div>
                      </div>
                    ))}
                  </div>
                  {sv && (
                    <div style={{ background: "rgba(201,168,76,0.08)", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
                      <div style={{ fontSize: 10, color: "#8896A5", textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 2 }}>Est. Scrap Value</div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: "#C9A84C" }}>{sv}</div>
                    </div>
                  )}
                  <button
                    onClick={() => setSelectedIMO(featured.imo)}
                    style={{ width: "100%", padding: "11px 20px", background: "#C9A84C", color: "#0B1E3D", fontSize: 13, fontWeight: 700, border: "none", borderRadius: 8, cursor: "pointer", marginBottom: 12 }}
                  >
                    View Details →
                  </button>
                  <div style={{ display: "flex", gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: "#1D9E75", border: "1px solid rgba(29,158,117,0.3)", borderRadius: 100, padding: "3px 10px" }}>● LIVE AIS</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: "#0B1E3D", border: "1px solid #E2E8F0", borderRadius: 100, padding: "3px 10px" }}>✓ VERIFIED</span>
                  </div>
                </div>
              );
            })()}
          </div>

        </div>
      </div>

      {/* GREEN IMPACT */}
      <div style={{ background: "#0C1F17", padding: "28px 32px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(29,158,117,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(29,158,117,0.04) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
        <div style={{ position: "relative", zIndex: 2, maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <div style={{ width: 24, height: 2, background: "#1D9E75" }} />
            <div style={{ fontSize: 10, fontWeight: 700, color: "#34D399", letterSpacing: "0.16em", textTransform: "uppercase" as const }}>Sustainable Recycling Impact</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            {[
              { n: "90", u: "%", l: "of each vessel recovered — steel, machinery, equipment reused", w: "90%" },
              { n: "412K", u: " t", l: "steel recycled back into construction supply chains", w: "72%" },
              { n: "68", u: "%", l: "of tracked yards now HKC-certified or in certification", w: "68%" },
              { n: "100", u: "%", l: "of deals routed to compliant, audited recycling facilities", w: "100%" },
            ].map(c => (
              <div key={c.l}>
                <div style={{ fontSize: 30, fontWeight: 800, color: "#fff", letterSpacing: "-1px", lineHeight: 1 }}>{c.n}<span style={{ fontSize: 16, color: "#34D399" }}>{c.u}</span></div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 6, lineHeight: 1.4 }}>{c.l}</div>
                <div style={{ height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, marginTop: 12, overflow: "hidden" }}>
                  <div style={{ height: "100%", background: "#1D9E75", borderRadius: 2, width: c.w }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 24, marginTop: 24, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.5, flex: 1 }}>
              <strong style={{ color: "#fff", fontWeight: 600 }}>Every vessel we surface is matched only to responsible yards.</strong> ShipScout cross-checks recycling facilities against Hong Kong Convention and EU SRR certification before any introduction is made.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {["HKC Compliant", "EU SRR", "IHM Verified"].map(b => (
                <div key={b} style={{ fontSize: 10, fontWeight: 600, color: "#34D399", border: "1px solid rgba(52,211,153,0.3)", background: "rgba(52,211,153,0.08)", padding: "6px 12px", borderRadius: 6, letterSpacing: "0.04em" }}>{b}</div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* FILTER BAR */}
      <div style={{ background: "#fff", borderBottom: "1px solid #EAECF0", padding: "10px 28px", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" as const }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "#98A2B3", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginRight: 4 }}>Type</span>
        {SHIP_TYPES.map(t => (
          <button key={t} onClick={() => setTypeFilter(t)} style={{
            fontSize: 12, padding: "5px 12px", borderRadius: 6,
            border: `1px solid ${typeFilter === t ? "#101828" : "#EAECF0"}`,
            background: typeFilter === t ? "#101828" : "#fff",
            color: typeFilter === t ? "#fff" : "#667085",
            cursor: "pointer", fontFamily: "Inter, sans-serif", transition: "all 0.15s",
          }}>{t}</button>
        ))}
        <div style={{ width: 1, height: 20, background: "#EAECF0", margin: "0 4px" }} />
        <span style={{ fontSize: 10, fontWeight: 600, color: "#98A2B3", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginRight: 4 }}>Signal</span>
        {SIGNALS.map(s => (
          <button key={s} onClick={() => setSignalFilter(s)} style={{
            fontSize: 12, padding: "5px 12px", borderRadius: 6,
            border: `1px solid ${signalFilter === s ? "#1D9E75" : "#EAECF0"}`,
            background: signalFilter === s ? "#ECFDF3" : "#fff",
            color: signalFilter === s ? "#1D9E75" : "#667085",
            cursor: "pointer", fontFamily: "Inter, sans-serif", transition: "all 0.15s",
          }}>{s}</button>
        ))}
      </div>

      {/* VESSEL LIST */}
      <div id="vessels" style={{ padding: "20px 28px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#101828" }}>
              {loading ? "Loading vessels..." : `${filtered.length} vessels found`}
              {!loading && filtered.length > 0 && (() => {
                const totalUSD = filtered.reduce((s, v) => s + (v.scrap_value_usd ?? 0), 0);
                return totalUSD > 0 ? (
                  <span style={{ fontSize: 12, fontWeight: 500, color: "#1D9E75", marginLeft: 10 }}>
                    · ~${(totalUSD / 1_000_000).toFixed(0)}M total est. scrap value
                  </span>
                ) : null;
              })()}
            </div>
            <div style={{ fontSize: 12, color: "#98A2B3", marginTop: 2 }}>
              {sortBy === "score" ? "Sorted by scrap score — highest opportunity first" : sortBy === "age" ? "Sorted by age — oldest first" : "Sorted by estimated value — highest first"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {(["score","age","value"] as const).map(s => (
              <button key={s} onClick={() => setSortBy(s)} style={{ fontSize: 12, color: sortBy===s ? "#101828" : "#667085", border: `1px solid ${sortBy===s ? "#101828" : "#EAECF0"}`, padding: "6px 14px", borderRadius: 7, background: sortBy===s ? "#F2F4F7" : "#fff", cursor: "pointer", fontFamily: "Inter, sans-serif", textTransform: "capitalize" }}>
                {s === "score" ? "Score ▾" : s === "age" ? "Age ▾" : "Value ▾"}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: "48px", color: "#98A2B3", fontSize: 13 }}>
            Loading live vessel data from Datalastic...
          </div>
        )}
        {fetchError && (
          <div style={{ textAlign: "center", padding: "48px", color: "#F87171", fontSize: 13 }}>
            Failed to load vessel data. Please refresh the page.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {!loading && filtered.length === 0 && vessels.length > 0 && (
            <div style={{ textAlign: "center", padding: "48px 20px", color: "#98A2B3" }}>
              <div style={{ fontSize: 13, marginBottom: 10 }}>No vessels match your current filters.</div>
              <button onClick={() => { setTypeFilter("All"); setSignalFilter("All Signals"); }} style={{ fontSize: 12, fontWeight: 600, color: "#1D9E75", border: "1px solid #A9EFC5", background: "#ECFDF3", padding: "7px 16px", borderRadius: 7, cursor: "pointer" }}>
                Clear filters
              </button>
            </div>
          )}
          {filtered.map(v => {
            const age      = currentYear - v.built;
            const sc       = STATUS_COLORS[v.statusType] ?? STATUS_COLORS.g;
            const typeCode = SHIP_TYPE_ICONS[v.type] || "VS";
            return (
              <div key={v.imo}
                className="vessel-card"
                onClick={() => setSelectedIMO(v.imo)}
                style={{
                  background: "#fff",
                  border: "1px solid #EAECF0",
                  borderLeft: v.statusType === "r" ? "3px solid #F04438" : v.statusType === "a" ? "3px solid #DC6803" : "1px solid #EAECF0",
                  borderRadius: v.statusType === "r" || v.statusType === "a" ? "0 10px 10px 0" : 10,
                  padding: "16px 20px",
                  display: "flex", alignItems: "center", gap: 16,
                  cursor: "pointer",
                  boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
                }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 10, background: "#F9FAFB", border: "1px solid #EAECF0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#344054", letterSpacing: 0.5 }}>{typeCode}</div>
                </div>

                <div style={{ width: 48, textAlign: "center", flexShrink: 0 }}>
                  <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -1, lineHeight: 1, color: v.statusType === "r" ? "#F04438" : v.statusType === "a" ? "#DC6803" : "#1D9E75" }}>{v.score}</div>
                  <div style={{ fontSize: 8, fontWeight: 600, letterSpacing: "0.1em", color: "#98A2B3", textTransform: "uppercase" as const, marginTop: 2 }}>Score</div>
                </div>

                <div style={{ width: 1, height: 36, background: "#EAECF0", flexShrink: 0 }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#101828" }}>{v.name}</span>
                    <span style={{ fontSize: 11, color: "#C8CDD6", fontFamily: "monospace", marginLeft: 10 }}>IMO {v.imo}</span>
                  </div>
                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap" as const }}>
                    {[
                      v.type ? { label: "Type",  val: v.type } : null,
                      v.built_year ? { label: "Built", val: `${v.built_year} · ${v.age ?? currentYear - v.built_year}y` } : null,
                      v.dwt  ? { label: "DWT", val: `${(v.dwt).toLocaleString()} t` } : null,
                      v.ldt  ? { label: "LDT", val: `${(v.ldt).toLocaleString()} t${v.ldt_estimated ? " ~" : ""}` } : null,
                      v.flag ? { label: "Flag", val: v.flag } : null,
                    ].filter(Boolean).map(s => s && (
                      <div key={s.label}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#344054" }}>{s.val}</div>
                        <div style={{ fontSize: 9, fontWeight: 500, color: "#98A2B3", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginTop: 1 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Scrap value */}
                {(() => {
                  const sv = fmtScrap(v.scrap_value_usd, v.scrap_value_estimated);
                  return sv ? (
                    <div style={{ textAlign: "right", flexShrink: 0, minWidth: 90 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#101828", letterSpacing: -0.5 }}>{sv}</div>
                      <div style={{ fontSize: 9, color: "#98A2B3", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginTop: 2 }}>Est. scrap value</div>
                    </div>
                  ) : <div style={{ minWidth: 90 }} />;
                })()}

                <div style={{ color: "#C8CDD6", fontSize: 18, flexShrink: 0 }}>→</div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedIMO && (
        <VesselPanel imo={selectedIMO} onClose={() => setSelectedIMO(null)} />
      )}
    </div>
  );
}
