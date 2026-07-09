"use client";
import React, { useEffect, useState, useMemo } from "react";
import type { OpportunityVessel } from "@/app/api/opportunities/route";
import { SIGNAL_META, type SignalType } from "@/lib/signals";

const SIGNAL_LABELS: Record<SignalType, string> = {
  survey_pressure: "Survey Due",
  detention_age:   "PSC Detained",
  layup:           "Lay-up",
  age_threshold:   "25+ Years",
};

const VESSEL_TYPES = ["Bulk Carrier", "Tanker", "Container", "General Cargo", "Chemical Tanker", "Ro-Ro", "Towing"];

function ScrapValue({ vessel }: { vessel: OpportunityVessel }) {
  const AVG_LDT_PRICE = 380; // $/LDT global rough average

  let usd: number | null = null;
  let isEstimated = true;

  if (vessel.scrap_value_usd) {
    usd = vessel.scrap_value_usd;
    isEstimated = vessel.scrap_value_estimated;
  } else if (vessel.ldt) {
    usd = vessel.ldt * AVG_LDT_PRICE;
  }

  if (!usd) return <span style={{ color: "#9CA3AF" }}>—</span>;

  const display = usd >= 1_000_000
    ? `$${(usd / 1_000_000).toFixed(1)}M`
    : `$${(usd / 1_000).toFixed(0)}K`;

  return (
    <span>
      <span style={{ fontWeight: 600, color: "#111827" }}>{display}</span>
      {isEstimated && (
        <span style={{ fontSize: 10, color: "#9CA3AF", marginLeft: 4, fontWeight: 400 }}>est.</span>
      )}
    </span>
  );
}

function ContactCell({ vessel }: { vessel: OpportunityVessel }) {
  const emails = vessel.emails?.filter(Boolean) ?? (vessel.best_email ? [vessel.best_email] : []);
  const phones = vessel.phones?.filter(Boolean) ?? [];
  const hasContact = emails.length > 0 || phones.length > 0 || vessel.website;

  if (!hasContact) return <span style={{ color: "#D1D5DB", fontSize: 12 }}>—</span>;

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {emails[0] && (
        <a href={`mailto:${emails[0]}`} title={emails[0]}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26,
            borderRadius: 6, background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#1D4ED8",
            textDecoration: "none", fontSize: 13 }}>
          ✉
        </a>
      )}
      {phones[0] && (
        <a href={`tel:${phones[0]}`} title={phones[0]}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26,
            borderRadius: 6, background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D",
            textDecoration: "none", fontSize: 13 }}>
          ☎
        </a>
      )}
      {vessel.website && (
        <a href={vessel.website.startsWith("http") ? vessel.website : `https://${vessel.website}`}
          target="_blank" rel="noopener noreferrer" title={vessel.website}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26,
            borderRadius: 6, background: "#FAFAFA", border: "1px solid #E5E7EB", color: "#374151",
            textDecoration: "none", fontSize: 13 }}>
          🌐
        </a>
      )}
    </div>
  );
}

