"use client";
import React, { useEffect, useState, useMemo, useCallback } from "react";
import type { OpportunityVessel } from "@/app/api/opportunities/route";
import type { RadarEvent } from "@/app/api/radar-events/route";
import { SIGNAL_META, type SignalType } from "@/lib/signals";
import { type YardPrices, estimateCheque, formatUsd } from "@/lib/scrapValue";

const SIGNAL_LABELS: Record<SignalType, string> = {
  survey_pressure:  "Survey Due",
  detention_age:    "PSC Detained",
  detention_trend:  "Chronic Detentions",
  scrap_proximity:  "Near Scrap Yard",
  layup:            "Lay-up",
  age_threshold:    "25+ Years",
};

const VESSEL_TYPES = ["Bulk Carrier", "General Cargo", "Container", "Tanker", "Ro-Ro", "Reefer", "Vehicles Carrier"];

// ─── Draft Email Modal (AI-powered) ──────────────────────────────────────────

function DraftEmailModal({ vessel, yards, yard, onClose }: {
  vessel: OpportunityVessel;
  yards: YardPrices;
  yard: string;
  onClose: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody]       = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [copied, setCopied]   = useState(false);

  const cheque = vessel.ldt ? estimateCheque(vessel.ldt, vessel.price_category, yard, yards) : null;
  const estimatedValue = cheque ? formatUsd(cheque) : null;
  const recipientEmail = vessel.best_email ?? vessel.emails?.[0] ?? "";

  useEffect(() => {
    fetch("/api/vessels/draft-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vesselName:     vessel.name,
        imo:            vessel.imo,
        age:            vessel.age,
        type:           vessel.type ?? vessel.type_specific ?? null,
        ldt:            vessel.ldt ?? null,
        flag:           vessel.flag ?? null,
        managerName:    vessel.manager_name ?? null,
        ownerName:      vessel.owner_name ?? null,
        signals:        vessel.signals.map(s => ({ label: s.label, explanation: s.explanation })),
        estimatedValue,
      }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setSubject(d.subject);
        setBody(d.body);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function copyBody() {
    navigator.clipboard.writeText(body).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const mailtoHref = `mailto:${recipientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "#fff", borderRadius: 12, padding: "28px 32px", maxWidth: 640, width: "90%",
        maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
      }} onClick={e => e.stopPropagation()}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827" }}>AI Outreach Email</h3>
            {!loading && !error && (
              <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>Written by Claude · edit before sending</div>
            )}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280", fontSize: 20 }}>✕</button>
        </div>

        {loading ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>
            Writing email for {vessel.name}…
          </div>
        ) : error ? (
          <div style={{ padding: "24px 0", color: "#DC2626", fontSize: 13 }}>Error: {error}</div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4, fontWeight: 600 }}>TO</div>
            <div style={{ fontSize: 13, color: "#374151", marginBottom: 12, padding: "6px 10px", background: "#F9FAFB", borderRadius: 6, border: "1px solid #E5E7EB" }}>
              {recipientEmail || "— no email yet —"}
            </div>

            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4, fontWeight: 600 }}>SUBJECT</div>
            <div style={{ fontSize: 13, color: "#374151", marginBottom: 16, padding: "6px 10px", background: "#F9FAFB", borderRadius: 6, border: "1px solid #E5E7EB" }}>
              {subject}
            </div>

            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4, fontWeight: 600 }}>BODY</div>
            <pre style={{
              fontSize: 13, color: "#374151", lineHeight: 1.7, margin: 0, marginBottom: 20,
              padding: "12px 14px", background: "#F9FAFB", borderRadius: 8, border: "1px solid #E5E7EB",
              whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "inherit",
            }}>
              {body}
            </pre>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={copyBody} style={{
                fontSize: 13, fontWeight: 600, padding: "8px 18px", borderRadius: 6, cursor: "pointer",
                background: copied ? "#F0FDF4" : "#EFF6FF",
                border: `1px solid ${copied ? "#BBF7D0" : "#BFDBFE"}`,
                color: copied ? "#15803D" : "#1D4ED8",
              }}>
                {copied ? "✓ Copied" : "Copy body"}
              </button>

              {recipientEmail && (
                <a href={mailtoHref} style={{
                  fontSize: 13, fontWeight: 600, padding: "8px 18px", borderRadius: 6,
                  background: "#1D4ED8", color: "#fff", textDecoration: "none", display: "inline-block",
                }}>
                  Open in Mail
                </a>
              )}

              <button onClick={onClose} style={{
                fontSize: 13, padding: "8px 18px", borderRadius: 6, cursor: "pointer",
                background: "#fff", border: "1px solid #E5E7EB", color: "#6B7280", marginLeft: "auto",
              }}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Contact cell ─────────────────────────────────────────────────────────────

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
          <a href={`mailto:${emails[0]}`} title={emails[0]} onClick={e => e.stopPropagation()}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "3px 8px",
              borderRadius: 5, background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#1D4ED8",
              textDecoration: "none", whiteSpace: "nowrap", fontWeight: 600 }}>
            ✉ Email
          </a>
        )}
        {phones[0] && (
          <a href={`tel:${phones[0]}`} title={phones[0]} onClick={e => e.stopPropagation()}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "3px 8px",
              borderRadius: 5, background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D",
              textDecoration: "none", whiteSpace: "nowrap", fontWeight: 600 }}>
            ☎ Call
          </a>
        )}
        {vessel.linkedin_url && (
          <a href={vessel.linkedin_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
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

// ─── Expanded row ─────────────────────────────────────────────────────────────

function ExpandedRow({ vessel, yards, yard, onDraftEmail }: {
  vessel: OpportunityVessel;
  yards: YardPrices;
  yard: string;
  onDraftEmail: () => void;
}) {
  const EMAIL_LIMIT = 8;
  const emails = [
    ...(vessel.best_email ? [vessel.best_email] : []),
    ...(vessel.emails?.filter(e => e && e !== vessel.best_email) ?? []),
  ];
  const phones = vessel.phones?.filter(Boolean) ?? [];
  const people = vessel.contacts?.filter(c => c.name || c.email) ?? [];
  const [enriching, setEnriching] = React.useState(false);
  const [enrichDone, setEnrichDone] = React.useState(false);

  const cheque = estimateCheque(vessel.ldt, vessel.price_category, yard, yards);

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

  const hasContact = emails.length > 0 || phones.length > 0 || people.length > 0;

  // Nearest yard info
  const yardDistances: [string, number | null][] = [
    ["Aliağa", vessel.dist_aliaga_nm],
    ["Alang", vessel.dist_alang_nm],
    ["Chittagong", vessel.dist_chittagong_nm],
    ["Gadani", vessel.dist_gadani_nm],
  ].filter(([, d]) => d !== null) as [string, number][];
  yardDistances.sort((a, b) => (a[1] ?? Infinity) - (b[1] ?? Infinity));

  return (
    <tr>
      <td colSpan={8} style={{ padding: "0 16px 16px 48px", background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>

          {/* LDT + Value */}
          <div style={{ flex: "0 0 140px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              LDT / Value
            </div>
            {vessel.ldt ? (
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#111827" }}>
                  {vessel.ldt.toLocaleString()}
                  <span style={{ fontSize: 12, fontWeight: 500, color: "#6B7280", marginLeft: 4 }}>t</span>
                </div>
                {cheque && (
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#065F46", marginTop: 4 }}>
                    {formatUsd(cheque)}
                    <span style={{ fontSize: 11, fontWeight: 400, color: "#6B7280", marginLeft: 4 }}>at {yard}</span>
                  </div>
                )}
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

          {/* Vessel specs + yard distances */}
          <div style={{ flex: "0 0 200px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              Vessel Details
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151" }}>
              {vessel.gross_tonnage && <div><span style={{ color: "#9CA3AF" }}>GT:</span> {vessel.gross_tonnage.toLocaleString()}</div>}
              {vessel.deadweight    && <div><span style={{ color: "#9CA3AF" }}>DWT:</span> {vessel.deadweight.toLocaleString()}</div>}
              {vessel.ldt           && <div><span style={{ color: "#9CA3AF" }}>LDT:</span> {vessel.ldt.toLocaleString()}</div>}
              {vessel.scrap_score > 0 && <div><span style={{ color: "#9CA3AF" }}>Scrap score:</span> {vessel.scrap_score}/100</div>}
              {vessel.deficiency_count > 0 && <div><span style={{ color: "#9CA3AF" }}>Deficiencies:</span> {vessel.deficiency_count}</div>}
              {vessel.special_survey_date && (
                <div><span style={{ color: "#9CA3AF" }}>Survey date:</span> {new Date(vessel.special_survey_date).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</div>
              )}
              {vessel.detention_count > 0 && (
                <div style={{ color: vessel.detention_count >= 3 ? "#7C2D12" : "#92400E", fontWeight: 600 }}>
                  <span style={{ color: "#9CA3AF", fontWeight: 400 }}>Detentions:</span> {vessel.detention_count}
                  {vessel.detention_count >= 3 && " ⚠"}
                </div>
              )}

              {/* Scrap yard distances */}
              {yardDistances.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 10, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                    Scrap yards
                  </div>
                  {yardDistances.map(([yardName, dist]) => (
                    <div key={yardName} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ color: yardName === vessel.nearest_yard ? "#065F46" : "#9CA3AF", fontWeight: yardName === vessel.nearest_yard ? 600 : 400 }}>
                        {yardName}
                      </span>
                      <span style={{ color: yardName === vessel.nearest_yard ? "#065F46" : "#6B7280" }}>
                        {dist !== null ? `${Math.round(dist as number).toLocaleString()} nm` : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Full contact details */}
          <div style={{ flex: "1 1 280px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Owner / Manager
              </div>
              {hasContact && (
                <button onClick={onDraftEmail} style={{
                  fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 5, cursor: "pointer",
                  background: "#FFF7ED", border: "1px solid #FED7AA", color: "#92400E",
                }}>
                  ✉ Draft email
                </button>
              )}
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
  const [angles, setAngles]         = useState<Record<number, string>>({});
  const [anglesLoading, setAnglesLoading] = useState<Record<number, boolean>>({});
  const [anglesOpen, setAnglesOpen] = useState<Record<number, boolean>>({});

  function toggleAngle(ev: RadarEvent) {
    const id = ev.id;
    if (anglesOpen[id]) {
      setAnglesOpen(prev => ({ ...prev, [id]: false }));
      return;
    }
    setAnglesOpen(prev => ({ ...prev, [id]: true }));
    if (angles[id]) return;
    setAnglesLoading(prev => ({ ...prev, [id]: true }));
    fetch("/api/radar-events/buyer-angle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType:  ev.event_type,
        vesselName: ev.vessel_name ?? null,
        imo:        ev.imo ?? null,
        location:   ev.location ?? null,
        summary:    ev.summary,
        sourceName: ev.source_name,
      }),
    })
      .then(r => r.json())
      .then(d => d.angle && setAngles(prev => ({ ...prev, [id]: d.angle })))
      .catch(() => null)
      .finally(() => setAnglesLoading(prev => ({ ...prev, [id]: false })));
  }

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

                <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0, minWidth: 90 }}>
                  <EventTypeBadge type={ev.event_type} />
                  <span style={{ fontSize: 11, color: "#9CA3AF" }}>
                    {ev.event_date
                      ? new Date(ev.event_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                      : new Date(ev.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                </div>

                <div style={{ flex: "1 1 280px", minWidth: 200 }}>
                  {ev.matched_vessel_id ? (
                    <a href={ev.imo ? `/vessel/${ev.imo}` : `/?mmsi=${ev.vessel_mmsi}`}
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
                  <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.55, marginTop: 6 }}>{ev.summary}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: "#9CA3AF" }}>Source: {ev.source_name}</span>
                    <button
                      onClick={() => toggleAngle(ev)}
                      style={{
                        fontSize: 11, padding: "2px 9px", borderRadius: 5, cursor: "pointer",
                        background: anglesOpen[ev.id] ? "#065F46" : "#ECFDF5",
                        border: `1px solid ${anglesOpen[ev.id] ? "#065F46" : "#6EE7B7"}`,
                        color: anglesOpen[ev.id] ? "#fff" : "#065F46",
                        fontWeight: 600, transition: "all 0.15s",
                      }}
                    >
                      {anglesOpen[ev.id] ? "Hide angle" : "Buyer angle →"}
                    </button>
                  </div>
                  {anglesOpen[ev.id] && (
                    <div style={{
                      marginTop: 8, background: "#F0FDF4", border: "1px solid #BBF7D0",
                      borderRadius: 7, padding: "9px 12px",
                    }}>
                      {anglesLoading[ev.id] ? (
                        <span style={{ fontSize: 12, color: "#6B7280", fontStyle: "italic" }}>
                          Analysing buyer angle…
                        </span>
                      ) : angles[ev.id] ? (
                        <>
                          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
                            textTransform: "uppercase", color: "#065F46", marginBottom: 4 }}>
                            Buyer angle · Claude
                          </div>
                          <p style={{ margin: 0, fontSize: 12, color: "#1F2937", lineHeight: 1.6 }}>
                            {angles[ev.id]}
                          </p>
                        </>
                      ) : (
                        <span style={{ fontSize: 12, color: "#9CA3AF" }}>No angle available.</span>
                      )}
                    </div>
                  )}
                </div>

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
  const [vessels, setVessels]                 = useState<OpportunityVessel[]>([]);
  const [total, setTotal]                     = useState<number>(0);
  const [contactableTotal, setContactableTotal] = useState<number>(0);
  const [loading, setLoading]                 = useState(true);
  const [expanded, setExpanded]               = useState<Set<string>>(new Set());
  const [draftVessel, setDraftVessel]         = useState<OpportunityVessel | null>(null);
  const [pricesUpdatedAt, setPricesUpdatedAt] = useState<string | null>(null);

  const [signalFilter, setSignalFilter] = useState<string>("all");
  const [minAge, setMinAge]             = useState<number>(20);
  const [typeFilter, setTypeFilter]     = useState<string>("all");
  const [maxDist, setMaxDist]           = useState<string>("all");
  const [maxYardDist, setMaxYardDist]   = useState<string>("all");
  const [contactOnly, setContactOnly]   = useState(true);

  const [yards, setYards] = useState<YardPrices>({});
  const [yard, setYard]   = useState<string>("Aliaga");

  useEffect(() => {
    setLoading(true);
    fetch("/api/opportunities?limit=500")
      .then(r => r.json())
      .then(d => {
        setVessels(d.vessels ?? []);
        setTotal(d.total ?? 0);
        setContactableTotal(d.contactable_total ?? 0);
        setYards(d.yards ?? {});
        setPricesUpdatedAt(d.prices_updated_at ?? null);
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
      if (maxYardDist !== "all" && v.min_dist_scrapyard_nm !== null && v.min_dist_scrapyard_nm > parseInt(maxYardDist)) return false;
      if (contactOnly && !vesselHasContact(v)) return false;
      return true;
    });
  }, [vessels, signalFilter, minAge, typeFilter, maxDist, maxYardDist, contactOnly]);

  function toggleExpand(mmsi: string) {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(mmsi) ? n.delete(mmsi) : n.add(mmsi);
      return n;
    });
  }

  const resetFilters = useCallback(() => {
    setSignalFilter("all"); setMinAge(20); setTypeFilter("all");
    setMaxDist("all"); setMaxYardDist("all"); setContactOnly(true);
  }, []);

  const isFiltered = signalFilter !== "all" || minAge !== 20 || typeFilter !== "all" || maxDist !== "all" || maxYardDist !== "all" || !contactOnly;

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

      {/* Draft email modal */}
      {draftVessel && (
        <DraftEmailModal
          vessel={draftVessel}
          yards={yards}
          yard={yard}
          onClose={() => setDraftVessel(null)}
        />
      )}

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
              <span style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}>{contactableTotal.toLocaleString()}</span>
              <span style={{ fontSize: 13, color: "#6B7280" }}>contactable</span>
              <span style={{ fontSize: 13, color: "#D1D5DB" }}>·</span>
              <span style={{ fontSize: 13, color: "#9CA3AF" }}>{total.toLocaleString()} total opportunities</span>
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
            <option value="detention_trend">Chronic Detentions</option>
            <option value="scrap_proximity">Near Scrap Yard</option>
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
          <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Near yard</span>
          <select value={maxYardDist} onChange={e => setMaxYardDist(e.target.value)} style={SELECT}>
            <option value="all">Any distance</option>
            <option value="200">≤ 200 nm (beaching)</option>
            <option value="500">≤ 500 nm</option>
            <option value="1000">≤ 1,000 nm</option>
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
          {pricesUpdatedAt && (
            <span style={{ fontSize: 10, color: "#9CA3AF" }}>
              {new Date(pricesUpdatedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
            </span>
          )}
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

        {isFiltered && (
          <button onClick={resetFilters}
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
                <th style={{ ...TH, textAlign: "right" }}>LDT / Value</th>
                <th style={{ ...TH, textAlign: "right" }}>Score</th>
                <th style={{ ...TH, textAlign: "right" }}>Nearest Yard</th>
                <th style={{ width: 32 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => {
                const isOpen = expanded.has(v.mmsi);
                const cheque = estimateCheque(v.ldt, v.price_category, yard, yards);
                return (
                  <React.Fragment key={v.mmsi}>
                    <tr
                      onClick={() => toggleExpand(v.mmsi)}
                      style={{ borderBottom: isOpen ? "none" : "1px solid #F3F4F6", cursor: "pointer",
                        background: isOpen ? "#F9FAFB" : "transparent" }}>

                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ fontWeight: 600, color: "#111827" }}>{v.name}</div>
                        <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1 }}>
                          IMO {v.imo}{v.flag ? ` · ${v.flag}` : ""}
                        </div>
                      </td>

                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ fontWeight: 600, color: "#374151" }}>{v.age} yrs</div>
                        <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1 }}>{v.type_specific ?? v.type}</div>
                      </td>

                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {v.signals.map(s => <SignalBadge key={s.type} type={s.type} />)}
                        </div>
                      </td>

                      <td style={{ padding: "12px 16px" }}>
                        <ContactCell vessel={v} />
                      </td>

                      {/* LDT + value */}
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        {v.ldt ? (
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{v.ldt.toLocaleString()} t</div>
                            {cheque && <div style={{ fontSize: 11, color: "#065F46", fontWeight: 600 }}>{formatUsd(cheque)}</div>}
                          </div>
                        ) : (
                          <a href={`/vessel/${v.imo}`} onClick={e => e.stopPropagation()}
                            style={{ fontSize: 12, color: "#2563EB", fontWeight: 600,
                              textDecoration: "none", padding: "2px 8px", borderRadius: 4,
                              background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
                            Contact →
                          </a>
                        )}
                      </td>

                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        <span style={{ fontSize: 13, fontWeight: 700,
                          color: v.opportunity_score >= 70 ? "#B91C1C" : v.opportunity_score >= 40 ? "#92400E" : "#374151" }}>
                          {v.opportunity_score}
                        </span>
                      </td>

                      {/* Nearest yard */}
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        {v.min_dist_scrapyard_nm !== null ? (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: v.min_dist_scrapyard_nm <= 300 ? "#065F46" : "#6B7280" }}>
                              {Math.round(v.min_dist_scrapyard_nm).toLocaleString()} nm
                            </div>
                            <div style={{ fontSize: 10, color: "#9CA3AF" }}>{v.nearest_yard}</div>
                          </div>
                        ) : "—"}
                      </td>

                      <td style={{ padding: "12px 8px", color: "#9CA3AF", fontSize: 11, userSelect: "none" }}>
                        {isOpen ? "▲" : "▼"}
                      </td>
                    </tr>
                    {isOpen && (
                      <ExpandedRow
                        vessel={v}
                        yards={yards}
                        yard={yard}
                        onDraftEmail={() => setDraftVessel(v)}
                      />
                    )}
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
            LDT shown where known. Values calculated at selected yard.
          </span>
          <span style={{ fontSize: 11, color: "#9CA3AF" }}>Score = signal weights × 10 + scrap score (0–100).</span>
          {(["survey_pressure", "detention_trend", "detention_age", "scrap_proximity", "layup", "age_threshold"] as SignalType[]).map(t => (
            <span key={t} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <SignalBadge type={t} />
              <span style={{ fontSize: 11, color: "#9CA3AF" }}>
                {t === "survey_pressure" ? "wt 4" : t === "detention_trend" ? "wt 5" : t === "detention_age" ? "wt 3" : t === "scrap_proximity" ? "wt 2" : t === "layup" ? "wt 3" : "wt 1"}
              </span>
            </span>
          ))}
          <span style={{ fontSize: 11, color: "#9CA3AF" }}>
            Price alert: <code style={{ fontSize: 10 }}>node scripts/updateScrapPrices.js --alert</code>
          </span>
        </div>
      )}

      <NewsSignalsSection />
    </div>
  );
}
