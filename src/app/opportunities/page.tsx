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

function ContactCell({ vessel }: { vessel: OpportunityVessel }) {
  const emails = [
    ...(vessel.emails?.filter(Boolean) ?? []),
    ...(vessel.best_email && !vessel.emails?.includes(vessel.best_email) ? [vessel.best_email] : []),
  ];
  const phones = vessel.phones?.filter(Boolean) ?? [];
  const hasAny = emails.length > 0 || phones.length > 0 || vessel.website || vessel.linkedin_url;

  if (!hasAny) {
    return (
      <div style={{ fontSize: 11, color: "#D1D5DB", fontStyle: "italic" }}>No contact yet</div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {(vessel.owner_name || vessel.manager_name) && (
        <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>
          {vessel.owner_name ?? vessel.manager_name}
        </div>
      )}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {emails[0] && (
          <a href={`mailto:${emails[0]}`} title={emails[0]}
            onClick={e => e.stopPropagation()}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "3px 8px",
              borderRadius: 5, background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#1D4ED8",
              textDecoration: "none", whiteSpace: "nowrap" }}>
            ✉ Email
          </a>
        )}
        {phones[0] && (
          <a href={`tel:${phones[0]}`} title={phones[0]}
            onClick={e => e.stopPropagation()}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "3px 8px",
              borderRadius: 5, background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D",
              textDecoration: "none", whiteSpace: "nowrap" }}>
            ☎ Call
          </a>
        )}
        {vessel.linkedin_url && (
          <a href={vessel.linkedin_url} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "3px 8px",
              borderRadius: 5, background: "#F0F9FF", border: "1px solid #BAE6FD", color: "#0369A1",
              textDecoration: "none", whiteSpace: "nowrap" }}>
            in LinkedIn
          </a>
        )}
      </div>
    </div>
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

