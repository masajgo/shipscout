"use client";
import { useState, useRef } from "react";

type Contact = {
  name: string | null; title: string | null; email: string | null;
  linkedin: string | null; confidence: number | null; type: string | null; source: string;
};

type VesselEvent = {
  id: number; event_type: string; source: string | null;
  title: string | null; url: string | null; summary: string | null;
  created_at: string;
};

type Vessel = {
  imo: string; mmsi: string; name: string; type: string; flag: string;
  age: number | null; builtYear: number | null;
  deadweight: number | null; ldt: number | null; grossTonnage: number | null;
  scrapScore: number | null; scrapCategory: string | null;
  detentionCount: number; deficiencyCount: number; inspectionCount: number | null;
  specialSurveyDate: string | null; dryDockDate: string | null;
  lastDryDockDate: string | null; ioppExpDate: string | null;
  lastInspectionDate: string | null;
  callsign: string | null; homePort: string | null; teu: number | null;
  length: number | null; beam: number | null; draught: number | null;
  speed: number | null; course: number | null; navStatus: number | null;
  destination: string | null; eta: string | null; lastPosUpdate: string | null;
  bestEmail: string | null; phone: string | null;
  website: string | null; linkedinUrl: string | null; linkedinPeopleUrl: string | null;
  ownerName: string | null; manager: string | null;
  ismManager: string | null; companyAddress: string | null;
  companyCountry: string | null; companyType: string | null;
  fleetCount: number | null; fleetAvgAge: number | null;
  fleetTotalDwt: number | null; fleetCritical: number | null;
  contacts: Contact[];
  allEmails: string[]; allPhones: string[];
  emailValidations: Record<string, { status?: string }>;
  enriched: boolean;
};

const NAV_STATUS: Record<number, string> = {
  0: "Underway (engine)", 1: "Anchored", 2: "Not under command",
  3: "Restricted maneuverability", 5: "Moored", 6: "Aground",
  7: "Fishing", 8: "Underway (sailing)", 15: "Default",
};

const SCORE_COLOR = (s: number | null | undefined) =>
  !s ? "#94A3B8" : s >= 70 ? "#DC2626" : s >= 50 ? "#D97706" : s >= 25 ? "#2563EB" : "#94A3B8";

function ScrapBadge({ score }: { score: number | null | undefined }) {
  const c = SCORE_COLOR(score);
  const label = !score ? "low" : score >= 70 ? "critical" : score >= 50 ? "high" : score >= 25 ? "medium" : "low";
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
      border: `1px solid ${c}40`, background: `${c}12`, color: c,
      textTransform: "uppercase", letterSpacing: "0.05em" }}>
      {label}{score != null ? ` · ${score}` : ""}
    </span>
  );
}

function Sect({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase",
        letterSpacing: "0.1em", marginBottom: 8, borderBottom: "1px solid #F1F5F9", paddingBottom: 4 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, href }: { label: string; value: string | null | undefined; href?: string }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 13, marginBottom: 4 }}>
      <span style={{ color: "#94A3B8", minWidth: 130, flexShrink: 0 }}>{label}</span>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer"
          style={{ color: "#2563EB", textDecoration: "none", wordBreak: "break-all" }}>{value}</a>
      ) : (
        <span style={{ color: "#0F172A", fontWeight: 500, wordBreak: "break-all" }}>{value}</span>
      )}
    </div>
  );
}

