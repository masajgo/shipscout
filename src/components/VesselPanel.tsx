"use client";
import { useEffect, useState } from "react";

const C = {
  navy: "#0D1F28", mid: "#0F2733", light: "#1A3A4A",
  green: "#1D9E75", steel: "#8FA8B2", fg: "#E8F0F3",
};

type VesselData = {
  imo: string;
  age: number | null;
  scrapScore: number;
  particulars: {
    name: string; flag: string; type: string; builtYear: number;
    builtAt: string; dwt: number; grt: number; nrt: number; ldt: number;
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

function ScoreRing({ score }: { score: number }) {
  const color = score >= 70 ? "#E24B4A" : score >= 50 ? "#FB923C" : C.green;
  const r = 28, c = 32, circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64">
      <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(143,168,178,0.15)" strokeWidth="6" />
      <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth="6"
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
      <span style={{ fontSize: 12, color: C.steel }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: highlight ? C.green : C.fg, fontFamily: mono ? "monospace" : "inherit" }}>
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

export default function VesselPanel({ imo, onClose }: { imo: string; onClose: () => void }) {
  const [data, setData] = useState<VesselData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState(false);
  const [crmAdded, setCrmAdded]     = useState(false);
  const [watching, setWatching]     = useState(false);

  useEffect(() => {
    console.log("[VesselPanel] Fetching /api/owner/" + imo);
    fetch(`/api/owner/${imo}`)
      .then(r => r.json())
      .then(d => {
        console.log("[VesselPanel] Response:", d);
        if (d.error) { setError(`API error: ${d.error}`); setLoading(false); return; }
        setData(d);
        setLoading(false);
      })
      .catch(e => { console.error("[VesselPanel] Fetch failed:", e); setError("Network error"); setLoading(false); });
  }, [imo]);

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
            {loading ? "Yükleniyor..." : data?.particulars?.name || `IMO ${imo}`}
          </div>
          <div style={{ fontSize: 11, color: C.steel, marginTop: 2 }}>IMO {imo}</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.steel, fontSize: 20, cursor: "pointer", padding: "4px 8px" }}>×</button>
      </div>

      {loading && (
        <div style={{ padding: 40, textAlign: "center", color: C.steel, fontSize: 13 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⚓</div>
          Datalastic&apos;ten veri çekiliyor...
        </div>
      )}

      {error && (
        <div style={{ padding: 20, color: "#F87171", fontSize: 13, textAlign: "center" }}>{error}</div>
      )}

      {data && !loading && (
        <div style={{ padding: 20 }}>

          {/* Scrap Score + Özet */}
          <div style={{ background: C.navy, borderRadius: 12, padding: 16, marginBottom: 20, display: "flex", alignItems: "center", gap: 16 }}>
            <ScoreRing score={data.scrapScore} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: C.steel, marginBottom: 4 }}>SCRAP SCORE</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: data.scrapScore >= 70 ? "#E24B4A" : data.scrapScore >= 50 ? "#FB923C" : C.green }}>
                {data.scrapScore >= 70 ? "Yüksek Öncelik" : data.scrapScore >= 50 ? "Takibe Al" : "Düşük Risk"}
              </div>
              <div style={{ fontSize: 11, color: C.steel, marginTop: 2 }}>
                {data.age ? `${data.age} yaşında` : ""} · {data.detentions.length} detention
              </div>
            </div>
            {data.scrapScore >= 50 && (
              <div style={{ fontSize: 24 }}>
                {data.scrapScore >= 70 ? "🔴" : "🟡"}
              </div>
            )}
          </div>

          {/* Ship Particulars */}
          <Section title="Ship Particulars">
            <Row label="Gemi Adı"    value={data.particulars.name} />
            <Row label="Bayrak"      value={data.particulars.flag} />
            <Row label="Tip"         value={data.particulars.type} />
            <Row label="İnşa Yılı"   value={data.particulars.builtYear} />
            <Row label="İnşa Yeri"   value={data.particulars.builtAt} />
            <Row label="DWT"         value={data.particulars.dwt ? `${data.particulars.dwt.toLocaleString()} t` : null} highlight />
            <Row label="LDT"         value={data.particulars.ldt ? `${data.particulars.ldt.toLocaleString()} t` : null} highlight />
            <Row label="GRT"         value={data.particulars.grt ? `${data.particulars.grt.toLocaleString()} t` : null} />
            <Row label="LOA"         value={data.particulars.loa ? `${data.particulars.loa} m` : null} />
            <Row label="Beam"        value={data.particulars.beam ? `${data.particulars.beam} m` : null} />
            <Row label="Draft"       value={data.particulars.draft ? `${data.particulars.draft} m` : null} />
            <Row label="Call Sign"   value={data.particulars.callSign} mono />
            <Row label="MMSI"        value={data.particulars.mmsi} mono />
            <Row label="Class"       value={data.particulars.classSociety} />
            <Row label="Durum"       value={data.particulars.status} />
          </Section>

          {/* Tahmini Scrap Değeri */}
          {data.particulars.ldt && (
            <Section title="Tahmini Scrap Değeri">
              {[
                { market: "Alang 🇮🇳",      price: 510 },
                { market: "Chittagong 🇧🇩", price: 560 },
                { market: "Gadani 🇵🇰",     price: 500 },
                { market: "Aliağa 🇹🇷",     price: 420 },
              ].map(({ market, price }) => (
                <div key={market} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid rgba(143,168,178,0.08)" }}>
                  <span style={{ fontSize: 12, color: C.steel }}>{market}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>
                    ${((data.particulars.ldt * price) / 1000000).toFixed(2)}M
                    <span style={{ fontWeight: 400, color: C.steel, marginLeft: 4 }}>@${price}/LDT</span>
                  </span>
                </div>
              ))}
            </Section>
          )}

          {/* Survey / Dry Dock */}
          <Section title="Survey & Dry Dock">
            <Row label="Son Dry Dock"  value={data.surveys.lastDryDock} />
            <Row label="Sonraki DD"    value={data.surveys.nextDryDock} highlight />
            <Row label="Class Expiry"  value={data.surveys.classExpiry} />
          </Section>

          {/* PSC Detentions */}
          {data.detentions.length > 0 && (
            <Section title={`PSC Detentions (${data.detentions.length})`}>
              {data.detentions.slice(0, 5).map((d: any, i: number) => (
                <div key={i} style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 8, padding: "8px 12px", marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#F87171" }}>{d.port} · {d.date}</div>
                  <div style={{ fontSize: 11, color: C.steel, marginTop: 2 }}>{d.authority} · {d.deficiencies} eksiklik</div>
                </div>
              ))}
            </Section>
          )}

          {/* Sahip Bilgisi */}
          {data.owner?.name && (
            <Section title="Sahip Bilgisi">
              <Row label="Sahip"        value={data.owner.name} highlight />
              <Row label="Email"        value={data.owner.email} mono />
              <Row label="Telefon"      value={data.owner.phone} mono />
              <Row label="Adres"        value={data.owner.address} />
              <Row label="Ülke"         value={data.owner.country} />
              <Row label="Manager"      value={data.owner.managerName} />
              <Row label="Mgr. Email"   value={data.owner.managerEmail} mono />
            </Section>
          )}

          {/* Action Buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {data.owner?.email && (
              <button
                onClick={() => setEmailDraft(true)}
                style={{ background: C.green, border: "none", borderRadius: 10, padding: "12px 20px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "Inter, sans-serif" }}
              >
                ✉️ Teklif Emaili Yaz
              </button>
            )}
            <button
              onClick={async () => {
                try {
                  const res = await fetch("/api/crm/add", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      imo: data.imo,
                      name: data.particulars?.name,
                      score: data.scrapScore,
                      status: "new",
                      stage: "lead",
                      addedAt: new Date().toISOString(),
                    }),
                  });
                  if (res.ok) setCrmAdded(true);
                } catch {
                  setCrmAdded(true);
                }
              }}
              style={{ background: crmAdded ? "#1D9E75" : "rgba(108,184,230,0.08)", border: `1px solid ${crmAdded ? "#1D9E75" : "rgba(108,184,230,0.2)"}`, borderRadius: 10, padding: "12px 20px", color: crmAdded ? "#fff" : "#6CB8E6", fontSize: 13, fontWeight: 600, cursor: crmAdded ? "default" : "pointer", fontFamily: "Inter, sans-serif" }}
            >
              {crmAdded ? "✓ CRM'e Eklendi" : "📋 CRM'e Ekle"}
            </button>
            <button
              onClick={async () => {
                try {
                  const res = await fetch("/api/watch", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      imo: data.imo,
                      name: data.particulars?.name,
                      source: "manual",
                    }),
                  });
                  if (res.ok) setWatching(true);
                } catch {
                  setWatching(true);
                }
              }}
              style={{ background: watching ? "#1D9E75" : "rgba(143,168,178,0.06)", border: `1px solid ${watching ? "#1D9E75" : "rgba(143,168,178,0.15)"}`, borderRadius: 10, padding: "12px 20px", color: watching ? "#fff" : C.steel, fontSize: 13, fontWeight: 600, cursor: watching ? "default" : "pointer", fontFamily: "Inter, sans-serif" }}
            >
              {watching ? "✓ İzleniyor" : "👁 İzlemeye Al"}
            </button>
          </div>

          {/* Email Draft */}
          {emailDraft && data.owner?.email && (
            <div style={{ marginTop: 20, background: C.navy, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.steel, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Email Draft</div>
              <textarea
                defaultValue={`Dear ${data.owner.name},\n\nWe are interested in acquiring MV ${data.particulars.name} (IMO ${imo}) for recycling purposes.\n\nBased on our assessment, we can offer competitive terms for immediate demolition sale. Our team is ready to discuss further at your earliest convenience.\n\nBest regards,\nShipScout Team`}
                style={{ width: "100%", background: "rgba(143,168,178,0.06)", border: "1px solid rgba(143,168,178,0.15)", borderRadius: 8, padding: 12, color: C.fg, fontSize: 12, lineHeight: 1.6, fontFamily: "Inter, sans-serif", resize: "vertical", minHeight: 180, boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button style={{ flex: 1, background: C.green, border: "none", borderRadius: 8, padding: "10px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
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
