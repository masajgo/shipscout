"use client";
import Link from "next/link";

const NAVY = "#07122E";
const GOLD = "#C9A84C";
const GREEN = "#0D6E54";
const SERIF = "var(--font-serif), Georgia, serif";

const STATS = [
  { value: "81,000+", label: "Vessels tracked" },
  { value: "1,843+",  label: "Radar events" },
  { value: "$420",    label: "Aliağa $/LDT" },
  { value: "Weekly",  label: "Intelligence digest" },
];

const HOW_IT_WORKS = [
  {
    n: "01", icon: "📡",
    title: "We detect the signal",
    body: "AIS idle detection, Paris MOU detentions, court arrests, OFAC sanctions — picked up within hours of the event, before public announcement.",
  },
  {
    n: "02", icon: "🔍",
    title: "We find the owner",
    body: "Equasis ownership chain traced to ISM manager level. Emails enriched via Hunter.io and SMTP-verified — ready to contact.",
  },
  {
    n: "03", icon: "⚡",
    title: "You move first",
    body: "Access the live radar, read Monday's intelligence digest, contact the owner directly — before the vessel reaches the open market.",
  },
];

const EVENT_TYPES = [
  { key: "detention",        label: "Detention",       sub: "Paris MOU / THETIS",   color: "#92400E", bg: "#FFF7ED", border: "#FED7AA" },
  { key: "arrest",           label: "Arrest",          sub: "Court & bank seizure", color: "#991B1B", bg: "#FEF2F2", border: "#FECACA" },
  { key: "judicial_auction", label: "Auction",         sub: "Court-ordered sale",   color: "#78350F", bg: "#FFFBEB", border: "#FDE68A" },
  { key: "sanction",         label: "Sanction",        sub: "OFAC SDN list",        color: "#4C1D95", bg: "#F5F3FF", border: "#DDD6FE" },
  { key: "layup",            label: "Layup",           sub: "AIS idle >30 days",    color: "#1E3A5F", bg: "#EFF6FF", border: "#BFDBFE" },
];

const BUYER_STEPS = [
  { n: "01", title: "Access the radar",        body: "Browse 1,843+ distressed vessel signals filtered by type, age, flag, and proximity to scrap yards." },
  { n: "02", title: "Read the weekly brief",   body: "Every Monday: curated digest of the week's highest-signal events with editorial context and vessel photos." },
  { n: "03", title: "Get the owner's contact", body: "Click any vessel for the full ownership chain, manager email, and LinkedIn — sourced from Equasis." },
  { n: "04", title: "Move before the market",  body: "AIS, PSC, and court data means you reach distressed owners days before they list anywhere." },
];

const DATA_SOURCES = ["Paris MOU / THETIS", "Equasis", "OFAC SDN", "UK Admiralty Court", "AIS Stream", "Lloyd's MIU"];