function fmt(d: string | null | undefined) {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function VesselsPage() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"all" | "imo" | "vessel" | "company">("all");
  const [aiMode, setAiMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Vessel[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [aiInterpretation, setAiInterpretation] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [enriching, setEnriching] = useState<Set<string>>(new Set());
  const [vesselEvents, setVesselEvents] = useState<Map<string, VesselEvent[]>>(new Map());
  const inputRef = useRef<HTMLInputElement>(null);

  async function fetchEvents(imo: string) {
    if (vesselEvents.has(imo)) return;
    try {
      const res = await fetch(`/api/vessel/${imo}/events`);
      if (!res.ok) return;
      const data = await res.json();
      setVesselEvents(prev => new Map(prev).set(imo, data.events ?? []));
    } catch { /* ignore */ }
  }

  function toggleExpand(imo: string) {
    setExpanded(prev => {
      const s = new Set(prev);
      if (s.has(imo)) { s.delete(imo); } else { s.add(imo); fetchEvents(imo); }
      return s;
    });
  }

  async function search() {
    const q = query.trim();
    if (!q) return;
    setLoading(true); setError(""); setAiInterpretation(""); setExpanded(new Set());

    try {
      let apiUrl = `/api/vessels/search?limit=50&hasContact=false`;

      if (aiMode) {
        const parseRes = await fetch("/api/parse-search", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q }),
        });
        const parsed = await parseRes.json();
        if (parsed.interpretation) setAiInterpretation(parsed.interpretation);
        if (parsed.params) {
          const ps = new URLSearchParams(parsed.params);
          ps.set("hasContact", "false"); ps.set("limit", "50");
          apiUrl = `/api/vessels/search?${ps.toString()}`;
        }
      } else {
        apiUrl += `&q=${encodeURIComponent(q)}`;
      }

      const res = await fetch(apiUrl);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Search failed"); return; }
      setResults(data.results ?? data.vessels ?? []);
      setTotal(data.total ?? null);
      setSearched(true);
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function triggerEnrich(imo: string) {
    setEnriching(prev => new Set(prev).add(imo));
    try {
      await fetch("/api/vessels/enrich", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imo }),
      });
      await search();
    } finally {
      setEnriching(prev => { const s = new Set(prev); s.delete(imo); return s; });
    }
  }

  const mgr = (v: Vessel) => v.manager ?? null;

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* Search header */}
      <div style={{ background: "#07122E", padding: "32px 24px 0" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 700, margin: "0 0 20px", letterSpacing: -0.3 }}>
            Vessel Search
          </h1>
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <input ref={inputRef} value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && search()}
              placeholder={aiMode ? 'e.g. "bulk carriers older than 25 years near Turkey"' :
                mode === "imo" ? "Enter 7-digit IMO…" :
                mode === "vessel" ? "Vessel name…" :
                mode === "company" ? "Company or manager name…" :
                "IMO, vessel name, or company…"}
              style={{ flex: 1, padding: "13px 18px", fontSize: 15,
                border: "2px solid rgba(255,255,255,0.15)", borderRadius: 8,
                background: "rgba(255,255,255,0.08)", color: "#fff", outline: "none" }}
            />
            <button onClick={search} disabled={loading} style={{
              background: "#C9A84C", color: "#07122E", border: "none",
              borderRadius: 8, padding: "0 24px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              {loading ? "Searching…" : "Search"}
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 2 }}>
              {([["all","All"],["imo","By IMO"],["vessel","By Vessel"],["company","By Company"]] as const).map(([val, label]) => (
                <button key={val} onClick={() => { setMode(val); setAiMode(false); }} style={{
                  background: mode === val && !aiMode ? "rgba(255,255,255,0.12)" : "none",
                  color: mode === val && !aiMode ? "#fff" : "rgba(255,255,255,0.5)",
                  border: "none", borderRadius: "6px 6px 0 0", padding: "8px 14px",
                  fontSize: 13, fontWeight: mode === val && !aiMode ? 600 : 400, cursor: "pointer",
                  borderBottom: mode === val && !aiMode ? "2px solid #C9A84C" : "2px solid transparent" }}>
                  {label}
                </button>
              ))}
            </div>
            <button onClick={() => { setAiMode(a => !a); setMode("all"); }} style={{
              background: aiMode ? "#C9A84C" : "rgba(255,255,255,0.1)",
              color: aiMode ? "#07122E" : "rgba(255,255,255,0.7)",
              border: "none", borderRadius: 6, padding: "6px 14px",
              fontSize: 12, fontWeight: 700, cursor: "pointer", marginBottom: 4 }}>
              ✦ AI Search
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 24px 64px" }}>

        {aiInterpretation && (
          <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8,
            padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#1D4ED8" }}>
            ✦ AI: <em>{aiInterpretation}</em>
          </div>
        )}

        {searched && !loading && (
          <p style={{ fontSize: 13, color: "#64748B", marginBottom: 16 }}>
            {total?.toLocaleString()} vessel{total !== 1 ? "s" : ""} found
            {results.length < (total ?? 0) ? ` — showing first ${results.length}` : ""}
          </p>
        )}

        {error && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8,
            padding: "12px 16px", color: "#DC2626", fontSize: 14, marginBottom: 16 }}>{error}</div>
        )}

        {!searched && !loading && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#94A3B8" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
            <p style={{ fontSize: 16, fontWeight: 600, color: "#64748B", marginBottom: 8 }}>
              Search by IMO, vessel name, owner or manager
            </p>
            <p style={{ fontSize: 13 }}>
              <span style={{ cursor: "pointer", color: "#2563EB", textDecoration: "underline" }}
                onClick={() => { setQuery("8009545"); setTimeout(search, 50); }}>8009545</span>
              {" · "}
              <span style={{ cursor: "pointer", color: "#2563EB", textDecoration: "underline" }}
                onClick={() => { setQuery("FESCO"); setTimeout(search, 50); }}>FESCO</span>
              {" · "}
              <span style={{ cursor: "pointer", color: "#2563EB", textDecoration: "underline" }}
                onClick={() => { setQuery("BALTIC HEATHER"); setTimeout(search, 50); }}>BALTIC HEATHER</span>
            </p>
          </div>
        )}

        {searched && !loading && results.length === 0 && !error && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#94A3B8" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>∅</div>
            <p style={{ fontSize: 15, color: "#64748B" }}>No vessels found for <strong>"{query}"</strong></p>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {results.map(v => {
            const isOpen = expanded.has(v.imo);
            const m = mgr(v);
            const hasContact = !!(v.allEmails?.length || v.allPhones?.length || v.website);

            return (
              <div key={v.imo} style={{ background: "#fff", border: "1px solid #E2E8F0",
                borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>

                {/* Header row — always visible */}
                <div style={{ padding: "14px 20px", cursor: "pointer", display: "flex",
                  alignItems: "flex-start", gap: 16, justifyContent: "space-between" }}
                  onClick={() => toggleExpand(v.imo)}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: "#0F172A" }}>M/V {v.name}</span>
                      <ScrapBadge score={v.scrapScore} />
                      {v.detentionCount > 0 && (
                        <span style={{ fontSize: 11, padding: "2px 6px", background: "#FEF2F2",
                          color: "#DC2626", border: "1px solid #FECACA", borderRadius: 4, fontWeight: 600 }}>
                          {v.detentionCount} detention{v.detentionCount > 1 ? "s" : ""}
                        </span>
                      )}
                      {!hasContact && !v.contacts?.length && (
                        <span style={{ fontSize: 11, color: "#CBD5E1", fontStyle: "italic" }}>no contact</span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: "#64748B" }}>
                      {v.type ?? "—"}{v.flag ? ` · ${v.flag}` : ""}{v.builtYear ? ` · Built ${v.builtYear}` : ""}
                      {v.age ? ` (${v.age}y)` : ""}
                      {v.deadweight ? ` · ${Number(v.deadweight).toLocaleString()} DWT` : ""}
                      {v.ldt ? ` · ${Number(v.ldt).toLocaleString()} LDT` : ""}
                    </div>
                    <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>
                      IMO {v.imo} · MMSI {v.mmsi}
                      {v.ownerName ? ` · ${v.ownerName}` : ""}
                      {m && m !== v.ownerName ? ` / ${m}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                    <a href={`/vessel/${v.imo}`} target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      style={{ fontSize: 12, color: "#2563EB", textDecoration: "none", fontWeight: 600 }}>
                      Report ↗
                    </a>
                    <span style={{ fontSize: 18, color: "#94A3B8" }}>{isOpen ? "▲" : "▼"}</span>
                  </div>
                </div>

                {/* Expanded detail — Equasis style */}
                {isOpen && (
                  <div style={{ borderTop: "1px solid #F1F5F9", padding: "20px 20px 24px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}>

                    {/* Column 1: Vessel particulars */}
                    <div>
                      <Sect title="Vessel Particulars">
                        <Row label="IMO Number"   value={v.imo} />
                        <Row label="MMSI"         value={v.mmsi} />
                        <Row label="Call Sign"    value={v.callsign} />
                        <Row label="Flag"         value={v.flag} />
                        <Row label="Home Port"    value={v.homePort} />
                        <Row label="Type"         value={v.type} />
                        <Row label="Built"        value={v.builtYear ? `${v.builtYear} (${v.age}y)` : null} />
                        <Row label="DWT"          value={v.deadweight ? `${Number(v.deadweight).toLocaleString()} t` : null} />
                        <Row label="Gross Tonnage" value={v.grossTonnage ? Number(v.grossTonnage).toLocaleString() : null} />
                        <Row label="LDT"          value={v.ldt ? `${Number(v.ldt).toLocaleString()} t` : null} />
                        {v.teu && <Row label="TEU" value={v.teu.toLocaleString()} />}
                        {v.length && <Row label="LOA × Beam" value={`${v.length}m × ${v.beam}m`} />}
                        {v.draught && <Row label="Draught" value={`${v.draught}m`} />}
                      </Sect>

                      <Sect title="AIS Status">
                        <Row label="Status" value={v.navStatus != null ? NAV_STATUS[v.navStatus] ?? `Code ${v.navStatus}` : null} />
                        <Row label="Speed"  value={v.speed != null ? `${v.speed} kn` : null} />
                        <Row label="Course" value={v.course != null ? `${v.course}°` : null} />
                        <Row label="Destination" value={v.destination} />
                        <Row label="ETA"    value={v.eta} />
                        <Row label="Last update" value={fmt(v.lastPosUpdate)} />
                      </Sect>
                    </div>

                    {/* Column 2: Ownership + compliance */}
                    <div>
                      <Sect title="Ownership (Equasis)">
                        <Row label="Registered Owner" value={v.ownerName} />
                        <Row label="Ship Manager"     value={m} />
                        <Row label="ISM Manager"      value={v.ismManager} />
                        <Row label="Company Country"  value={v.companyCountry} />
                        <Row label="Company Type"     value={v.companyType} />
                        <Row label="Address"          value={v.companyAddress} />
                        {v.fleetCount != null && (
                          <Row label="Fleet" value={
                            `${v.fleetCount} vessels` +
                            (v.fleetAvgAge ? ` · avg ${Number(v.fleetAvgAge).toFixed(1)}y` : "") +
                            (v.fleetCritical ? ` · ${v.fleetCritical} critical` : "")
                          } />
                        )}
                      </Sect>

                      <Sect title="Safety & Compliance">
                        <Row label="Scrap Score"     value={v.scrapScore != null ? `${v.scrapScore}/100 (${v.scrapCategory})` : null} />
                        <Row label="Detentions"      value={v.detentionCount > 0 ? `${v.detentionCount} PSC detentions` : "None"} />
                        <Row label="Deficiencies"    value={v.deficiencyCount > 0 ? `${v.deficiencyCount}` : null} />
                        <Row label="Inspections"     value={v.inspectionCount != null ? `${v.inspectionCount} total` : null} />
                        <Row label="Last Inspection" value={fmt(v.lastInspectionDate)} />
                      </Sect>

                      <Sect title="Surveys & Certificates">
                        <Row label="Special Survey"  value={fmt(v.specialSurveyDate)} />
                        <Row label="Next Dry Dock"   value={fmt(v.dryDockDate)} />
                        <Row label="Last Dry Dock"   value={fmt(v.lastDryDockDate)} />
                        <Row label="IOPP Expiry"     value={fmt(v.ioppExpDate)} />
                      </Sect>
                    </div>

                    {/* Column 3: Full contact */}
                    <div>
                      <Sect title="Contact">
                        {v.website && (
                          <Row label="Website" value={v.website.replace(/^https?:\/\/(www\.)?/, "")}
                            href={v.website.startsWith("http") ? v.website : `https://${v.website}`} />
                        )}
                        {v.linkedinUrl && (
                          <Row label="LinkedIn (Co.)" value="Company page" href={v.linkedinUrl} />
                        )}
                        {v.linkedinPeopleUrl && (
                          <Row label="LinkedIn (People)" value="Search people" href={v.linkedinPeopleUrl} />
                        )}
                      </Sect>

                      {v.allEmails?.length > 0 && (
                        <Sect title={`Emails (${v.allEmails.length})`}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                            {v.allEmails.slice(0, 12).map(e => {
                              const isBest = e === v.bestEmail;
                              const status = v.emailValidations?.[e]?.status;
                              return (
                                <a key={e} href={`mailto:${e}`}
                                  style={{ fontSize: 11, color: "#2563EB", textDecoration: "none",
                                    background: isBest ? "#EFF6FF" : "#F8FAFC",
                                    border: `1px solid ${isBest ? "#BFDBFE" : "#E2E8F0"}`,
                                    borderRadius: 4, padding: "3px 7px", display: "flex", gap: 3 }}>
                                  {e}
                                  {isBest && <span style={{ color: "#2563EB" }}>★</span>}
                                  {status === "verified" && <span style={{ color: "#16A34A" }}>✓</span>}
                                </a>
                              );
                            })}
                            {v.allEmails.length > 12 && (
                              <span style={{ fontSize: 11, color: "#94A3B8" }}>+{v.allEmails.length - 12} more</span>
                            )}
                          </div>
                        </Sect>
                      )}

                      {v.allPhones?.length > 0 && (
                        <Sect title="Phones">
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                            {v.allPhones.map(p => (
                              <a key={p} href={`tel:${p.replace(/\s/g,"")}`}
                                style={{ fontSize: 11, color: "#475569", textDecoration: "none",
                                  background: "#F8FAFC", border: "1px solid #E2E8F0",
                                  borderRadius: 4, padding: "3px 7px" }}>
                                📞 {p}
                              </a>
                            ))}
                          </div>
                        </Sect>
                      )}

                      {v.contacts?.filter(c => c.name || c.email).length > 0 && (
                        <Sect title={`People (${v.contacts.filter(c => c.name || c.email).length})`}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {v.contacts.filter(c => c.name || c.email).slice(0, 8).map((c, i) => (
                              <div key={i} style={{ background: "#F8FAFC", border: "1px solid #E2E8F0",
                                borderRadius: 7, padding: "8px 10px", fontSize: 12 }}>
                                {c.name && <div style={{ fontWeight: 600, color: "#0F172A" }}>{c.name}</div>}
                                {c.title && <div style={{ color: "#64748B", fontSize: 11, marginBottom: 4 }}>{c.title}</div>}
                                {c.email && (
                                  <a href={`mailto:${c.email}`}
                                    style={{ color: "#2563EB", textDecoration: "none", fontSize: 11, display: "block" }}>
                                    📧 {c.email}
                                  </a>
                                )}
                                {c.linkedin && (
                                  <a href={c.linkedin} target="_blank" rel="noopener noreferrer"
                                    style={{ color: "#0A66C2", fontWeight: 600, fontSize: 11,
                                      textDecoration: "none", display: "block", marginTop: 2 }}>
                                    in LinkedIn
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        </Sect>
                      )}

                      {!v.enriched && !v.allEmails?.length && !v.contacts?.length && (
                        <button onClick={() => triggerEnrich(v.imo)}
                          disabled={enriching.has(v.imo)}
                          style={{ fontSize: 12, fontWeight: 600, color: "#2563EB",
                            background: "#EFF6FF", border: "1px solid #BFDBFE",
                            borderRadius: 6, padding: "6px 14px", cursor: "pointer" }}>
                          {enriching.has(v.imo) ? "Searching…" : "🔍 Find contacts"}
                        </button>
                      )}
                    </div>

                  </div>

                  {/* Recent intelligence events */}
                  {(() => {
                    const evts = vesselEvents.get(v.imo);
                    if (!evts || evts.length === 0) return null;
                    const EVENT_ICON: Record<string, string> = {
                      news_mention: "📰", contact_updated: "✉️", status_change: "📍",
                    };
                    return (
                      <div style={{ marginTop: 16, borderTop: "1px solid #F1F5F9", paddingTop: 16 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8",
                          textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
                          Recent Intelligence ({evts.length})
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {evts.slice(0, 6).map(e => (
                            <div key={e.id} style={{ display: "flex", gap: 10, alignItems: "flex-start",
                              fontSize: 12, background: "#F8FAFC", borderRadius: 6, padding: "7px 10px" }}>
                              <span style={{ flexShrink: 0 }}>{EVENT_ICON[e.event_type] ?? "•"}</span>
                              <div style={{ flex: 1 }}>
                                {e.url ? (
                                  <a href={e.url} target="_blank" rel="noopener noreferrer"
                                    style={{ color: "#0F172A", fontWeight: 500, textDecoration: "none" }}>
                                    {e.title || e.summary}
                                  </a>
                                ) : (
                                  <span style={{ color: "#0F172A", fontWeight: 500 }}>{e.title || e.summary}</span>
                                )}
                                <span style={{ color: "#94A3B8", marginLeft: 8, fontSize: 11 }}>
                                  {e.source} · {new Date(e.created_at).toLocaleDateString("en-GB")}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                </div>
                )}

              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
