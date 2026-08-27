"use client";
import { useState, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Contact = {
  name: string | null; title: string | null; email: string | null;
  linkedin: string | null; confidence: number | null; type: string | null; source: string;
};

type Vessel = {
  imo: string; mmsi: string; name: string; type: string; flag: string;
  age: number | null; builtYear: number | null;
  deadweight: number | null; ldt: number | null;
  scrapScore: number | null; scrapCategory: string | null;
  detentionCount: number;
  bestEmail: string | null; phone: string | null;
  website: string | null; linkedinUrl: string | null; linkedinPeopleUrl: string | null;
  ownerName: string | null; manager: string | null;
  contacts: Contact[];
  allEmails: string[]; allPhones: string[];
  emailValidations: Record<string, { status?: string }>;
  enriched: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SCORE_COLOR = (s: number | null | undefined) =>
  !s ? "#94A3B8" : s >= 70 ? "#DC2626" : s >= 50 ? "#D97706" : s >= 25 ? "#2563EB" : "#94A3B8";

const SCORE_LABEL = (s: number | null | undefined) =>
  !s ? "low" : s >= 70 ? "critical" : s >= 50 ? "high" : s >= 25 ? "medium" : "low";

function ScrapBadge({ score }: { score: number | null | undefined }) {
  const color = SCORE_COLOR(score);
  const label = SCORE_LABEL(score);
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
      border: `1px solid ${color}40`, background: `${color}12`, color,
      textTransform: "uppercase", letterSpacing: "0.05em",
    }}>
      {label}{score !== null ? ` · ${score}` : ""}
    </span>
  );
}