export default function HomePage() {
  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", color: "#0F172A" }}>

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section style={{
        backgroundImage: `linear-gradient(to bottom, rgba(7,18,46,0.82) 0%, rgba(7,18,46,0.72) 55%, rgba(7,18,46,0.92) 100%), url(/hero-ship.jpg)`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        padding: "100px 24px 88px",
        minHeight: "82vh",
        display: "flex",
        alignItems: "center",
      }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", width: "100%" }}>

          {/* Live badge */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 44 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.32)",
              borderRadius: 20, padding: "7px 18px",
              fontSize: 12, fontWeight: 600, color: GOLD, letterSpacing: "0.06em",
            }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: GOLD, display: "inline-block" }} />
              Live · 1,843 active distress signals
            </span>
          </div>

          {/* Main headline */}
          <h1 style={{
            fontFamily: SERIF,
            fontSize: "clamp(38px, 5.8vw, 70px)",
            fontWeight: 700,
            color: "#fff",
            lineHeight: 1.07,
            textAlign: "center",
            margin: "0 auto 24px",
            maxWidth: 840,
            fontStyle: "italic",
            letterSpacing: -1.5,
          }}>
            Find distressed vessels<br />
            <span style={{ color: GOLD, fontStyle: "normal" }}>before your competition does.</span>
          </h1>

          {/* Sub */}
          <p style={{
            fontSize: "clamp(15px, 1.8vw, 18px)",
            color: "rgba(255,255,255,0.62)",
            textAlign: "center",
            maxWidth: 580,
            margin: "0 auto 60px",
            lineHeight: 1.8,
          }}>
            We monitor 81,000+ vessels for PSC detentions, court arrests, layups, and sanctions —
            and deliver verified owner contacts to cash buyers and recycling yards worldwide.
          </p>

          {/* Two audience cards */}
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center" }}>

            <div style={{
              flex: "1 1 280px", maxWidth: 380,
              background: "rgba(10,20,50,0.65)",
              backdropFilter: "blur(16px)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderTop: `3px solid ${GOLD}`,
              borderRadius: 12, padding: "28px 28px 26px",
            }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: GOLD, textTransform: "uppercase", marginBottom: 12 }}>
                For Cash Buyers & Recycling Yards
              </p>
              <p style={{ fontSize: 15, color: "rgba(255,255,255,0.68)", lineHeight: 1.7, marginBottom: 24 }}>
                Access the live distressed vessel radar with owner contacts,
                PSC history, and weekly intelligence briefings.
              </p>
              <Link href="/opportunities" style={{
                display: "block", textAlign: "center",
                background: GOLD, color: NAVY,
                padding: "13px 20px", borderRadius: 8,
                fontWeight: 700, fontSize: 14, textDecoration: "none",
              }}>
                See Live Opportunities →
              </Link>
            </div>

            <div style={{
              flex: "1 1 280px", maxWidth: 380,
              background: "rgba(10,20,50,0.65)",
              backdropFilter: "blur(16px)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderTop: `3px solid ${GREEN}`,
              borderRadius: 12, padding: "28px 28px 26px",
            }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: "#4ade80", textTransform: "uppercase", marginBottom: 12 }}>
                For Shipowners
              </p>
              <p style={{ fontSize: 15, color: "rgba(255,255,255,0.68)", lineHeight: 1.7, marginBottom: 24 }}>
                Get a free indicative estimate based on live Aliağa prices.
                Confidential — no public listing, no obligation.
              </p>
              <Link href="/shipowners" style={{
                display: "block", textAlign: "center",
                background: "rgba(255,255,255,0.1)", color: "#fff",
                border: "1px solid rgba(255,255,255,0.25)",
                padding: "13px 20px", borderRadius: 8,
                fontWeight: 700, fontSize: 14, textDecoration: "none",
              }}>
                Estimate my vessel →
              </Link>
            </div>

          </div>

          <p style={{ textAlign: "center", marginTop: 28, fontSize: 12, color: "rgba(255,255,255,0.25)" }}>
            🔒 Confidential · Paris MOU · Equasis · OFAC · UK Admiralty Court · AIS Stream
          </p>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────────── */}
      <section style={{ background: "#fff", padding: "88px 24px", borderBottom: "1px solid #E2E8F0" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <p style={{ textAlign: "center", fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", color: GOLD, textTransform: "uppercase", marginBottom: 14 }}>
            How It Works
          </p>
          <h2 style={{ fontFamily: SERIF, textAlign: "center", fontSize: "clamp(26px, 3.2vw, 40px)", fontWeight: 700, color: NAVY, margin: "0 0 64px", fontStyle: "italic" }}>
            From signal to contact in hours, not weeks.
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 48, position: "relative" }}>
            {HOW_IT_WORKS.map((s, i) => (
              <div key={s.n} style={{ textAlign: "center", position: "relative" }}>
                {i < 2 && (
                  <div style={{
                    position: "absolute", top: 31, left: "calc(50% + 44px)",
                    width: "calc(100% - 44px)", height: 1,
                    background: "#E2E8F0",
                  }} />
                )}
                <div style={{
                  width: 64, height: 64, borderRadius: "50%",
                  background: "#F8FAFC", border: "2px solid #E2E8F0",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 20px", fontSize: 26, position: "relative", zIndex: 1,
                }}>
                  {s.icon}
                </div>
                <div style={{ fontFamily: SERIF, fontSize: 12, fontWeight: 700, color: GOLD, letterSpacing: "0.1em", marginBottom: 10 }}>
                  {s.n}
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: NAVY, marginBottom: 10 }}>{s.title}</h3>
                <p style={{ fontSize: 14, color: "#64748B", lineHeight: 1.7 }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS ────────────────────────────────────────────────────────────── */}
      <section style={{ background: NAVY, padding: "60px 24px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
          {STATS.map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: SERIF, fontSize: "clamp(38px, 4vw, 56px)", fontWeight: 700, color: GOLD, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 10, letterSpacing: "0.04em" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── AUTHORITY STRIP ──────────────────────────────────────────────────── */}
      <section style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0", padding: "16px 24px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap", justifyContent: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#94A3B8", textTransform: "uppercase", whiteSpace: "nowrap" }}>
            Data sourced from
          </span>
          {DATA_SOURCES.map((s, i) => (
            <span key={s} style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>{s}</span>
              {i < DATA_SOURCES.length - 1 && (
                <span style={{ width: 3, height: 3, borderRadius: "50%", background: "#CBD5E1", display: "inline-block" }} />
              )}
            </span>
          ))}
        </div>
      </section>

      {/* ── SIGNAL TYPES ─────────────────────────────────────────────────────── */}
      <section style={{ background: "#fff", padding: "80px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <p style={{ textAlign: "center", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: GOLD, textTransform: "uppercase", marginBottom: 14 }}>
            Signal Types
          </p>
          <h2 style={{ fontFamily: SERIF, textAlign: "center", fontSize: "clamp(26px, 3vw, 38px)", fontWeight: 700, color: NAVY, margin: "0 0 52px", fontStyle: "italic" }}>
            Five distress signals. One dashboard.
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(168px, 1fr))", gap: 14 }}>
            {EVENT_TYPES.map(e => (
              <div key={e.key} style={{
                background: e.bg, border: `1px solid ${e.border}`,
                borderRadius: 12, padding: "20px 18px",
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: e.color, marginBottom: 6 }}>{e.label}</div>
                <div style={{ fontSize: 12, color: e.color, opacity: 0.75, lineHeight: 1.5 }}>{e.sub}</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 36 }}>
            <Link href="/opportunities" style={{
              display: "inline-block", background: NAVY, color: "#fff",
              padding: "13px 28px", borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: "none",
            }}>
              Open Opportunity Radar →
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOR BUYERS ───────────────────────────────────────────────────────── */}
      <section style={{ background: NAVY, padding: "88px 24px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <p style={{ textAlign: "center", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: GOLD, textTransform: "uppercase", marginBottom: 14 }}>
            For Cash Buyers & Recycling Yards
          </p>
          <h2 style={{ fontFamily: SERIF, textAlign: "center", fontSize: "clamp(26px, 3.2vw, 40px)", fontWeight: 700, color: "#fff", margin: "0 0 52px", fontStyle: "italic" }}>
            Reach distressed owners before your competition.
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 48 }}>
            {BUYER_STEPS.map(s => (
              <div key={s.n} style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12, padding: "24px",
                display: "flex", gap: 16,
              }}>
                <div style={{ fontFamily: SERIF, fontSize: 13, fontWeight: 700, color: GOLD, minWidth: 28, paddingTop: 2 }}>{s.n}</div>
                <div>
                  <div style={{ fontWeight: 600, color: "#fff", marginBottom: 6 }}>{s.title}</div>
                  <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.65 }}>{s.body}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center" }}>
            <Link href="/opportunities" style={{
              display: "inline-block", background: GOLD, color: NAVY,
              padding: "14px 32px", borderRadius: 8, fontSize: 15, fontWeight: 700, textDecoration: "none",
            }}>
              See Live Opportunities →
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOR SELLERS ──────────────────────────────────────────────────────── */}
      <section style={{ background: "#F0FDF4", padding: "88px 24px", borderTop: "4px solid #BBF7D0" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", gap: 64, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: "1 1 300px" }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: GREEN, textTransform: "uppercase", marginBottom: 14 }}>
              For Shipowners
            </p>
            <h2 style={{ fontFamily: SERIF, fontSize: "clamp(26px, 3.2vw, 40px)", fontWeight: 700, color: NAVY, margin: "0 0 20px", fontStyle: "italic", lineHeight: 1.15 }}>
              Sell confidentially.<br />Get real value.
            </h2>
            <p style={{ fontSize: 15, color: "#475569", lineHeight: 1.8, marginBottom: 32 }}>
              Enter your IMO and get a free indicative estimate based on current Aliağa
              benchmark prices — in under a minute. No public listing, no obligation.
            </p>
            <Link href="/shipowners" style={{
              display: "inline-block", background: GREEN, color: "#fff",
              padding: "14px 28px", borderRadius: 8, fontSize: 15, fontWeight: 700, textDecoration: "none",
            }}>
              Estimate my vessel →
            </Link>
          </div>
          <div style={{ flex: "1 1 260px" }}>
            {[
              { icon: "🔒", title: "Confidential by design",   body: "No public listing is ever created. Your vessel and identity stay private throughout." },
              { icon: "📊", title: "Real market pricing",      body: "Estimates based on live Aliağa $/LDT benchmarks, not guesswork." },
              { icon: "🇹🇷", title: "Verified buyers in Turkey", body: "Active recycling yards in Aliağa ready to move on the right vessel." },
              { icon: "📋", title: "No obligation",            body: "Estimate, submit details, review offers — only proceed when you're ready." },
            ].map(item => (
              <div key={item.title} style={{ display: "flex", gap: 14, marginBottom: 24 }}>
                <span style={{ fontSize: 20, minWidth: 28, paddingTop: 2 }}>{item.icon}</span>
                <div>
                  <div style={{ fontWeight: 600, color: NAVY, marginBottom: 4 }}>{item.title}</div>
                  <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.6 }}>{item.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WEEKLY INTEL ─────────────────────────────────────────────────────── */}
      <section style={{ background: "#fff", padding: "80px 24px", borderTop: "1px solid #E2E8F0" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", color: GOLD, textTransform: "uppercase", marginBottom: 14 }}>
            ShipScout Weekly
          </p>
          <h2 style={{ fontFamily: SERIF, fontSize: "clamp(26px, 3vw, 38px)", fontWeight: 700, color: NAVY, margin: "0 0 16px", fontStyle: "italic" }}>
            Maritime intelligence. Every Monday.
          </h2>
          <p style={{ fontSize: 15, color: "#64748B", margin: "0 0 36px", lineHeight: 1.8 }}>
            Arrests, detentions, sanctions, and auctions — curated, classified, and matched
            to vessel records. AI-written lead story with vessel data and owner context.
          </p>
          <Link href="/weekly" style={{
            display: "inline-block", background: NAVY, color: "#fff",
            padding: "13px 28px", borderRadius: 8, fontSize: 15, fontWeight: 700, textDecoration: "none",
          }}>
            Read Latest Issue →
          </Link>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────────── */}
      <section style={{
        backgroundImage: `linear-gradient(135deg, rgba(7,18,46,0.95) 0%, rgba(13,31,74,0.95) 100%), url(/hero-ship.jpg)`,
        backgroundSize: "cover", backgroundPosition: "center",
        padding: "96px 24px", textAlign: "center",
      }}>
        <h2 style={{ fontFamily: SERIF, fontSize: "clamp(28px, 3.8vw, 48px)", fontWeight: 700, color: "#fff", margin: "0 0 16px", fontStyle: "italic" }}>
          Ready to move before the market?
        </h2>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.5)", maxWidth: 460, margin: "0 auto 44px", lineHeight: 1.75 }}>
          Whether you're buying or selling, ShipScout gives you the intelligence edge.
        </p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/opportunities" style={{
            display: "inline-block", background: GOLD, color: NAVY,
            padding: "15px 32px", borderRadius: 8, fontWeight: 700, fontSize: 16, textDecoration: "none",
          }}>
            See Opportunities →
          </Link>
          <Link href="/shipowners" style={{
            display: "inline-block", background: "rgba(255,255,255,0.09)", color: "#fff",
            border: "1px solid rgba(255,255,255,0.22)",
            padding: "15px 32px", borderRadius: 8, fontWeight: 700, fontSize: 16, textDecoration: "none",
          }}>
            Estimate my vessel →
          </Link>
        </div>
        <p style={{ marginTop: 28, fontSize: 12, color: "rgba(255,255,255,0.22)" }}>
          🔒 Confidential · No obligation · Updated daily
        </p>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
      <footer style={{ background: NAVY, borderTop: "1px solid rgba(255,255,255,0.08)", padding: "32px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <span style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 700, color: "#fff" }}>
            Ship<span style={{ color: GOLD }}>Scout</span>
          </span>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {([
              ["Opportunities", "/opportunities"],
              ["Weekly",        "/weekly"],
              ["Vessels",       "/vessels"],
              ["Shipowners",    "/shipowners"],
              ["Contact",       "mailto:info@turqomarine.com"],
            ] as [string, string][]).map(([label, href]) => (
              <Link key={label} href={href} style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>
                {label}
              </Link>
            ))}
          </div>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.22)" }}>© 2026 ShipScout</span>
        </div>
      </footer>

    </div>
  );
}