function ExpandedRow({ vessel }: { vessel: OpportunityVessel }) {
  const emails = [
    ...(vessel.emails?.filter(Boolean) ?? []),
    ...(vessel.best_email && !vessel.emails?.includes(vessel.best_email) ? [vessel.best_email] : []),
  ];
  const phones = vessel.phones?.filter(Boolean) ?? [];

  return (
    <tr>
      <td colSpan={6} style={{ padding: "0 16px 16px 48px", background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
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
          <div style={{ flex: "0 0 180px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              Vessel Details
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151" }}>
              {vessel.gross_tonnage && <div><span style={{ color: "#9CA3AF" }}>GT:</span> {vessel.gross_tonnage.toLocaleString()}</div>}
              {vessel.deadweight    && <div><span style={{ color: "#9CA3AF" }}>DWT:</span> {vessel.deadweight.toLocaleString()}</div>}
              {vessel.ldt           && <div><span style={{ color: "#9CA3AF" }}>LDT:</span> {vessel.ldt.toLocaleString()}</div>}
              {vessel.scrap_score > 0 && <div><span style={{ color: "#9CA3AF" }}>Scrap score:</span> {vessel.scrap_score}/100</div>}
              {vessel.deficiency_count > 0 && <div><span style={{ color: "#9CA3AF" }}>Deficiencies:</span> {vessel.deficiency_count}</div>}
              {vessel.dist_aliaga_nm !== null && (
                <div><span style={{ color: "#9CA3AF" }}>Dist. Aliağa:</span> {Math.round(vessel.dist_aliaga_nm).toLocaleString()} nm</div>
              )}
              {vessel.special_survey_date && (
                <div><span style={{ color: "#9CA3AF" }}>Survey date:</span> {new Date(vessel.special_survey_date).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</div>
              )}
            </div>
          </div>

          {/* Full contact details */}
          <div style={{ flex: "0 0 220px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              Owner / Manager
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151" }}>
              {vessel.owner_name   && <div style={{ fontWeight: 600 }}>{vessel.owner_name}</div>}
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
                  target="_blank" rel="noopener noreferrer"
                  style={{ color: "#6B7280", textDecoration: "none", wordBreak: "break-all" }}>
                  {vessel.website.replace(/^https?:\/\//, "")}
                </a>
              )}
              {vessel.linkedin_url && (
                <a href={vessel.linkedin_url} target="_blank" rel="noopener noreferrer"
                  style={{ color: "#0369A1", textDecoration: "none" }}>
                  LinkedIn →
                </a>
              )}
              {!vessel.owner_name && !vessel.manager_name && emails.length === 0 && phones.length === 0 && (
                <span style={{ color: "#D1D5DB", fontStyle: "italic" }}>No contact data available</span>
              )}
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

export default function OpportunitiesPage() {
  const [vessels, setVessels]           = useState<OpportunityVessel[]>([]);
  const [total, setTotal]               = useState<number>(0);
  const [contactableTotal, setContactableTotal] = useState<number>(0);
  const [loading, setLoading]           = useState(true);
  const [expanded, setExpanded]         = useState<Set<string>>(new Set());

  const [signalFilter, setSignalFilter] = useState<string>("all");
  const [minAge, setMinAge]             = useState<number>(20);
  const [typeFilter, setTypeFilter]     = useState<string>("all");
  const [maxDist, setMaxDist]           = useState<string>("all");
  const [contactOnly, setContactOnly]   = useState(true); // default ON for demo

  useEffect(() => {
    setLoading(true);
    fetch("/api/opportunities?limit=500")
      .then(r => r.json())
      .then(d => {
        setVessels(d.vessels ?? []);
        setTotal(d.total ?? 0);
        setContactableTotal(d.contactable_total ?? 0);
      })
      .finally(() => setLoading(false));
  }, []);

  function vesselHasContact(v: OpportunityVessel) {
    const emails = [...(v.emails?.filter(Boolean) ?? []), ...(v.best_email ? [v.best_email] : [])];
    return emails.length > 0 || (v.phones?.length ?? 0) > 0 || !!v.website || !!v.linkedin_url;
  }

  const filtered = useMemo(() => {
    return vessels.filter(v => {
      if (signalFilter !== "all" && !v.signals.some(s => s.type === signalFilter)) return false;
      if (v.age < minAge) return false;
      if (typeFilter !== "all" && !v.type?.toLowerCase().includes(typeFilter.toLowerCase())) return false;
      if (maxDist !== "all" && v.dist_aliaga_nm !== null && v.dist_aliaga_nm > parseInt(maxDist)) return false;
      if (contactOnly && !vesselHasContact(v)) return false;
      return true;
    });
  }, [vessels, signalFilter, minAge, typeFilter, maxDist, contactOnly]);

  function toggleExpand(mmsi: string) {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(mmsi) ? n.delete(mmsi) : n.add(mmsi);
      return n;
    });
  }

  const SELECT: React.CSSProperties = {
    fontSize: 12, padding: "6px 10px", borderRadius: 6,
    border: "1px solid #D1D5DB", background: "#fff", color: "#374151",
    cursor: "pointer", outline: "none",
  };
  const TH: React.CSSProperties = {
    padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 600,
    color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em",
  };

  return (
    <div style={{ padding: "32px 32px 64px", maxWidth: 1400, margin: "0 auto", fontFamily: "Inter, sans-serif" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>Opportunity Radar</h1>
        </div>
        <p style={{ fontSize: 13, color: "#6B7280", margin: "6px 0 0" }}>
          Vessels showing sell, charter, or recycling signals before listings appear — derived from AIS data, PSC inspections, and survey schedules.
        </p>
        {!loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}>
                {contactableTotal.toLocaleString()}
              </span>
              <span style={{ fontSize: 13, color: "#6B7280" }}>contactable</span>
              <span style={{ fontSize: 13, color: "#D1D5DB" }}>·</span>
              <span style={{ fontSize: 13, color: "#9CA3AF" }}>
                {total.toLocaleString()} total opportunities
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 1, height: 16, background: "#E5E7EB" }} />
              <span style={{ fontSize: 12, color: "#6B7280" }}>showing {filtered.length}</span>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 20,
        background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "12px 16px" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Signal</span>
          <select value={signalFilter} onChange={e => setSignalFilter(e.target.value)} style={SELECT}>
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
          <select value={minAge} onChange={e => setMinAge(Number(e.target.value))} style={SELECT}>
            <option value={20}>20+</option>
            <option value={25}>25+</option>
            <option value={30}>30+</option>
            <option value={35}>35+</option>
          </select>
        </div>

        <div style={{ width: 1, height: 20, background: "#E5E7EB" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Type</span>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={SELECT}>
            <option value="all">All types</option>
            {VESSEL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div style={{ width: 1, height: 20, background: "#E5E7EB" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Aliağa</span>
          <select value={maxDist} onChange={e => setMaxDist(e.target.value)} style={SELECT}>
            <option value="all">Any distance</option>
            <option value="500">≤ 500 nm</option>
            <option value="1000">≤ 1,000 nm</option>
            <option value="2000">≤ 2,000 nm</option>
          </select>
        </div>

        <div style={{ width: 1, height: 20, background: "#E5E7EB" }} />

        <button
          onClick={() => setContactOnly(c => !c)}
          style={{
            fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 6, cursor: "pointer",
            border: contactOnly ? "1px solid #15803D" : "1px solid #D1D5DB",
            background: contactOnly ? "#F0FDF4" : "#fff",
            color: contactOnly ? "#15803D" : "#6B7280",
            display: "flex", alignItems: "center", gap: 6,
          }}>
          <span style={{ fontSize: 14 }}>{contactOnly ? "✓" : "○"}</span>
          {contactOnly ? "Contactable only" : "Show all opportunities"}
        </button>

        {(signalFilter !== "all" || minAge !== 20 || typeFilter !== "all" || maxDist !== "all" || !contactOnly) && (
          <button onClick={() => { setSignalFilter("all"); setMinAge(20); setTypeFilter("all"); setMaxDist("all"); setContactOnly(true); }}
            style={{ fontSize: 11, color: "#6B7280", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
            Reset
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>Loading signals…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>No vessels match the current filters.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                <th style={TH}>Vessel</th>
                <th style={TH}>Age / Type</th>
                <th style={TH}>Signals</th>
                <th style={TH}>Owner / Contact</th>
                <th style={{ ...TH, textAlign: "right" }}>Score</th>
                <th style={{ ...TH, textAlign: "right" }}>Aliağa</th>
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
                        background: isOpen ? "#F9FAFB" : "transparent" }}>

                      {/* Vessel */}
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ fontWeight: 600, color: "#111827" }}>{v.name}</div>
                        <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1 }}>
                          IMO {v.imo}{v.flag ? ` · ${v.flag}` : ""}
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

                      {/* Owner + Contact */}
                      <td style={{ padding: "12px 16px" }}>
                        <ContactCell vessel={v} />
                      </td>

                      {/* Opportunity score */}
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        <span style={{ fontSize: 13, fontWeight: 700,
                          color: v.opportunity_score >= 70 ? "#B91C1C" : v.opportunity_score >= 40 ? "#92400E" : "#374151" }}>
                          {v.opportunity_score}
                        </span>
                      </td>

                      {/* Aliağa distance */}
                      <td style={{ padding: "12px 16px", textAlign: "right", fontSize: 12, color: "#6B7280" }}>
                        {v.dist_aliaga_nm !== null ? `${Math.round(v.dist_aliaga_nm).toLocaleString()} nm` : "—"}
                      </td>

                      {/* Expand */}
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
          <span style={{ fontSize: 11, color: "#9CA3AF" }}>Score = signal weights × 10 + scrap score (0–100).</span>
          {(["survey_pressure", "detention_age", "layup", "age_threshold"] as SignalType[]).map(t => (
            <span key={t} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <SignalBadge type={t} />
              <span style={{ fontSize: 11, color: "#9CA3AF" }}>
                {t === "survey_pressure" ? "wt 4" : t === "age_threshold" ? "wt 1" : "wt 3"}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