function ContactRow({ icon, value, href }: { icon: string; value: string; href?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#475569" }}>
      <span style={{ fontSize: 14, width: 18, textAlign: "center" }}>{icon}</span>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer"
          style={{ color: "#2563EB", textDecoration: "none", wordBreak: "break-all" }}>
          {value}
        </a>
      ) : (
        <span style={{ wordBreak: "break-all" }}>{value}</span>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function VesselsPage() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"all" | "imo" | "vessel" | "company">("all");
  const [aiMode, setAiMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [aiParsing, setAiParsing] = useState(false);
  const [results, setResults] = useState<Vessel[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [aiInterpretation, setAiInterpretation] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function search() {
    const q = query.trim();
    if (!q) return;
    setLoading(true); setError(""); setAiInterpretation("");

    try {
      let apiUrl = `/api/vessels/search?limit=50&hasContact=false`;

      if (aiMode) {
        // AI path: parse natural language → filters
        setAiParsing(true);
        const parseRes = await fetch("/api/parse-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q }),
        });
        const parsed = await parseRes.json();
        setAiParsing(false);

        if (parsed.interpretation) setAiInterpretation(parsed.interpretation);

        if (parsed.params) {
          const ps = new URLSearchParams(parsed.params);
          ps.set("hasContact", "false");
          ps.set("limit", "50");
          apiUrl = `/api/vessels/search?${ps.toString()}`;
        }
      } else {
        // Direct search — by mode
        if (mode === "imo" || (mode === "all" && /^\d{7}$/.test(q))) {
          apiUrl += `&q=${encodeURIComponent(q)}`;
        } else if (mode === "vessel") {
          apiUrl += `&q=${encodeURIComponent(q)}`;
        } else if (mode === "company") {
          apiUrl += `&q=${encodeURIComponent(q)}`;
        } else {
          apiUrl += `&q=${encodeURIComponent(q)}`;
        }
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
      setLoading(false); setAiParsing(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") search();
  }

  const email = (v: Vessel) => v.bestEmail ?? v.allEmails?.[0] ?? null;
  const phone = (v: Vessel) => v.phone ?? v.allPhones?.[0] ?? null;
  const manager = (v: Vessel) => v.manager ?? null;

  const [enriching, setEnriching] = useState<Set<string>>(new Set());

  async function triggerEnrich(imo: string) {
    setEnriching(prev => new Set(prev).add(imo));
    try {
      await fetch(`/api/vessels/enrich`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imo }),
      });
      // re-search to pick up new data
      await search();
    } finally {
      setEnriching(prev => { const s = new Set(prev); s.delete(imo); return s; });
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* ── Search header ── */}
      <div style={{ background: "#07122E", padding: "32px 24px 0" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 700, margin: "0 0 20px", letterSpacing: -0.3 }}>
            Vessel Search
          </h1>

          {/* Search box */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder={
                aiMode
                  ? 'e.g. "bulk carriers older than 25 years with contact" or "tankers near Turkey"'
                  : mode === "imo"    ? "Enter 7-digit IMO number…"
                  : mode === "vessel" ? "Enter vessel name…"
                  : mode === "company"? "Enter company or manager name…"
                  : "Search by IMO, vessel name or company…"
              }
              style={{
                flex: 1, padding: "13px 18px", fontSize: 15,
                border: "2px solid rgba(255,255,255,0.15)",
                borderRadius: 8, background: "rgba(255,255,255,0.08)",
                color: "#fff", outline: "none",
              }}
            />
            <button onClick={search} disabled={loading} style={{
              background: "#C9A84C", color: "#07122E", border: "none",
              borderRadius: 8, padding: "0 24px", fontSize: 15,
              fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
            }}>
              {loading ? (aiParsing ? "AI…" : "Searching…") : "Search"}
            </button>
          </div>

          {/* Mode tabs + AI toggle */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 0 }}>
            <div style={{ display: "flex", gap: 2 }}>
              {([
                ["all",     "All"],
                ["imo",     "By IMO"],
                ["vessel",  "By Vessel"],
                ["company", "By Company"],
              ] as const).map(([val, label]) => (
                <button key={val} onClick={() => { setMode(val); setAiMode(false); }} style={{
                  background: mode === val && !aiMode ? "rgba(255,255,255,0.12)" : "none",
                  color: mode === val && !aiMode ? "#fff" : "rgba(255,255,255,0.5)",
                  border: "none", borderRadius: "6px 6px 0 0", padding: "8px 14px",
                  fontSize: 13, fontWeight: mode === val && !aiMode ? 600 : 400,
                  cursor: "pointer", borderBottom: mode === val && !aiMode ? "2px solid #C9A84C" : "2px solid transparent",
                }}>
                  {label}
                </button>
              ))}
            </div>
            <button onClick={() => { setAiMode(a => !a); setMode("all"); }} style={{
              background: aiMode ? "#C9A84C" : "rgba(255,255,255,0.1)",
              color: aiMode ? "#07122E" : "rgba(255,255,255,0.7)",
              border: "none", borderRadius: 6, padding: "6px 14px",
              fontSize: 12, fontWeight: 700, cursor: "pointer",
              marginBottom: 4,
            }}>
              ✦ AI Search
            </button>
          </div>
        </div>
      </div>

      {/* ── Results area ── */}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 24px 48px" }}>

        {/* AI interpretation */}
        {aiInterpretation && (
          <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#1D4ED8" }}>
            ✦ AI interpreted: <em>{aiInterpretation}</em>
          </div>
        )}

        {/* Stats */}
        {searched && !loading && (
          <p style={{ fontSize: 13, color: "#64748B", marginBottom: 16 }}>
            {total !== null ? `${total.toLocaleString()} vessel${total !== 1 ? "s" : ""} found` : ""}
            {results.length > 0 && total !== null && total > results.length ? ` — showing first ${results.length}` : ""}
          </p>
        )}

        {/* Error */}
        {error && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "12px 16px", color: "#DC2626", fontSize: 14, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* Empty state */}
        {!searched && !loading && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#94A3B8" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
            <p style={{ fontSize: 16, fontWeight: 600, color: "#64748B", marginBottom: 8 }}>Search the vessel database</p>
            <p style={{ fontSize: 14 }}>Search by IMO number, vessel name, owner or manager company.</p>
            <p style={{ fontSize: 13, marginTop: 16, color: "#CBD5E1" }}>
              Examples: <span style={{ cursor: "pointer", color: "#2563EB", textDecoration: "underline" }}
                onClick={() => { setQuery("8009545"); setMode("imo"); }}>8009545</span>
              {" · "}
              <span style={{ cursor: "pointer", color: "#2563EB", textDecoration: "underline" }}
                onClick={() => { setQuery("GRIS CEMENT"); setMode("vessel"); }}>GRIS CEMENT</span>
              {" · "}
              <span style={{ cursor: "pointer", color: "#2563EB", textDecoration: "underline" }}
                onClick={() => { setQuery("FESCO"); setMode("company"); }}>FESCO</span>
            </p>
          </div>
        )}

        {/* No results */}
        {searched && !loading && results.length === 0 && !error && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#94A3B8" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>∅</div>
            <p style={{ fontSize: 15, color: "#64748B" }}>No vessels found for <strong>"{query}"</strong></p>
            <p style={{ fontSize: 13, marginTop: 8 }}>Try a different IMO, vessel name or company name.</p>
          </div>
        )}

        {/* Results */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {results.map(v => {
            const em = email(v);
            const ph = phone(v);
            const mgr = manager(v);
            const hasContact = !!(em || ph || v.website || v.linkedinUrl);

            return (
              <div key={v.imo} style={{
                background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12,
                overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
              }}>
                {/* Vessel row */}
                <div style={{ display: "flex", gap: 16, padding: "16px 20px", alignItems: "flex-start" }}>

                  {/* Vessel info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: "#0F172A" }}>M/V {v.name}</span>
                      <ScrapBadge score={v.scrapScore} />
                      {v.detentionCount > 0 && (
                        <span style={{ fontSize: 11, padding: "2px 6px", background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: 4, fontWeight: 600 }}>
                          {v.detentionCount} detention{v.detentionCount > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: "#64748B", marginBottom: 6 }}>
                      {v.type ?? "—"}{v.flag ? ` · ${v.flag}` : ""}{v.builtYear ? ` · Built ${v.builtYear}` : ""}
                      {v.age ? ` (${v.age}y)` : ""}{v.deadweight ? ` · ${Number(v.deadweight).toLocaleString()} DWT` : ""}
                      {v.ldt ? ` · ${Number(v.ldt).toLocaleString()} LDT` : ""}
                    </div>
                    <div style={{ fontSize: 12, color: "#94A3B8" }}>
                      IMO {v.imo}{v.mmsi ? ` · MMSI ${v.mmsi}` : ""}
                    </div>
                  </div>

                  {/* View button */}
                  <a href={`/vessel/${v.imo}`} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, color: "#2563EB", textDecoration: "none", fontWeight: 600, whiteSpace: "nowrap", marginTop: 2 }}>
                    View report ↗
                  </a>
                </div>

                {/* Contact section — Equasis style: show all found data */}
                <div style={{ borderTop: "1px solid #F1F5F9", background: "#FAFAFA" }}>
                  <div style={{ padding: "14px 20px", display: "grid", gridTemplateColumns: "180px 1fr", gap: 20, alignItems: "start" }}>

                    {/* Left: company identity */}
                    <div>
                      <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Owner / Manager</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 2 }}>{v.ownerName ?? "—"}</div>
                      {mgr && mgr !== v.ownerName && (
                        <div style={{ fontSize: 12, color: "#64748B" }}>{mgr}</div>
                      )}
                      {v.website && (
                        <a href={v.website.startsWith("http") ? v.website : `https://${v.website}`}
                          target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 12, color: "#2563EB", textDecoration: "none", display: "block", marginTop: 6 }}>
                          🌐 {v.website.replace(/^https?:\/\/(www\.)?/, "")}
                        </a>
                      )}
                      {v.linkedinUrl && (
                        <a href={v.linkedinUrl} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 12, color: "#0A66C2", textDecoration: "none", display: "block", marginTop: 4, fontWeight: 600 }}>
                          in Company page
                        </a>
                      )}
                      {v.linkedinPeopleUrl && (
                        <a href={v.linkedinPeopleUrl} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 12, color: "#0A66C2", textDecoration: "none", display: "block", marginTop: 2 }}>
                          in People search
                        </a>
                      )}
                    </div>

                    {/* Right: all contact data */}
                    <div>
                      {/* Emails */}
                      {v.allEmails?.length > 0 ? (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                            Emails ({v.allEmails.length})
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {v.allEmails.slice(0, 8).map(e => {
                              const status = v.emailValidations?.[e]?.status;
                              const isBest = e === v.bestEmail;
                              return (
                                <a key={e} href={`mailto:${e}`}
                                  style={{
                                    fontSize: 12, color: "#2563EB", textDecoration: "none",
                                    background: isBest ? "#EFF6FF" : "#F8FAFC",
                                    border: `1px solid ${isBest ? "#BFDBFE" : "#E2E8F0"}`,
                                    borderRadius: 5, padding: "3px 8px",
                                    display: "flex", alignItems: "center", gap: 4,
                                  }}>
                                  {e}
                                  {status === "verified" && <span style={{ color: "#16A34A", fontSize: 10 }}>✓</span>}
                                  {isBest && <span style={{ color: "#2563EB", fontSize: 10 }}>★</span>}
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      {/* Phones */}
                      {v.allPhones?.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                            Phones
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {v.allPhones.slice(0, 4).map(p => (
                              <a key={p} href={`tel:${p.replace(/\s/g,"")}`}
                                style={{ fontSize: 12, color: "#475569", textDecoration: "none",
                                  background: "#F8FAFC", border: "1px solid #E2E8F0",
                                  borderRadius: 5, padding: "3px 8px" }}>
                                📞 {p}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* People */}
                      {v.contacts?.filter(c => c.name || c.email).length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                            People ({v.contacts.filter(c => c.name || c.email).length})
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {v.contacts.filter(c => c.name || c.email).slice(0, 8).map((c, i) => (
                              <div key={i} style={{
                                background: "#fff", border: "1px solid #E2E8F0", borderRadius: 7,
                                padding: "6px 10px", fontSize: 12,
                              }}>
                                {c.name && <span style={{ fontWeight: 600, color: "#0F172A" }}>{c.name}</span>}
                                {c.title && <span style={{ color: "#64748B" }}> · {c.title}</span>}
                                {c.email && (
                                  <a href={`mailto:${c.email}`} style={{ display: "block", color: "#2563EB", textDecoration: "none", marginTop: 2 }}>
                                    {c.email}
                                  </a>
                                )}
                                {c.linkedin && (
                                  <a href={c.linkedin} target="_blank" rel="noopener noreferrer"
                                    style={{ color: "#0A66C2", textDecoration: "none", fontWeight: 600, marginTop: 2, display: "block" }}>
                                    in LinkedIn
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Not enriched yet — offer to trigger */}
                      {!v.enriched && !v.allEmails?.length && !v.contacts?.length && (
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 12, color: "#CBD5E1", fontStyle: "italic" }}>
                            Contact data not yet collected
                          </span>
                          <button
                            onClick={() => triggerEnrich(v.imo)}
                            disabled={enriching.has(v.imo)}
                            style={{
                              fontSize: 11, fontWeight: 600, color: "#2563EB",
                              background: "#EFF6FF", border: "1px solid #BFDBFE",
                              borderRadius: 5, padding: "3px 10px", cursor: "pointer",
                            }}>
                            {enriching.has(v.imo) ? "Searching…" : "Find contacts"}
                          </button>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
