"use client";
import Link from "next/link";

const NAVY = "#07122E";
const GOLD = "#C9A84C";
const GREEN = "#0D6E54";

const STATIC_STATS = [
  { value: "81,000+", label: "Vessels tracked" },
  { value: "$420", label: "Aliağa $/LDT" },
  { value: "1,843+", label: "Radar events" },
  { value: "Weekly", label: "Intelligence digest" },
];

const EVENT_TYPES = [
  { key: "detention",      label: "Detention",    color: "#92400E", bg: "#FFF7ED", border: "#FED7AA" },
  { key: "arrest",         label: "Arrest",       color: "#991B1B", bg: "#FEF2F2", border: "#FECACA" },
  { key: "judicial_auction", label: "Auction",    color: "#78350F", bg: "#FFFBEB", border: "#FDE68A" },
  { key: "sanction",       label: "Sanction",     color: "#4C1D95", bg: "#F5F3FF", border: "#DDD6FE" },
  { key: "layup",          label: "Layup",        color: "#1E3A5F", bg: "#EFF6FF", border: "#BFDBFE" },
];

const HOW_BUYER = [
  { n: "01", title: "Access the radar", body: "Browse live distressed vessel signals — detentions, layups, arrests, auctions — filtered by type, age, and proximity to scrap yards." },
  { n: "02", title: "Read weekly intelligence", body: "Every Monday: a curated digest of the week's highest-signal events with editorial context and vessel data." },
  { n: "03", title: "Find the owner", body: "Click any vessel to see owner chain, manager contacts, emails, and LinkedIn — sourced from Equasis and verified." },
  { n: "04", title: "Move first", body: "With early signals from AIS, PSC, and court records, you reach distressed owners before competitors do." },
];

const TRUST = [
  { icon: "📡", title: "Live AIS + PSC data", body: "81,000+ vessels updated in real time. Paris MOU detentions, OFAC sanctions, and layup detection from AIS position data." },
  { icon: "⚖", title: "Court & auction alerts", body: "UK Admiralty Marshal arrests, Singapore judicial sales, and bank seizure news — classified and matched to vessel records." },
  { icon: "📋", title: "Owner chain to contact", body: "Equasis owner → manager → ISM hierarchy with scraped emails, Hunter.io enrichment and SMTP verification." },
  { icon: "📰", title: "Weekly digest", body: "ShipScout Weekly: AI-written maritime intelligence report with lead story, vessel photos, and event breakdown — every Monday." },
];

