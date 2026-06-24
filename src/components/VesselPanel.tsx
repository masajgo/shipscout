"use client";
import { useEffect, useState } from "react";
import { SCRAP_MARKETS } from "@/lib/scrapMarkets";

const C = {
  navy: "#0D1F28", mid: "#0F2733", light: "#1A3A4A",
  green: "#1D9E75", steel: "#8FA8B2", fg: "#E8F0F3",
  blue: "#6CB8E6", red: "#F87171",
};

type VesselData = {
  imo: string;
  age: number | null;
  scrapScore: number;
  particulars: {
    name: string; flag: string; type: string; builtYear: number;
    builtAt: string; dwt: number; grt: number; nrt: number; ldt: number;
    ldt_estimated: boolean;
    loa: number; beam: number; draft: number; callSign: string;
    mmsi: string; classSociety: string; status: string;
  };
  owner: {
    name: string; email: string; phone: string; address: string;
    country: string; managerName: string; managerEmail: string;
  };
  surveys: {
    lastDryDock: string; nextDryDock: string; classExpiry: string;
  };
  detentions: any[];
};

type EmailsByType = { department: string[]; generic: string[]; other: string[] };

type ContactResult = {
  company:            string;
  website:            string | null;
  emails:             string[];
  emailsByType:       EmailsByType;
  emailFormat:        string | null;
  guessedEmails:      { email: string; name: string; guessed: true }[];
  phones:             string[];
  address:            string | null;
  linkedinCompanyUrl: string;
  linkedinPeopleUrl:  string;
  contactPath:        string | null;
};

function bestEmail(contact: ContactResult | null, owner: VesselData["owner"] | undefined): string {
  if (contact) {
    if (contact.emailsByType?.department?.[0]) return contact.emailsByType.department[0];
    if (contact.emailsByType?.generic?.[0])    return contact.emailsByType.generic[0];
    if (contact.emails?.[0])                   return contact.emails[0];
    if (contact.guessedEmails?.[0])            return contact.guessedEmails[0].email;
  }
  return owner?.email || owner?.managerEmail || "";
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 70 ? "#E24B4A" : score >= 50 ? "#FB923C" : C.green;
  const r = 28, cx = 32, circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64">
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(143,168,178,0.15)" strokeWidth="6" />
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth="6"
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 32 32)" />
      <text x="32" y="37" textAnchor="middle" fontSize="14" fontWeight="700" fill={color}>{score}</text>
    </svg>
  );
}

function Row({ label, value, mono = false, highlight = false }: {
  label: string; value: any; mono?: boolean; highlight?: boolean;
}) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid rgba(143,168,178,0.08)" }}>
      <span style={{ fontSize: 12, color: C.steel, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: highlight ? C.green : C.fg, fontFamily: mono ? "monospace" : "inherit", textAlign: "right", marginLeft: 8, wordBreak: "break-all" }}>
        {value}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.steel, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function EmailBadge({ label, email }: { label: string; email: string }) {
  return (
    <div style={{ padding: "7px 0", borderBottom: "1px solid rgba(143,168,178,0.08)" }}>
      <div style={{ fontSize: 10, color: C.steel, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 11, fontFamily: "monospace", color: C.fg, wordBreak: "break-all" }}>{email}</div>
    </div>
  );
}

