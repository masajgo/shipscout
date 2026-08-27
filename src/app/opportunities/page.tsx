"use client";
import React, { useEffect, useState, useMemo } from "react";
import type { OpportunityVessel } from "@/app/api/opportunities/route";
import type { RadarEvent } from "@/app/api/radar-events/route";
import { SIGNAL_META, type SignalType } from "@/lib/signals";
import { type YardPrices } from "@/lib/scrapValue";

const SIGNAL_LABELS: Record<SignalType, string> = {
  survey_pressure: "Survey Due",
  detention_age:   "PSC Detained",
  layup:           "Lay-up",
  age_threshold:   "25+ Years",
};

// Matched as a substring against type_specific, so "Tanker" covers Crude Oil /
// Oil Products / Oil or Chemical Tanker in one option.
const VESSEL_TYPES = ["Bulk Carrier", "General Cargo", "Container", "Tanker", "Ro-Ro", "Reefer", "Vehicles Carrier"];

function ContactCell({ vessel }: { vessel: OpportunityVessel }) {
  const emails = [
    ...(vessel.emails?.filter(Boolean) ?? []),
    ...(vessel.best_email && !vessel.emails?.includes(vessel.best_email) ? [vessel.best_email] : []),
  ];
  const phones = vessel.phones?.filter(Boolean) ?? [];
  const hasEmailOrPhone = emails.length > 0 || phones.length > 0;

  const ownerLabel = vessel.owner_name ?? vessel.manager_name;

  if (!hasEmailOrPhone) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {ownerLabel && (
          <div style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF", whiteSpace: "nowrap",
            overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>
            {ownerLabel}
          </div>
        )}
        {vessel.website && (
          <a href={vessel.website.startsWith("http") ? vessel.website : `https://${vessel.website}`}
            target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
            style={{ fontSize: 11, color: "#D1D5DB", textDecoration: "none",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
            {vessel.website.replace(/^https?:\/\//, "")}
          </a>
        )}
        <div style={{ fontSize: 11, color: "#D1D5DB", fontStyle: "italic" }}>No contact yet</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {ownerLabel && (
        <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", whiteSpace: "nowrap",
          overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>
          {ownerLabel}
        </div>
      )}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {emails[0] && (
          <a href={`mailto:${emails[0]}`} title={emails[0]}
            onClick={e => e.stopPropagation()}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "3px 8px",
              borderRadius: 5, background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#1D4ED8",
              textDecoration: "none", whiteSpace: "nowrap", fontWeight: 600 }}>
            ✉ Email
          </a>
        )}
        {phones[0] && (
          <a href={`tel:${phones[0]}`} title={phones[0]}
            onClick={e => e.stopPropagation()}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "3px 8px",
              borderRadius: 5, background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D",
              textDecoration: "none", whiteSpace: "nowrap", fontWeight: 600 }}>
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
  const EMAIL_LIMIT = 8;
  const emails = [
    ...(vessel.best_email ? [vessel.best_email] : []),
    ...(vessel.emails?.filter(e => e && e !== vessel.best_email) ?? []),
  ];
  const phones = vessel.phones?.filter(Boolean) ?? [];
  const people = vessel.contacts?.filter(c => c.name || c.email) ?? [];
  const [enriching, setEnriching] = React.useState(false);
  const [enrichDone, setEnrichDone] = React.useState(false);

  async function handleEnrich() {
    setEnriching(true);
    try {
      await fetch("/api/vessels/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imo: vessel.imo }),
      });
      setEnrichDone(true);
    } finally {
      setEnriching(false);
    }
  }

  return (
    <tr>
      <td colSpan={8} style={{ padding: "0 16px 16px 48px", background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>

          {/* LDT */}
          <div style={{ flex: "0 0 120px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              LDT
            </div>
            {vessel.ldt ? (
              <div style={{ fontSize: 22, fontWeight: 800, color: "#111827" }}>
                {vessel.ldt.toLocaleString()}
                <span style={{ fontSize: 12, fontWeight: 500, color: "#6B7280", marginLeft: 4 }}>t</span>
              </div>
            ) : (
              <a href={`/vessel/${vessel.imo}`}
                style={{ fontSize: 13, color: "#2563EB", fontWeight: 600,
                  textDecoration: "none", padding: "4px 12px", borderRadius: 5,
                  background: "#EFF6FF", border: "1px solid #BFDBFE", display: "inline-block" }}>
                Contact →
              </a>
            )}
          </div>


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
          <div style={{ flex: "1 1 280px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              Owner / Manager
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#374151" }}>
              {vessel.owner_name   && <div style={{ fontWeight: 700, fontSize: 13 }}>{vessel.owner_name}</div>}
              {vessel.manager_name && vessel.manager_name !== vessel.owner_name && (
                <div style={{ color: "#6B7280" }}>{vessel.manager_name}</div>
              )}
              {vessel.website && (
                <a href={vessel.website.startsWith("http") ? vessel.website : `https://${vessel.website}`}
                  target="_blank" rel="noopener noreferrer" style={{ color: "#6B7280", textDecoration: "none" }}>
                  🌐 {vessel.website.replace(/^https?:\/\//, "")}
                </a>
              )}
              {vessel.linkedin_url && (
                <a href={vessel.linkedin_url} target="_blank" rel="noopener noreferrer"
                  style={{ color: "#0A66C2", textDecoration: "none", fontWeight: 600 }}>
                  in LinkedIn
                </a>
              )}

              {/* Emails */}
              {emails.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontSize: 10, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                    Emails ({emails.length})
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {emails.slice(0, EMAIL_LIMIT).map(e => (
                      <a key={e} href={`mailto:${e}`}
                        style={{ fontSize: 11, color: "#1D4ED8", textDecoration: "none",
                          background: e === vessel.best_email ? "#EFF6FF" : "#F8FAFC",
                          border: `1px solid ${e === vessel.best_email ? "#BFDBFE" : "#E5E7EB"}`,
                          borderRadius: 4, padding: "2px 6px" }}>
                        {e}{e === vessel.best_email ? " ★" : ""}
                      </a>
                    ))}
                    {emails.length > EMAIL_LIMIT && (
                      <span style={{ fontSize: 11, color: "#9CA3AF" }}>+{emails.length - EMAIL_LIMIT} more</span>
                    )}
                  </div>
                </div>
              )}

              {/* Phones */}
              {phones.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {phones.map(p => (
                    <a key={p} href={`tel:${p}`}
                      style={{ fontSize: 11, color: "#15803D", textDecoration: "none",
                        background: "#F0FDF4", border: "1px solid #BBF7D0",
                        borderRadius: 4, padding: "2px 6px" }}>
                      📞 {p}
                    </a>
                  ))}
                </div>
              )}

              {/* People */}
              {people.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontSize: 10, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                    People ({people.length})
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {people.slice(0, 6).map((c, i) => (
                      <div key={i} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 6, padding: "6px 10px", fontSize: 11 }}>
                        {c.name && <div style={{ fontWeight: 600, color: "#111827" }}>{c.name}</div>}
                        {c.title && <div style={{ color: "#6B7280", marginBottom: 3 }}>{c.title}</div>}
                        {c.email && <a href={`mailto:${c.email}`} style={{ color: "#1D4ED8", textDecoration: "none", display: "block" }}>{c.email}</a>}
                        {c.linkedin && <a href={c.linkedin} target="_blank" rel="noopener noreferrer" style={{ color: "#0A66C2", fontWeight: 600, textDecoration: "none" }}>in LinkedIn</a>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No contact — find button */}
              {!vessel.enriched && emails.length === 0 && people.length === 0 && (
                <button onClick={handleEnrich} disabled={enriching || enrichDone}
                  style={{ fontSize: 11, fontWeight: 600, color: "#2563EB",
                    background: "#EFF6FF", border: "1px solid #BFDBFE",
                    borderRadius: 5, padding: "4px 12px", cursor: "pointer", marginTop: 4, alignSelf: "flex-start" }}>
                  {enrichDone ? "✓ Search started" : enriching ? "Searching…" : "Find contacts"}
                </button>
              )}
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── Event type colours ───────────────────────────────────────────────────────

const EVENT_TYPE_STYLE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  arrest:      { label: "Arrest",       color: "#991B1B", bg: "#FEF2F2", border: "#FECACA" },
  detention:   { label: "Detention",    color: "#92400E", bg: "#FFF7ED", border: "#FED7AA" },
  auction:     { label: "Auction",      color: "#C9A84C", bg: "#FEFCE8", border: "#FDE68A" },
  bank_seizure:{ label: "Bank Seizure", color: "#1E40AF", bg: "#EFF6FF", border: "#BFDBFE" },
  sanction:    { label: "Sanction",     color: "#6B21A8", bg: "#FAF5FF", border: "#E9D5FF" },
  scrap_sale:  { label: "Scrap Sale",   color: "#065F46", bg: "#ECFDF5", border: "#A7F3D0" },
};

function EventTypeBadge({ type }: { type: string }) {
  const s = EVENT_TYPE_STYLE[type] ?? { label: type, color: "#374151", bg: "#F3F4F6", border: "#D1D5DB" };
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
      color: s.color, background: s.bg, border: `1px solid ${s.border}`, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

function NewsSignalsSection() {
  const [events, setEvents]   = useState<RadarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    setLoading(true);
    fetch("/api/radar-events?limit=100&days=30")
      .then(r => r.json())
      .then(d => setEvents(d.events ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() =>
    typeFilter === "all" ? events : events.filter(e => e.event_type === typeFilter),
    [events, typeFilter]
  );

  const SELECT: React.CSSProperties = {
    fontSize: 12, padding: "5px 9px", borderRadius: 6,
    border: "1px solid #D1D5DB", background: "#fff", color: "#374151", cursor: "pointer",
  };

  return (
    <div style={{ marginTop: 48 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: 0 }}>News Signals</h2>
        <span style={{ fontSize: 13, color: "#6B7280" }}>Maritime arrests, detentions, auctions & sanctions — last 30 days</span>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap",
        background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "10px 14px" }}>
        <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Type</span>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={SELECT}>
          <option value="all">All events</option>
          {Object.entries(EVENT_TYPE_STYLE).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        {!loading && (
          <span style={{ fontSize: 12, color: "#9CA3AF", marginLeft: "auto" }}>
            {filtered.length} event{filtered.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 32, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>Loading news signals…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
          No events in the last 30 days. Run <code>node scripts/newsRadarScan.js</code> to populate.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(ev => {
            const hasContact = (ev.emails?.length ?? 0) > 0 || (ev.phones?.length ?? 0) > 0;
            const contactEmail = ev.emails?.[0] ?? null;
            const contactPhone = ev.phones?.[0] ?? null;
            return (
              <div key={ev.id} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10,
                padding: "14px 16px", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>

                {/* Badge + date */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0, minWidth: 90 }}>
                  <EventTypeBadge type={ev.event_type} />
                  <span style={{ fontSize: 11, color: "#9CA3AF" }}>
                    {ev.event_date
                      ? new Date(ev.event_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                      : new Date(ev.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                </div>

                {/* Main content */}
                <div style={{ flex: "1 1 280px", minWidth: 200 }}>
                  {/* Vessel link if matched */}
                  {ev.matched_vessel_id ? (
                    <a href={`/?mmsi=${ev.vessel_mmsi}`}
                      style={{ fontWeight: 700, color: "#1D4ED8", textDecoration: "none", fontSize: 14 }}>
                      {ev.vessel_name || `IMO ${ev.imo}`}
                    </a>
                  ) : (
                    <span style={{ fontWeight: 700, color: "#111827", fontSize: 14 }}>
                      {ev.vessel_name || (ev.imo ? `IMO ${ev.imo}` : "Unknown vessel")}
                    </span>
                  )}
                  {ev.location && (
                    <span style={{ fontSize: 12, color: "#6B7280", marginLeft: 8 }}>{ev.location}</span>
                  )}
                  {ev.imo && (
                    <span style={{ fontSize: 11, color: "#9CA3AF", marginLeft: 8 }}>IMO {ev.imo}</span>
                  )}

                  <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.55, marginTop: 6 }}>
                    {ev.summary}
                  </div>

                  <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>
                    Source: {ev.source_name}
                  </div>
                </div>

                {/* Owner / contact if matched */}
                {ev.matched_vessel_id && (
                  <div style={{ flexShrink: 0, minWidth: 160, display: "flex", flexDirection: "column", gap: 4 }}>
                    {(ev.owner_name || ev.manager_name) && (
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
                        {ev.owner_name ?? ev.manager_name}
                      </div>
                    )}
                    {hasContact && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {contactEmail && (
                          <a href={`mailto:${contactEmail}`} title={contactEmail}
                            style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5,
                              background: "#EFF6FF", border: "1px solid #BFDBFE",
                              color: "#1D4ED8", textDecoration: "none", fontWeight: 600 }}>
                            ✉ Email
                          </a>
                        )}
                        {contactPhone && (
                          <a href={`tel:${contactPhone}`} title={contactPhone}
                            style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5,
                              background: "#F0FDF4", border: "1px solid #BBF7D0",
                              color: "#15803D", textDecoration: "none", fontWeight: 600 }}>
                            ☎ Call
                          </a>
                        )}
                      </div>
                    )}
                    {ev.vessel_flag && (
                      <div style={{ fontSize: 11, color: "#9CA3AF" }}>{ev.vessel_flag}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

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

  const [yards, setYards]               = useState<YardPrices>({});
  // Aliağa by default because the distance column is measured to it.
  const [yard, setYard]                 = useState<string>("Aliaga");

  useEffect(() => {
    setLoading(true);
    fetch("/api/opportunities?limit=500")
      .then(r => r.json())
      .then(d => {
        setVessels(d.vessels ?? []);
        setTotal(d.total ?? 0);
        setContactableTotal(d.contactable_total ?? 0);
        setYards(d.yards ?? {});
      })
      .finally(() => setLoading(false));
  }, []);

  function vesselHasContact(v: OpportunityVessel) {
    const emails = [...(v.emails?.filter(Boolean) ?? []), ...(v.best_email ? [v.best_email] : [])];
    return emails.length > 0 || (v.phones?.length ?? 0) > 0;
  }

  const filtered = useMemo(() => {
    return vessels.filter(v => {
      if (signalFilter !== "all" && !v.signals.some(s => s.type === signalFilter)) return false;
      if (v.age < minAge) return false;
      if (typeFilter !== "all" && !(v.type_specific ?? v.type ?? "").toLowerCase().includes(typeFilter.toLowerCase())) return false;
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
          Hulls nearing the end of trading life — found from AIS movement, PSC detentions and survey schedules, before any broker lists them.
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

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Price at</span>
          <select value={yard} onChange={e => setYard(e.target.value)} style={SELECT}>
            {Object.entries(yards).map(([name, y]) => (
              <option key={name} value={name}>{name} · {y.country}</option>
            ))}
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
          {contactOnly ? "With contact" : "Show all"}
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
                <th style={{ ...TH, textAlign: "right" }}>LDT</th>
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

                      {/* LDT */}
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        {v.ldt
                          ? <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{v.ldt.toLocaleString()}</span>
                          : <a href={`/vessel/${v.imo}`} onClick={e => e.stopPropagation()}
                              style={{ fontSize: 12, color: "#2563EB", fontWeight: 600,
                                textDecoration: "none", padding: "2px 8px", borderRadius: 4,
                                background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
                              Contact →
                            </a>
                        }
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
          <span style={{ fontSize: 11, color: "#9CA3AF" }}>
            LDT shown where known. "Contact →" = LDT not yet enriched, links to vessel page.
          </span>
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

      <NewsSignalsSection />
    </div>
  );
}
