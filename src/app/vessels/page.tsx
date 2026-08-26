"use client";
import { useState, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Vessel = {
  imo: string; mmsi: string; name: string; type: string; flag: string;
  age: number | null; built_year: number | null;
  deadweight: number | null; ldt: number | null;
  scrap_score: number | null; scrap_category: string | null;
  detention_count: number;
  best_email: string | null; owner_email: string | null;
  emails: string[] | null; phones: string[] | null;
  website: string | null; linkedin_company_url: string | null;
  owner_name: string | null; contact_manager: string | null; vessel_manager: string | null;
  photo_thumb: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SCORE_COLOR = (s: number | null) =>
  !s ? "#94A3B8" : s >= 70 ? "#DC2626" : s >= 50 ? "#D97706" : s >= 25 ? "#2563EB" : "#94A3B8";

const SCORE_LABEL = (s: number | null) =>
  !s ? "low" : s >= 70 ? "critical" : s >= 50 ? "high" : s >= 25 ? "medium" : "low";

function ScrapBadge({ score }: { score: number | null }) {
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

      setResults(data.vessels ?? []);
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

  const email = (v: Vessel) => {
    const all = [v.best_email, v.owner_email, ...(v.emails ?? [])].filter(Boolean);
    return all[0] ?? null;
  };
  const phone = (v: Vessel) => v.phones?.[0] ?? null;
  const manager = (v: Vessel) => v.contact_manager || v.vessel_manager || null;

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
            const hasContact = !!(em || ph || v.website);

            return (
              <div key={v.imo} style={{
                background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12,
                overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
              }}>
                {/* Vessel row */}
                <div style={{ display: "flex", gap: 16, padding: "16px 20px", alignItems: "flex-start" }}>

                  {/* Photo */}
                  {v.photo_thumb ? (
                    <img src={v.photo_thumb} alt={v.name}
                      style={{ width: 80, height: 52, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 80, height: 52, background: "#F1F5F9", borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="32" height="20" viewBox="0 0 32 20" fill="none">
                        <rect x="2" y="9" width="28" height="7" rx="2" fill="#CBD5E1"/>
                        <rect x="7" y="4" width="12" height="6" rx="1" fill="#CBD5E1"/>
                        <rect x="10" y="1" width="2" height="4" rx="0.5" fill="#E2E8F0"/>
                      </svg>
                    </div>
                  )}

                  {/* Vessel info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: "#0F172A" }}>M/V {v.name}</span>
                      <ScrapBadge score={v.scrap_score} />
                      {v.detention_count > 0 && (
                        <span style={{ fontSize: 11, padding: "2px 6px", background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: 4, fontWeight: 600 }}>
                          {v.detention_count} detention{v.detention_count > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: "#64748B", marginBottom: 6 }}>
                      {v.type ?? "—"}{v.flag ? ` · ${v.flag}` : ""}{v.built_year ? ` · Built ${v.built_year}` : ""}
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

                {/* Contact row */}
                <div style={{
                  borderTop: "1px solid #F1F5F9", padding: "12px 20px",
                  background: hasContact ? "#FAFFFE" : "#FAFAFA",
                  display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start",
                }}>
                  {/* Company */}
                  <div style={{ minWidth: 160 }}>
                    <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Company</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>
                      {v.owner_name ?? mgr ?? "—"}
                    </div>
                    {mgr && mgr !== v.owner_name && (
                      <div style={{ fontSize: 12, color: "#64748B" }}>Manager: {mgr}</div>
                    )}
                  </div>

                  {/* Contact details */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                    {v.website && (
                      <ContactRow icon="🌐" value={v.website.replace(/^https?:\/\//, "")}
                        href={v.website.startsWith("http") ? v.website : `https://${v.website}`} />
                    )}
                    {em && <ContactRow icon="📧" value={em} href={`mailto:${em}`} />}
                    {ph && <ContactRow icon="📞" value={ph} href={`tel:${ph.replace(/\s/g, "")}`} />}
                    {v.linkedin_company_url && (
                      <ContactRow icon="in" value="LinkedIn" href={v.linkedin_company_url} />
                    )}
                    {!hasContact && (
                      <span style={{ fontSize: 12, color: "#CBD5E1", fontStyle: "italic" }}>No contact data yet</span>
                    )}
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