export default function VesselPanel({ imo, onClose }: { imo: string; onClose: () => void }) {
  const [data,           setData]           = useState<VesselData | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState<string | null>(null);
  const [contact,        setContact]        = useState<ContactResult | null>(null);
  const [contactLoading, setContactLoading] = useState(false);
  const [webFetchedAt,   setWebFetchedAt]   = useState<string | null>(null);
  const [emailDraft,     setEmailDraft]     = useState(false);
  const [emailBody,      setEmailBody]      = useState("");
  const [crmAdded,       setCrmAdded]       = useState(false);
  const [watching,       setWatching]       = useState(false);
  const [photoOk,        setPhotoOk]        = useState(true);
  const [triedFallback,  setTriedFallback]  = useState(false);

  // Load Datalastic vessel data
  useEffect(() => {
    setData(null); setContact(null); setWebFetchedAt(null);
    setLoading(true); setError(null);
    setEmailDraft(false); setEmailBody("");
    setCrmAdded(false); setWatching(false);
    setPhotoOk(true); setTriedFallback(false);

    fetch(`/api/vessel/${imo}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(`API error: ${d.error}`); setLoading(false); return; }
        setData(d);
        setLoading(false);
      })
      .catch(() => { setError("Network error"); setLoading(false); });
  }, [imo]);

  // Load contact enrichment using MMSI (available after vessel data loads)
  useEffect(() => {
    const mmsi = data?.particulars?.mmsi;
    if (!mmsi) return;
    setContactLoading(true);
    fetch(`/api/vessels/${mmsi}/contact`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setContact(d?.contact ?? null);
        setWebFetchedAt(d?.webFetchedAt ?? null);
      })
      .catch(() => {})
      .finally(() => setContactLoading(false));
  }, [data?.particulars?.mmsi]);

  // Keyboard close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const toEmail = data ? bestEmail(contact, data.owner) : "";

  const offerMailto = () => {
    if (!data) return;
    const vessel   = data.particulars.name || `IMO ${imo}`;
    const manager  = contact?.company || data.owner?.managerName || data.owner?.name || "Ship Manager";
    const subject  = `Sale/Purchase Inquiry — MV ${vessel} (IMO ${imo})`;
    const body     =
`Dear ${manager} team,

We are reaching out via ShipScout regarding the vessel below.

  Vessel:    ${vessel}
  IMO:       ${imo}
  MMSI:      ${data.particulars.mmsi || "—"}
  Type:      ${data.particulars.type || "—"}
  Built:     ${data.particulars.builtYear || "—"}${data.age ? ` (${data.age}y)` : ""}
  DWT:       ${data.particulars.dwt ? data.particulars.dwt.toLocaleString() + " t" : "—"}
  LDT:       ${data.particulars.ldt ? data.particulars.ldt.toLocaleString() + " t" : "—"}
  Flag:      ${data.particulars.flag || "—"}

We have a buyer interested in a sale/purchase opportunity for this vessel.
Could you confirm whether it is potentially available and share the appropriate commercial contact?

Best regards,
ShipScout — Maritime Intelligence`;
    return `mailto:${encodeURIComponent(toEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div style={{
      position: "fixed", right: 0, top: 0, bottom: 0, width: 420,
      background: C.mid, borderLeft: "1px solid rgba(143,168,178,0.15)",
      zIndex: 100, overflowY: "auto", display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(143,168,178,0.12)", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: C.mid, zIndex: 10 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.fg, fontFamily: "Space Grotesk, sans-serif" }}>
            {loading ? "Loading..." : data?.particulars?.name || `IMO ${imo}`}
          </div>
          <div style={{ fontSize: 11, color: C.steel, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
            IMO {imo}
            <button
              onClick={() => { navigator.clipboard.writeText(imo).catch(() => {}); }}
              style={{ background: "none", border: "none", color: C.steel, cursor: "pointer", fontSize: 10, padding: 0, opacity: 0.6 }}
              title="Copy IMO"
            >⎘</button>
          </div>
        </div>
        <button onClick={onClose} title="Close (Esc)" style={{ background: "none", border: "none", color: C.steel, fontSize: 20, cursor: "pointer", padding: "4px 8px" }}>×</button>
      </div>

      {loading && (
        <div style={{ padding: 40, textAlign: "center", color: C.steel, fontSize: 13 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⚓</div>
          Loading vessel data...
        </div>
      )}
      {error && (
        <div style={{ padding: 20, color: C.red, fontSize: 13, textAlign: "center" }}>{error}</div>
      )}

      {(() => {
        const vesselName = data?.particulars?.name || `IMO ${imo}`;
        const vesselType = (data?.particulars?.type || "").toLowerCase();

        // Priority 1: Blob-stored photo from DB (via API)
        // Priority 2: vessel-tracker.com direct pattern
        // Priority 3: type-based colored placeholder
        const dbPhoto    = (data as any)?.photoUrl ?? null;
        const fallbackUrl = `https://photos.vessel-tracker.com/shipImages/${imo}.jpg`;

        const placeholderBg =
          vesselType.includes("tanker")    ? "#0D3349" :
          vesselType.includes("bulk")      ? "#1A2F3A" :
          vesselType.includes("container") ? "#0F2733" :
          vesselType.includes("passenger") || vesselType.includes("cruise") ? "#1D2E3C" :
          vesselType.includes("offshore")  ? "#162030" :
          "#0F2733";
        const placeholderIcon =
          vesselType.includes("tanker")    ? "🛢" :
          vesselType.includes("container") ? "📦" :
          vesselType.includes("passenger") || vesselType.includes("cruise") ? "🚢" :
          vesselType.includes("offshore")  ? "⚙️" :
          "⚓";

        const photoSrc = dbPhoto || (!triedFallback ? fallbackUrl : null);

        const overlay = (
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            background: "linear-gradient(transparent, rgba(0,0,0,0.7))",
            padding: "20px 12px 8px",
            color: "white", fontSize: 13, fontWeight: 600,
          }}>
            {vesselName}
          </div>
        );

        if (photoOk && photoSrc) {
          return (
            <div style={{ position: "relative", width: "100%", height: "170px", overflow: "hidden" }}>
              <img
                src={photoSrc}
                alt={vesselName}
                onError={() => {
                  if (!triedFallback && !dbPhoto) {
                    setTriedFallback(true); // will try fallback already shown, mark done
                  } else {
                    setPhotoOk(false);
                  }
                }}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
              {overlay}
            </div>
          );
        }

        // Placeholder
        return (
          <div style={{
            position: "relative", width: "100%", height: "130px",
            background: placeholderBg,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 40,
          }}>
            {placeholderIcon}
            {overlay}
          </div>
        );
      })()}

      {data && !loading && (
        <div style={{ padding: 20 }}>

          {/* Scrap Score */}
          <div style={{ background: C.navy, borderRadius: 12, padding: 16, marginBottom: 20, display: "flex", alignItems: "center", gap: 16 }}>
            <ScoreRing score={data.scrapScore} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: C.steel, marginBottom: 4 }}>SCRAP SCORE</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: data.scrapScore >= 70 ? "#E24B4A" : data.scrapScore >= 50 ? "#FB923C" : C.green }}>
                {data.scrapScore >= 70 ? "High Priority" : data.scrapScore >= 50 ? "Watch" : "Low Risk"}
              </div>
              <div style={{ fontSize: 11, color: C.steel, marginTop: 2 }}>
                {data.age ? `${data.age} yrs old` : ""} · {data.detentions.length} detention{data.detentions.length !== 1 ? "s" : ""}
              </div>
            </div>
            {data.scrapScore >= 50 && (
              <div style={{ fontSize: 24 }}>{data.scrapScore >= 70 ? "🔴" : "🟡"}</div>
            )}
          </div>

          {/* Ship Particulars */}
          <Section title="Ship Particulars">
            <Row label="Name"      value={data.particulars.name} />
            <Row label="Flag"      value={data.particulars.flag} />
            <Row label="Type"      value={data.particulars.type} />
            <Row label="Built"     value={data.particulars.builtYear} />
            <Row label="Built At"  value={data.particulars.builtAt} />
            <Row label="DWT"       value={data.particulars.dwt ? `${data.particulars.dwt.toLocaleString()} t` : "N/A"} highlight />
            <Row label="LDT"       value={data.particulars.ldt ? `${data.particulars.ldt.toLocaleString()} t` : "N/A"} highlight />
            <Row
              label="Est. Scrap Value"
              value={data.particulars.ldt
                ? `${data.particulars.ldt_estimated ? "~" : ""}$${((data.particulars.ldt * (SCRAP_MARKETS.find(m => m.market === "Aliağa")?.price ?? 420)) / 1_000_000).toFixed(1)}M @ Aliağa`
                : null}
              highlight
            />
            <Row label="GRT"       value={data.particulars.grt ? `${data.particulars.grt.toLocaleString()} t` : null} />
            <Row label="LOA"       value={data.particulars.loa ? `${data.particulars.loa} m` : null} />
            <Row label="Beam"      value={data.particulars.beam ? `${data.particulars.beam} m` : null} />
            <Row label="Draft"     value={data.particulars.draft ? `${data.particulars.draft} m` : null} />
            <Row label="Call Sign" value={data.particulars.callSign} mono />
            <Row label="MMSI"      value={data.particulars.mmsi} mono />
            <Row label="Class"     value={data.particulars.classSociety} />
            <Row label="Status"    value={data.particulars.status} />
          </Section>

          {/* Estimated Scrap Value */}
          {data.particulars.ldt && (
            <Section title="Estimated Scrap Value">
              {data.particulars.ldt_estimated && (
                <div style={{ fontSize: 10, color: C.steel, fontStyle: "italic", marginBottom: 8 }}>
                  LDT tahmin edildi (gerçek lightship verisi yok)
                </div>
              )}
              {SCRAP_MARKETS.map(({ market, emoji, price }) => {
                const market_label = `${market} ${emoji}`;
                const val = (data.particulars.ldt * price) / 1_000_000;
                const fmt = `${data.particulars.ldt_estimated ? "~" : ""}$${val >= 10 ? val.toFixed(1) : val.toFixed(2)}M`;
                return (
                  <div key={market} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid rgba(143,168,178,0.08)" }}>
                    <span style={{ fontSize: 12, color: C.steel }}>{market_label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>
                      {fmt}
                      <span style={{ fontWeight: 400, color: C.steel, marginLeft: 4 }}>@${price}/LDT</span>
                    </span>
                  </div>
                );
              })}
            </Section>
          )}

          {/* Survey / Dry Dock */}
          {(data.surveys.lastDryDock || data.surveys.nextDryDock || data.surveys.classExpiry) ? (
            <Section title="Survey & Dry Dock">
              <Row label="Last Dry Dock" value={data.surveys.lastDryDock} />
              <Row label="Next DD"       value={data.surveys.nextDryDock} highlight />
              <Row label="Class Expiry"  value={data.surveys.classExpiry} />
            </Section>
          ) : (
            <Section title="Survey & Dry Dock">
              <div style={{ fontSize: 12, color: C.steel, padding: "8px 0", fontStyle: "italic" }}>
                Survey data requires maritime reports subscription.
              </div>
            </Section>
          )}

          {/* PSC Detentions */}
          {data.detentions.length > 0 && (
            <Section title={`PSC Detentions (${data.detentions.length})`}>
              {data.detentions.slice(0, 5).map((d: any, i: number) => (
                <div key={i} style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 8, padding: "8px 12px", marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.red }}>{d.port} · {d.date}</div>
                  <div style={{ fontSize: 11, color: C.steel, marginTop: 2 }}>{d.authority} · {d.deficiencies} deficiencies</div>
                </div>
              ))}
            </Section>
          )}

          {/* Owner & Contact — enriched first, Datalastic fallback */}
          <Section title="Owner & Contact">
            {/* Company names */}
            {(data.owner?.name || data.owner?.managerName) && (
              <div style={{ marginBottom: 10 }}>
                {data.owner.managerName && (
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.fg }}>{data.owner.managerName}</div>
                )}
                {data.owner.name && data.owner.name !== data.owner.managerName && (
                  <div style={{ fontSize: 11, color: C.steel, marginTop: 2 }}>{data.owner.name}</div>
                )}
              </div>
            )}

            {contactLoading && (
              <div style={{ fontSize: 11, color: C.steel, fontStyle: "italic", padding: "6px 0" }}>
                Searching contacts…
              </div>
            )}

            {contact ? (
              <>
                {/* Website — text only, no link */}
                {contact.website && (
                  <Row label="Website" value={contact.website} mono />
                )}

                {/* Layer 1: Department emails — red S&P badge */}
                {contact.emailsByType.department.map(e => (
                  <div key={e} style={{ padding: "7px 0", borderBottom: "1px solid rgba(143,168,178,0.08)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 10, color: C.steel }}>S&P / Chartering</span>
                      <span style={{ fontSize: 8, fontWeight: 700, color: "#fff", background: C.red, borderRadius: 3, padding: "1px 4px", letterSpacing: "0.04em" }}>S&P</span>
                    </div>
                    <div style={{ fontSize: 11, fontFamily: "monospace", color: C.fg, wordBreak: "break-all" }}>{e}</div>
                  </div>
                ))}

                {/* Layer 2: Generic emails — gray badge */}
                {contact.emailsByType.department.length === 0 &&
                  contact.emailsByType.generic.slice(0, 2).map(e => (
                    <div key={e} style={{ padding: "7px 0", borderBottom: "1px solid rgba(143,168,178,0.08)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 10, color: C.steel }}>Genel</span>
                        <span style={{ fontSize: 8, fontWeight: 700, color: C.steel, background: "rgba(143,168,178,0.15)", borderRadius: 3, padding: "1px 4px", letterSpacing: "0.04em" }}>GENEL</span>
                      </div>
                      <div style={{ fontSize: 11, fontFamily: "monospace", color: C.fg, wordBreak: "break-all" }}>{e}</div>
                    </div>
                  ))
                }

                {/* Layer 3: Other named emails (max 2) */}
                {contact.emailsByType.department.length === 0 &&
                  contact.emailsByType.generic.length === 0 &&
                  contact.emailsByType.other.slice(0, 2).map(e => (
                    <EmailBadge key={e} label="Email" email={e} />
                  ))
                }

                {/* Layer 4: Guessed personal email — italic + orange TAHMİNİ badge */}
                {contact.guessedEmails.map(g => (
                  <div key={g.email} style={{ padding: "7px 0", borderBottom: "1px solid rgba(143,168,178,0.08)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 10, color: C.steel, fontStyle: "italic" }}>Est. {g.name}</span>
                      <span style={{ fontSize: 8, fontWeight: 700, color: "#fff", background: "#FB923C", borderRadius: 3, padding: "1px 4px", letterSpacing: "0.04em" }}>TAHMİNİ</span>
                    </div>
                    <div style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(232,240,243,0.55)", wordBreak: "break-all", fontStyle: "italic" }}>{g.email}</div>
                  </div>
                ))}

                {/* Phone */}
                {contact.phones.slice(0, 2).map(p => (
                  <Row key={p} label="Phone" value={p} mono />
                ))}

                {/* Address */}
                {contact.address && <Row label="Address" value={contact.address} />}

                {/* Email format hint */}
                {contact.emailFormat && (
                  <div style={{ fontSize: 10, color: "rgba(143,168,178,0.6)", fontFamily: "monospace", marginTop: 6 }}>
                    format: {contact.emailFormat}
                  </div>
                )}

                {/* Last updated */}
                {webFetchedAt && (
                  <div style={{ fontSize: 10, color: "rgba(143,168,178,0.45)", marginTop: 6 }}>
                    Son güncelleme: {Math.floor((Date.now() - new Date(webFetchedAt).getTime()) / (1000 * 60 * 60 * 24))} gün önce
                  </div>
                )}
              </>
            ) : !contactLoading && (
              <>
                {/* Datalastic fallback */}
                <Row label="Email"      value={data.owner?.email} mono />
                <Row label="Phone"      value={data.owner?.phone} mono />
                <Row label="Address"    value={data.owner?.address} />
                <Row label="Country"    value={data.owner?.country} />
                <Row label="Mgr. Email" value={data.owner?.managerEmail} mono />
                {!data.owner?.name && (
                  <div style={{ fontSize: 12, color: C.steel, padding: "8px 0", fontStyle: "italic" }}>
                    Owner data requires maritime reports subscription.
                  </div>
                )}
              </>
            )}

            {/* LinkedIn buttons */}
            <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
              <a
                href={(contact?.linkedinCompanyUrl) || `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(data.owner?.managerName || data.owner?.name || "")}`}
                target="_blank" rel="noreferrer"
                style={{ flex: 1, display: "block", textAlign: "center", background: "rgba(108,184,230,0.08)", border: "1px solid rgba(108,184,230,0.25)", borderRadius: 8, padding: "8px 6px", color: C.blue, fontSize: 10, fontWeight: 600, textDecoration: "none", letterSpacing: "0.04em" }}
              >
                LinkedIn Şirket →
              </a>
              <a
                href={(contact?.linkedinPeopleUrl) || `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent((data.owner?.managerName || data.owner?.name || "") + " chartering sale purchase")}`}
                target="_blank" rel="noreferrer"
                style={{ flex: 1, display: "block", textAlign: "center", background: "rgba(108,184,230,0.08)", border: "1px solid rgba(108,184,230,0.25)", borderRadius: 8, padding: "8px 6px", color: C.blue, fontSize: 10, fontWeight: 600, textDecoration: "none", letterSpacing: "0.04em" }}
              >
                S&P Yönetici →
              </a>
            </div>
          </Section>

          {/* Action Buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
            {/* Offer email */}
            <button
              onClick={() => {
                const href = offerMailto();
                if (href) window.location.href = href;
                else {
                  const draft = `Dear ${contact?.company || data.owner?.managerName || data.owner?.name || "Ship Manager"},\n\n` +
                    `We are interested in discussing a sale/purchase opportunity for MV ${data.particulars.name || `IMO ${imo}`}.\n\n` +
                    `Could you confirm availability and share the appropriate commercial contact?\n\nBest regards,\nShipScout Team`;
                  setEmailBody(draft);
                  setEmailDraft(true);
                }
              }}
              style={{ background: C.green, border: "none", borderRadius: 10, padding: "12px 20px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "Inter, sans-serif" }}
            >
              ✉ Teklif Emaili Yaz
            </button>

            {/* Add to CRM */}
            <button
              onClick={async () => {
                try {
                  const res = await fetch("/api/crm/add", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ imo: data.imo, name: data.particulars?.name, score: data.scrapScore, stage: "lead" }),
                  });
                  if (res.ok) setCrmAdded(true);
                } catch { setCrmAdded(true); }
              }}
              style={{ background: crmAdded ? C.green : "rgba(108,184,230,0.08)", border: `1px solid ${crmAdded ? C.green : "rgba(108,184,230,0.2)"}`, borderRadius: 10, padding: "12px 20px", color: crmAdded ? "#fff" : C.blue, fontSize: 13, fontWeight: 600, cursor: crmAdded ? "default" : "pointer", fontFamily: "Inter, sans-serif" }}
            >
              {crmAdded ? "✓ CRM'e Eklendi" : "📋 CRM'e Ekle"}
            </button>

            {/* Watch */}
            <button
              onClick={async () => {
                try {
                  const res = await fetch("/api/watch", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ imo: data.imo, name: data.particulars?.name, source: "manual" }),
                  });
                  if (res.ok) setWatching(true);
                } catch { setWatching(true); }
              }}
              style={{ background: watching ? C.green : "rgba(143,168,178,0.06)", border: `1px solid ${watching ? C.green : "rgba(143,168,178,0.15)"}`, borderRadius: 10, padding: "12px 20px", color: watching ? "#fff" : C.steel, fontSize: 13, fontWeight: 600, cursor: watching ? "default" : "pointer", fontFamily: "Inter, sans-serif" }}
            >
              {watching ? "✓ İzleniyor" : "👁 Gemiyi İzle"}
            </button>
          </div>

          {/* Email Draft (manual fallback when mailto not possible) */}
          {emailDraft && (
            <div style={{ marginTop: 20, background: C.navy, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.steel, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Email Taslağı</div>
              <textarea
                value={emailBody}
                onChange={e => setEmailBody(e.target.value)}
                style={{ width: "100%", background: "rgba(143,168,178,0.06)", border: "1px solid rgba(143,168,178,0.15)", borderRadius: 8, padding: 12, color: C.fg, fontSize: 12, lineHeight: 1.6, fontFamily: "Inter, sans-serif", resize: "vertical", minHeight: 200, boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  onClick={() => {
                    const to = toEmail;
                    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(`Sale/Purchase Inquiry — MV ${data.particulars.name}`)}&body=${encodeURIComponent(emailBody)}`;
                  }}
                  style={{ flex: 1, background: C.green, border: "none", borderRadius: 8, padding: "10px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  📤 Gönder
                </button>
                <button onClick={() => setEmailDraft(false)} style={{ background: "none", border: "1px solid rgba(143,168,178,0.2)", borderRadius: 8, padding: "10px 16px", color: C.steel, fontSize: 12, cursor: "pointer" }}>
                  İptal
                </button>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