function ExpandedRow({ vessel }: { vessel: OpportunityVessel }) {
  const emails = vessel.emails?.filter(Boolean) ?? (vessel.best_email ? [vessel.best_email] : []);
  const phones = vessel.phones?.filter(Boolean) ?? [];

  return (
    <tr>
      <td colSpan={8} style={{ padding: "0 16px 16px 48px", background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>

          {/* Why this vessel */}
          <div style={{ flex: "1 1 360px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              Why this vessel?
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {vessel.signals.map(sig => {
                const m = SIGNAL_META[sig.type];
                return (
                  <div key={sig.type} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                      color: m.color, background: m.bg, border: `1px solid ${m.border}`, whiteSpace: "nowrap", flexShrink: 0 }}>
                      {SIGNAL_LABELS[sig.type]}
                    </span>
                    <span style={{ fontSize: 12, color: "#374151", lineHeight: 1.5 }}>{sig.explanation}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Vessel specs */}
          <div style={{ flex: "0 0 200px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              Vessel Details
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151" }}>
              {vessel.gross_tonnage && <div><span style={{ color: "#9CA3AF" }}>GT:</span> {vessel.gross_tonnage.toLocaleString()}</div>}
              {vessel.deadweight && <div><span style={{ color: "#9CA3AF" }}>DWT:</span> {vessel.deadweight.toLocaleString()}</div>}
              {vessel.ldt && <div><span style={{ color: "#9CA3AF" }}>LDT:</span> {vessel.ldt.toLocaleString()}</div>}
              {vessel.deficiency_count > 0 && <div><span style={{ color: "#9CA3AF" }}>Deficiencies:</span> {vessel.deficiency_count}</div>}
              {vessel.dist_aliaga_nm !== null && (
                <div><span style={{ color: "#9CA3AF" }}>Dist. Aliağa:</span> {Math.round(vessel.dist_aliaga_nm).toLocaleString()} nm</div>
              )}
              {vessel.special_survey_date && (
                <div><span style={{ color: "#9CA3AF" }}>Survey date:</span> {new Date(vessel.special_survey_date).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</div>
              )}
            </div>
          </div>

          {/* Owner contact */}
          {(vessel.owner_name || vessel.manager_name || emails.length > 0 || phones.length > 0) && (
            <div style={{ flex: "0 0 220px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                Owner / Manager
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151" }}>
                {vessel.owner_name && <div style={{ fontWeight: 600 }}>{vessel.owner_name}</div>}
                {vessel.manager_name && vessel.manager_name !== vessel.owner_name && (
                  <div style={{ color: "#6B7280" }}>Mgr: {vessel.manager_name}</div>
                )}
                {emails.map(e => (
                  <a key={e} href={`mailto:${e}`} style={{ color: "#1D4ED8", textDecoration: "none" }}>{e}</a>
                ))}
                {phones.map(p => (
                  <a key={p} href={`tel:${p}`} style={{ color: "#15803D", textDecoration: "none" }}>{p}</a>
                ))}
                {vessel.website && (
                  <a href={vessel.website.startsWith("http") ? vessel.website : `https://${vessel.website}`}
                    target="_blank" rel="noopener noreferrer" style={{ color: "#6B7280", textDecoration: "none", wordBreak: "break-all" }}>
                    {vessel.website.replace(/^https?:\/\//, "")}
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

function SignalBadge({ type }: { type: SignalType }) {
  const m = SIGNAL_META[type];
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 4,
      color: m.color, background: m.bg, border: `1px solid ${m.border}`, whiteSpace: "nowrap" }}>
      {SIGNAL_LABELS[type]}
    </span>
  );
}

export default function OpportunitiesPage() {
  const [vessels, setVessels]     = useState<OpportunityVessel[]>([]);
  const [total, setTotal]         = useState<number>(0);
  const [loading, setLoading]     = useState(true);
  const [expanded, setExpanded]   = useState<Set<string>>(new Set());

  // Filters (client-side for speed)
  const [signalFilter, setSignalFilter] = useState<string>("all");
  const [minAge, setMinAge]             = useState<number>(20);
  const [typeFilter, setTypeFilter]     = useState<string>("all");
  const [maxDist, setMaxDist]           = useState<string>("all");
  const [hasContact, setHasContact]     = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch("/api/opportunities?limit=500")
      .then(r => r.json())
      .then(d => { setVessels(d.vessels ?? []); setTotal(d.total ?? 0); })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return vessels.filter(v => {
      if (signalFilter !== "all" && !v.signals.some(s => s.type === signalFilter)) return false;
      if (v.age < minAge) return false;
      if (typeFilter !== "all" && !v.type?.toLowerCase().includes(typeFilter.toLowerCase())) return false;
      if (maxDist !== "all" && v.dist_aliaga_nm !== null && v.dist_aliaga_nm > parseInt(maxDist)) return false;
      if (hasContact) {
        const hasAny = (v.emails?.length ?? 0) > 0 || !!v.best_email || (v.phones?.length ?? 0) > 0 || !!v.website;
        if (!hasAny) return false;
      }
      return true;
    });
  }, [vessels, signalFilter, minAge, typeFilter, maxDist, hasContact]);

  function toggleExpand(mmsi: string) {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(mmsi) ? n.delete(mmsi) : n.add(mmsi);
      return n;
    });
  }

  const SELECT_STYLE: React.CSSProperties = {
    fontSize: 12, padding: "6px 10px", borderRadius: 6,
    border: "1px solid #D1D5DB", background: "#fff", color: "#374151",
    cursor: "pointer", outline: "none",
  };

  return (
    <div style={{ padding: "32px 32px 64px", maxWidth: 1400, margin: "0 auto", fontFamily: "Inter, sans-serif" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>
            Opportunity Radar
          </h1>
          {!loading && (
            <span style={{ fontSize: 13, color: "#6B7280" }}>
              {total.toLocaleString()} vessels with active signals · showing {filtered.length}
            </span>
          )}
        </div>
        <p style={{ fontSize: 13, color: "#6B7280", margin: "6px 0 0" }}>
          Vessels showing sell, charter, or recycling signals — before listings appear. Signals derived from AIS position data, PSC inspection records, and survey schedules.
        </p>
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 20,
        background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "12px 16px" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Signal</span>
          <select value={signalFilter} onChange={e => setSignalFilter(e.target.value)} style={SELECT_STYLE}>
            <option value="all">All signals</option>
            <option value="survey_pressure">Survey Due</option>
            <option value="detention_age">PSC Detained</option>
            <option value="layup">Lay-up</option>
            <option value="age_threshold">25+ Years</option>
          </select>
        </div>

        <div style={{ width: 1, height: 20, background: "#E5E7EB" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Min age</span>
          <select value={minAge} onChange={e => setMinAge(Number(e.target.value))} style={SELECT_STYLE}>
            <option value={20}>20+</option>
            <option value={25}>25+</option>
            <option value={30}>30+</option>
            <option value={35}>35+</option>
          </select>
        </div>

        <div style={{ width: 1, height: 20, background: "#E5E7EB" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Type</span>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={SELECT_STYLE}>
            <option value="all">All types</option>
            {VESSEL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div style={{ width: 1, height: 20, background: "#E5E7EB" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Aliağa</span>
          <select value={maxDist} onChange={e => setMaxDist(e.target.value)} style={SELECT_STYLE}>
            <option value="all">Any distance</option>
            <option value="500">≤ 500 nm</option>
            <option value="1000">≤ 1,000 nm</option>
            <option value="2000">≤ 2,000 nm</option>
          </select>
        </div>

        <div style={{ width: 1, height: 20, background: "#E5E7EB" }} />

        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#374151", cursor: "pointer" }}>
          <input type="checkbox" checked={hasContact} onChange={e => setHasContact(e.target.checked)} />
          Has contact info
        </label>

        {(signalFilter !== "all" || minAge !== 20 || typeFilter !== "all" || maxDist !== "all" || hasContact) && (
          <button onClick={() => { setSignalFilter("all"); setMinAge(20); setTypeFilter("all"); setMaxDist("all"); setHasContact(false); }}
            style={{ fontSize: 11, color: "#6B7280", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
            Reset
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>
            Loading signals…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>
            No vessels match the current filters.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>Vessel</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>Age / Type</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>Signals</th>
                <th style={{ padding: "10px 16px", textAlign: "right", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>Score</th>
                <th style={{ padding: "10px 16px", textAlign: "right", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>Scrap Value</th>
                <th style={{ padding: "10px 16px", textAlign: "right", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>Aliağa</th>
                <th style={{ padding: "10px 16px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>Contact</th>
                <th style={{ width: 32 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => {
                const isOpen = expanded.has(v.mmsi);
                return (
                  <React.Fragment key={v.mmsi}>
                    <tr
                      onClick={() => toggleExpand(v.mmsi)}
                      style={{ borderBottom: isOpen ? "none" : "1px solid #F3F4F6", cursor: "pointer",
                        background: isOpen ? "#F9FAFB" : "transparent",
                        transition: "background 0.1s" }}>

                      {/* Vessel */}
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ fontWeight: 600, color: "#111827" }}>{v.name}</div>
                        <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1 }}>
                          IMO {v.imo} {v.flag ? `· ${v.flag}` : ""}
                        </div>
                      </td>

                      {/* Age / Type */}
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ fontWeight: 600, color: "#374151" }}>{v.age} yrs</div>
                        <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1 }}>{v.type_specific ?? v.type}</div>
                      </td>

                      {/* Signals */}
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {v.signals.map(s => <SignalBadge key={s.type} type={s.type} />)}
                        </div>
                      </td>

                      {/* Opportunity score */}
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        <span style={{ fontSize: 13, fontWeight: 700,
                          color: v.opportunity_score >= 70 ? "#B91C1C" : v.opportunity_score >= 40 ? "#92400E" : "#374151" }}>
                          {v.opportunity_score}
                        </span>
                      </td>

                      {/* Scrap value */}
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        <ScrapValue vessel={v} />
                      </td>

                      {/* Distance to Aliağa */}
                      <td style={{ padding: "12px 16px", textAlign: "right", fontSize: 12, color: "#6B7280" }}>
                        {v.dist_aliaga_nm !== null ? `${Math.round(v.dist_aliaga_nm).toLocaleString()} nm` : "—"}
                      </td>

                      {/* Contact */}
                      <td style={{ padding: "12px 16px", textAlign: "center" }} onClick={e => e.stopPropagation()}>
                        <ContactCell vessel={v} />
                      </td>

                      {/* Expand chevron */}
                      <td style={{ padding: "12px 8px", color: "#9CA3AF", fontSize: 11, userSelect: "none" }}>
                        {isOpen ? "▲" : "▼"}
                      </td>
                    </tr>
                    {isOpen && <ExpandedRow vessel={v} />}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Legend */}
      {!loading && filtered.length > 0 && (
        <div style={{ marginTop: 16, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#9CA3AF" }}>Score = signal weights × 10 + scrap score.</span>
          {(["survey_pressure", "detention_age", "layup", "age_threshold"] as SignalType[]).map(t => (
            <span key={t} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <SignalBadge type={t} />
              <span style={{ fontSize: 11, color: "#9CA3AF" }}>
                {t === "survey_pressure" ? "weight 4" : t === "age_threshold" ? "weight 1" : "weight 3"}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