export default function HomePage() {
  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", color: "#0F172A" }}>

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section style={{
        background: `linear-gradient(135deg, ${NAVY} 0%, #0d1f4a 100%)`,
        padding: "88px 24px 100px",
        textAlign: "center",
      }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", color: GOLD, textTransform: "uppercase", marginBottom: 20 }}>
          Maritime Distressed Intelligence
        </p>
        <h1 style={{ fontSize: "clamp(30px, 5.5vw, 56px)", fontWeight: 800, color: "#fff", lineHeight: 1.1, margin: "0 auto 20px", maxWidth: 760, letterSpacing: -1 }}>
          Distressed vessels.<br />
          <span style={{ color: GOLD }}>Before the market knows.</span>
        </h1>
        <p style={{ fontSize: 18, color: "rgba(255,255,255,0.65)", maxWidth: 540, margin: "0 auto 44px", lineHeight: 1.7 }}>
          AIS layup detection, PSC detentions, judicial auctions and sanctions —
          scrap candidates identified and owner contacts enriched before they hit the open market.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/opportunities" style={{
            background: GOLD, color: NAVY, padding: "15px 32px",
            borderRadius: 8, fontWeight: 700, fontSize: 16, textDecoration: "none",
          }}>
            See Opportunities →
          </Link>
          <Link href="/shipowners" style={{
            background: "rgba(255,255,255,0.08)", color: "#fff",
            border: "1px solid rgba(255,255,255,0.22)",
            padding: "15px 32px", borderRadius: 8, fontWeight: 600,
            fontSize: 16, textDecoration: "none",
          }}>
            Submit a Vessel
          </Link>
        </div>
        <p style={{ marginTop: 20, fontSize: 13, color: "rgba(255,255,255,0.3)" }}>
          Updated daily · Paris MOU · OFAC · AIS · Equasis
        </p>
      </section>

      {/* ── STATS ────────────────────────────────────────────────────────────── */}
      <section style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0", padding: "28px 24px" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 20 }}>
          {STATIC_STATS.map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: NAVY }}>{s.value}</div>
              <div style={{ fontSize: 13, color: "#64748B", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── SIGNAL TYPES ─────────────────────────────────────────────────────── */}
      <section style={{ background: "#fff", padding: "72px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <p style={{ textAlign: "center", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: GOLD, textTransform: "uppercase", marginBottom: 12 }}>
            What We Track
          </p>
          <h2 style={{ textAlign: "center", fontSize: 30, fontWeight: 700, color: NAVY, margin: "0 0 48px" }}>
            Five distress signals. One dashboard.
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14 }}>
            {EVENT_TYPES.map(e => (
              <div key={e.key} style={{
                background: e.bg, border: `1px solid ${e.border}`,
                borderRadius: 10, padding: "18px 16px", textAlign: "center",
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: e.color, marginBottom: 6 }}>{e.label}</div>
                <div style={{ fontSize: 11, color: e.color, opacity: 0.7 }}>
                  {{
                    detention: "Paris MOU / THETIS",
                    arrest: "Port authority seizure",
                    judicial_auction: "Court-ordered sale",
                    sanction: "OFAC SDN list",
                    layup: "AIS idle >30 days",
                  }[e.key]}
                </div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 32 }}>
            <Link href="/opportunities" style={{
              display: "inline-block",
              background: NAVY, color: "#fff",
              padding: "12px 28px", borderRadius: 8,
              fontSize: 14, fontWeight: 600, textDecoration: "none",
            }}>
              Open Opportunity Radar →
            </Link>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS FOR BUYERS ──────────────────────────────────────────── */}
      <section style={{ background: "#F8FAFC", padding: "72px 24px", borderTop: "1px solid #E2E8F0" }}>
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
          <p style={{ textAlign: "center", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: GREEN, textTransform: "uppercase", marginBottom: 12 }}>
            For Cash Buyers & Recycling Yards
          </p>
          <h2 style={{ textAlign: "center", fontSize: 28, fontWeight: 700, color: NAVY, margin: "0 0 48px" }}>
            Find distressed tonnage before your competition.
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
            {HOW_BUYER.map(s => (
              <div key={s.n} style={{ display: "flex", gap: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, minWidth: 28, paddingTop: 1 }}>{s.n}</div>
                <div>
                  <div style={{ fontWeight: 600, color: "#0F172A", marginBottom: 4 }}>{s.title}</div>
                  <div style={{ fontSize: 14, color: "#64748B", lineHeight: 1.6 }}>{s.body}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 44 }}>
            <Link href="/opportunities" style={{
              display: "inline-block",
              background: GREEN, color: "#fff",
              padding: "13px 28px", borderRadius: 8,
              fontSize: 15, fontWeight: 700, textDecoration: "none",
            }}>
              Open the Radar →
            </Link>
          </div>
        </div>
      </section>

      {/* ── WEEKLY INTEL PREVIEW ─────────────────────────────────────────────── */}
      <section style={{ background: NAVY, padding: "72px 24px" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", textAlign: "center" }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", color: GOLD, textTransform: "uppercase", marginBottom: 12 }}>
            ShipScout Weekly
          </p>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: "#fff", margin: "0 0 14px" }}>
            Maritime intelligence. Every Monday.
          </h2>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.55)", margin: "0 0 36px", lineHeight: 1.7 }}>
            Arrests, detentions, sanctions, and auctions — curated, classified, and matched
            to vessel records. AI-written lead story with vessel data and owner context.
          </p>
          <Link href="/weekly" style={{
            display: "inline-block",
            background: GOLD, color: NAVY,
            padding: "13px 28px", borderRadius: 8,
            fontSize: 15, fontWeight: 700, textDecoration: "none",
          }}>
            Read Latest Issue →
          </Link>
        </div>
      </section>

      {/* ── DATA SOURCES ─────────────────────────────────────────────────────── */}
      <section style={{ background: "#fff", padding: "72px 24px", borderTop: "1px solid #E2E8F0" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <p style={{ textAlign: "center", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: "#64748B", textTransform: "uppercase", marginBottom: 12 }}>
            Why ShipScout
          </p>
          <h2 style={{ textAlign: "center", fontSize: 26, fontWeight: 700, color: NAVY, margin: "0 0 44px" }}>
            Proprietary data. Actionable intelligence.
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {TRUST.map(t => (
              <div key={t.title} style={{
                border: "1px solid #E2E8F0", borderRadius: 12, padding: "22px",
              }}>
                <div style={{ fontSize: 22, marginBottom: 10 }}>{t.icon}</div>
                <div style={{ fontWeight: 600, color: NAVY, marginBottom: 6 }}>{t.title}</div>
                <div style={{ fontSize: 14, color: "#64748B", lineHeight: 1.65 }}>{t.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SHIPOWNER CTA ─────────────────────────────────────────────────────── */}
      <section style={{ background: "#F8FAFC", padding: "64px 24px", textAlign: "center", borderTop: "1px solid #E2E8F0" }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: "#64748B", textTransform: "uppercase", marginBottom: 12 }}>
          For Shipowners
        </p>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: NAVY, margin: "0 0 10px" }}>
          Considering recycling or a sale?
        </h2>
        <p style={{ fontSize: 15, color: "#64748B", margin: "0 0 28px" }}>
          Get a free indicative value estimate. Confidential — no listing, no obligation.
        </p>
        <Link href="/shipowners" style={{
          display: "inline-block",
          background: NAVY, color: "#fff",
          padding: "13px 28px", borderRadius: 8,
          fontWeight: 700, fontSize: 15, textDecoration: "none",
        }}>
          Estimate my vessel →
        </Link>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────────── */}
      <footer style={{ background: NAVY, borderTop: "1px solid rgba(255,255,255,0.08)", padding: "28px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#fff", letterSpacing: -0.3 }}>
            Ship<span style={{ color: GOLD }}>Scout</span>
          </span>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {([
              ["Opportunities", "/opportunities"],
              ["Weekly", "/weekly"],
              ["Vessels", "/vessels"],
              ["Shipowners", "/shipowners"],
              ["Contact", "mailto:hello@shipscout.io"],
            ] as [string, string][]).map(([label, href]) => (
              <Link key={label} href={href} style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", textDecoration: "none" }}>
                {label}
              </Link>
            ))}
          </div>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>© 2026 ShipScout</span>
        </div>
      </footer>

    </div>
  );
}
