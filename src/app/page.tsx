"use client";
import Link from "next/link";

const NAVY = "#07122E";
const GOLD = "#C9A84C";
const GREEN = "#0D6E54";
const SERIF = "var(--font-serif), Georgia, serif";

const SIGNAL_TABLE = [
  { label: "Detention",         source: "Paris MOU / THETIS",  count: 847 },
  { label: "Arrest",            source: "Admiralty Court",      count: 312 },
  { label: "Judicial Auction",  source: "Court-ordered sale",   count: 94  },
  { label: "Sanction",          source: "OFAC SDN list",        count: 186 },
  { label: "Layup",             source: "AIS idle >30 days",    count: 404 },
];

const DATA_SOURCES = [
  "Paris MOU / THETIS", "Equasis", "OFAC SDN",
  "UK Admiralty Court", "AIS Stream", "Lloyd's MIU",
];

const RADAR_PREVIEW = [
  { flag: "PA", name: "MV OCEAN PIONEER", imo: "9234567", type: "Bulk Carrier",   signal: "DETENTION", signalColor: "#FED7AA", signalBg: "rgba(146,64,14,0.35)",  score: 847, days: 14 },
  { flag: "MH", name: "MT SILVER STRAIT",  imo: "9456789", type: "Tanker",         signal: "ARREST",    signalColor: "#FECACA", signalBg: "rgba(153,27,27,0.35)",  score: 923, days: 3  },
  { flag: "CY", name: "MV EASTERN WIND",   imo: "9123456", type: "General Cargo",  signal: "LAYUP",     signalColor: "#BFDBFE", signalBg: "rgba(30,58,95,0.35)",   score: 612, days: 47 },
];

export default function HomePage() {
  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", color: "#0F172A" }}>

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section style={{
        backgroundImage: `linear-gradient(to right, rgba(7,18,46,0.95) 0%, rgba(7,18,46,0.95) 52%, rgba(7,18,46,0.28) 100%), url(/hero-ship.jpg)`,
        backgroundSize: "cover",
        backgroundPosition: "center right",
        minHeight: "86vh",
        display: "flex",
        alignItems: "center",
        padding: "100px 24px",
      }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", width: "100%" }}>
          <div style={{ maxWidth: 560 }}>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 44 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: GOLD, flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(201,168,76,0.8)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                Live · 1,843 active distress signals
              </span>
            </div>

            <h1 style={{
              fontFamily: SERIF,
              fontSize: "clamp(40px, 5.5vw, 68px)",
              fontWeight: 700,
              color: "#fff",
              lineHeight: 1.06,
              margin: "0 0 20px",
              fontStyle: "italic",
              letterSpacing: -1.5,
            }}>
              Maritime intelligence.<br />
              <span style={{ color: GOLD }}>Before anyone else.</span>
            </h1>

            <p style={{
              fontSize: 14,
              fontWeight: 500,
              color: "rgba(255,255,255,0.38)",
              margin: "0 0 28px",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}>
              Buy first. Sell on your terms.
            </p>

            <p style={{
              fontSize: 17,
              color: "rgba(255,255,255,0.55)",
              lineHeight: 1.8,
              marginBottom: 48,
              maxWidth: 460,
            }}>
              AI monitors 81,000+ vessels around the clock for PSC detentions, court arrests,
              layups, and sanctions — and delivers verified owner contacts to cash buyers
              and recycling yards before anyone else moves.
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
              <Link href="/opportunities" style={{
                display: "inline-block",
                background: GOLD, color: NAVY,
                padding: "15px 32px", borderRadius: 8,
                fontWeight: 700, fontSize: 15, textDecoration: "none",
              }}>
                Access the Radar →
              </Link>
              <Link href="/shipowners" style={{
                fontSize: 14, color: "rgba(255,255,255,0.45)",
                textDecoration: "none",
                borderBottom: "1px solid rgba(255,255,255,0.18)",
                paddingBottom: 2,
              }}>
                I'm selling a vessel
              </Link>
            </div>

          </div>
        </div>
      </section>

      {/* ── AUDIENCE SPLIT ───────────────────────────────────────────────────── */}
      <section style={{ display: "flex", flexWrap: "wrap" }}>
        <div style={{
          flex: "1 1 300px", background: NAVY,
          padding: "60px 52px",
          borderRight: "1px solid rgba(255,255,255,0.05)",
        }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: GOLD, textTransform: "uppercase", marginBottom: 20 }}>
            For Cash Buyers & Recycling Yards
          </p>
          <p style={{ fontFamily: SERIF, fontSize: "clamp(19px, 2vw, 24px)", color: "#fff", lineHeight: 1.45, marginBottom: 28, fontStyle: "italic" }}>
            Reach distressed owners before anyone else — with verified contacts included.
          </p>
          <Link href="/opportunities" style={{
            display: "inline-block", background: GOLD, color: NAVY,
            padding: "11px 22px", borderRadius: 7,
            fontWeight: 700, fontSize: 14, textDecoration: "none",
          }}>
            See live opportunities →
          </Link>
        </div>

        <div style={{
          flex: "1 1 300px", background: "#071E14",
          padding: "60px 52px",
        }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: "#4ade80", textTransform: "uppercase", marginBottom: 20 }}>
            For Shipowners
          </p>
          <p style={{ fontFamily: SERIF, fontSize: "clamp(19px, 2vw, 24px)", color: "#fff", lineHeight: 1.45, marginBottom: 28, fontStyle: "italic" }}>
            Confidential. No public listing. A real indicative offer within 24 hours.
          </p>
          <Link href="/shipowners" style={{
            display: "inline-block",
            background: "rgba(255,255,255,0.08)", color: "#fff",
            border: "1px solid rgba(255,255,255,0.18)",
            padding: "11px 22px", borderRadius: 7,
            fontWeight: 700, fontSize: 14, textDecoration: "none",
          }}>
            Estimate my vessel →
          </Link>
        </div>
      </section>

      {/* ── PRODUCT PREVIEW ─────────────────────────────────────────────────── */}
      <section style={{ background: "#F8FAFC", padding: "80px 24px", borderTop: "1px solid #E2E8F0" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 40, flexWrap: "wrap", gap: 12 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: GOLD, textTransform: "uppercase", marginBottom: 10 }}>
                Live Radar
              </p>
              <h2 style={{ fontFamily: SERIF, fontSize: "clamp(20px, 2.5vw, 30px)", fontWeight: 700, color: NAVY, margin: 0, fontStyle: "italic" }}>
                This is what your competitors are missing.
              </h2>
            </div>
            <Link href="/opportunities" style={{ fontSize: 13, fontWeight: 600, color: NAVY, textDecoration: "none", borderBottom: `1px solid ${NAVY}`, paddingBottom: 1, whiteSpace: "nowrap" }}>
              See all signals →
            </Link>
          </div>

          {/* Dashboard mockup */}
          <div style={{
            background: "#0A1628",
            borderRadius: 10,
            overflow: "hidden",
            boxShadow: "0 32px 80px rgba(7,18,46,0.22)",
          }}>
            {/* Browser bar */}
            <div style={{
              background: "#07122E",
              padding: "11px 16px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              borderBottom: "1px solid rgba(255,255,255,0.05)",
            }}>
              <div style={{ display: "flex", gap: 6 }}>
                {["#FF5F57","#FFBD2E","#28C840"].map(c => (
                  <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />
                ))}
              </div>
              <div style={{
                flex: 1, background: "rgba(255,255,255,0.04)",
                borderRadius: 5, padding: "4px 12px",
                fontSize: 11, color: "rgba(255,255,255,0.25)", fontFamily: "monospace",
              }}>
                shipscout.io/opportunities
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: GOLD, display: "inline-block" }} />
                <span style={{ fontSize: 10, color: "rgba(201,168,76,0.7)", fontWeight: 600, letterSpacing: "0.08em" }}>LIVE</span>
              </div>
            </div>

            {/* Table header */}
            <div style={{
              display: "grid", gridTemplateColumns: "60px 1fr 130px 90px 80px",
              padding: "10px 24px",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
            }}>
              {["Flag", "Vessel", "Signal", "Score", "Age"].map(h => (
                <span key={h} style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.22)", letterSpacing: "0.1em", textTransform: "uppercase" }}>{h}</span>
              ))}
            </div>

            {/* Rows */}
            {RADAR_PREVIEW.map((row, i) => (
              <div key={row.imo} style={{
                display: "grid", gridTemplateColumns: "60px 1fr 130px 90px 80px",
                padding: "16px 24px", alignItems: "center",
                borderBottom: i < RADAR_PREVIEW.length - 1 ? "1px solid rgba(255,255,255,0.035)" : "none",
                background: i % 2 === 1 ? "rgba(255,255,255,0.015)" : "transparent",
                cursor: "default",
              }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)",
                  background: "rgba(255,255,255,0.06)", borderRadius: 4,
                  padding: "3px 7px", display: "inline-block", letterSpacing: "0.06em",
                }}>
                  {row.flag}
                </span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 2 }}>{row.name}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.28)" }}>{row.type} · IMO {row.imo}</div>
                </div>
                <span style={{
                  display: "inline-block",
                  background: row.signalBg, color: row.signalColor,
                  fontSize: 10, fontWeight: 700,
                  padding: "4px 9px", borderRadius: 4,
                  letterSpacing: "0.07em",
                }}>
                  {row.signal}
                </span>
                <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: GOLD }}>{row.score}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.32)" }}>{row.days}d ago</div>
              </div>
            ))}

            {/* Footer */}
            <div style={{
              padding: "10px 24px",
              borderTop: "1px solid rgba(255,255,255,0.04)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.18)" }}>
                Showing 3 of 1,843 active signals
              </span>
              <span style={{ fontSize: 11, color: "rgba(201,168,76,0.5)", fontWeight: 600 }}>
                AI-updated · 2 hours ago
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS ────────────────────────────────────────────────────────────── */}
      <section style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0", padding: "52px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
          {[
            { value: "81,000+", label: "Vessels tracked" },
            { value: "1,843+",  label: "Radar events" },
            { value: "$420",    label: "Aliağa $/LDT" },
            { value: "6",       label: "Data sources" },
          ].map((s, i) => (
            <div key={s.label} style={{
              textAlign: "center", padding: "0 24px",
              borderRight: i < 3 ? "1px solid #E2E8F0" : "none",
            }}>
              <div style={{ fontFamily: SERIF, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 700, color: NAVY, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 13, color: "#94A3B8", marginTop: 8 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── AUTHORITY STRIP ──────────────────────────────────────────────────── */}
      <section style={{ background: "#fff", borderBottom: "1px solid #E2E8F0", padding: "14px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#94A3B8", textTransform: "uppercase", marginRight: 28, whiteSpace: "nowrap" }}>
            Data sourced from
          </span>
          {DATA_SOURCES.map((s, i) => (
            <span key={s} style={{ display: "flex", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#475569", padding: "0 14px" }}>{s}</span>
              {i < DATA_SOURCES.length - 1 && <span style={{ color: "#E2E8F0", fontSize: 16 }}>|</span>}
            </span>
          ))}
        </div>
      </section>

      {/* ── SIGNAL TABLE ─────────────────────────────────────────────────────── */}
      <section style={{ background: "#fff", padding: "88px 24px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "baseline",
            borderBottom: `2px solid ${NAVY}`, paddingBottom: 14, marginBottom: 0,
          }}>
            <h2 style={{ fontFamily: SERIF, fontSize: "clamp(20px, 2.2vw, 28px)", fontWeight: 700, color: NAVY, fontStyle: "italic", margin: 0 }}>
              What We Track
            </h2>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#94A3B8", textTransform: "uppercase" }}>
              Active signals
            </span>
          </div>

          {SIGNAL_TABLE.map((row, i) => (
            <div key={row.label} style={{
              display: "grid", gridTemplateColumns: "1fr 1fr auto",
              alignItems: "center", gap: 16,
              padding: "20px 0",
              borderBottom: i < SIGNAL_TABLE.length - 1 ? "1px solid #F1F5F9" : "none",
            }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{row.label}</span>
              <span style={{ fontSize: 13, color: "#94A3B8" }}>{row.source}</span>
              <span style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 700, color: GOLD, textAlign: "right", minWidth: 56 }}>{row.count}</span>
            </div>
          ))}

          <div style={{ marginTop: 40 }}>
            <Link href="/opportunities" style={{
              display: "inline-block", background: NAVY, color: "#fff",
              padding: "13px 28px", borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: "none",
            }}>
              Open Opportunity Radar →
            </Link>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────────── */}
      <section style={{ background: "#F8FAFC", padding: "88px 24px", borderTop: "1px solid #E2E8F0" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: GOLD, textTransform: "uppercase", marginBottom: 52 }}>
            How It Works
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 56 }}>
            {[
              { n: "01", title: "AI detects",  body: "Machine learning flags idle vessels from AIS data. AI extracts arrest and detention events from court records and news within hours." },
              { n: "02", title: "We trace",    body: "Equasis ownership chain resolved to ISM manager level. Email enriched via Hunter.io and SMTP-verified." },
              { n: "03", title: "You contact", body: "Full owner contact details delivered to your dashboard before the vessel reaches the open market." },
            ].map(s => (
              <div key={s.n}>
                <div style={{ fontFamily: SERIF, fontSize: 56, fontWeight: 700, color: "#E8EDF5", lineHeight: 1, marginBottom: 20, userSelect: "none" }}>
                  {s.n}
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: NAVY, marginBottom: 10 }}>{s.title}</div>
                <div style={{ fontSize: 14, color: "#64748B", lineHeight: 1.75 }}>{s.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOR BUYERS ───────────────────────────────────────────────────────── */}
      <section style={{ background: NAVY, padding: "88px 24px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 72, alignItems: "start" }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: GOLD, textTransform: "uppercase", marginBottom: 20 }}>
              For Cash Buyers & Recycling Yards
            </p>
            <h2 style={{ fontFamily: SERIF, fontSize: "clamp(22px, 2.8vw, 34px)", fontWeight: 700, color: "#fff", margin: "0 0 20px", fontStyle: "italic", lineHeight: 1.25 }}>
              The intelligence edge for distressed vessel transactions.
            </h2>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", lineHeight: 1.8, marginBottom: 36 }}>
              AIS idle detection, Paris MOU detentions, judicial auctions, and bank arrests —
              classified and matched to vessel records before they go public.
            </p>
            <Link href="/opportunities" style={{
              display: "inline-block", background: GOLD, color: NAVY,
              padding: "13px 26px", borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: "none",
            }}>
              See Live Opportunities →
            </Link>
          </div>

          <div style={{ paddingTop: 4 }}>
            {[
              ["Access the radar",       "1,843+ live signals filtered by type, age, flag, and proximity to scrap yards."],
              ["Read the weekly brief",  "Every Monday: curated digest of highest-signal events with owner contacts."],
              ["Get the contact",        "Full Equasis ownership chain — manager email, phone, LinkedIn — verified."],
              ["Move before the market", "You reach distressed owners days before they list anywhere."],
            ].map(([title, body], i) => (
              <div key={title} style={{
                paddingBottom: 22, marginBottom: 22,
                borderBottom: i < 3 ? "1px solid rgba(255,255,255,0.05)" : "none",
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 5 }}>{title}</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.65 }}>{body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOR SELLERS ──────────────────────────────────────────────────────── */}
      <section style={{ background: "#fff", padding: "88px 24px", borderTop: "1px solid #E2E8F0" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 72, alignItems: "start" }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: GREEN, textTransform: "uppercase", marginBottom: 20 }}>
              For Shipowners
            </p>
            <h2 style={{ fontFamily: SERIF, fontSize: "clamp(22px, 2.8vw, 34px)", fontWeight: 700, color: NAVY, margin: "0 0 20px", fontStyle: "italic", lineHeight: 1.25 }}>
              Your vessel. Your terms.<br />No public exposure.
            </h2>
            <p style={{ fontSize: 15, color: "#64748B", lineHeight: 1.8, marginBottom: 36 }}>
              Enter your IMO and receive a free indicative estimate based on current Aliağa
              benchmark prices — in under a minute. Nothing is listed or disclosed without
              your explicit approval.
            </p>
            <Link href="/shipowners" style={{
              display: "inline-block", background: GREEN, color: "#fff",
              padding: "13px 26px", borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: "none",
            }}>
              Estimate my vessel →
            </Link>
          </div>

          <div style={{ paddingTop: 4 }}>
            {[
              ["Confidential by design",    "No public listing is ever created. Your vessel and identity stay private throughout."],
              ["Real market pricing",        "Estimates based on live Aliağa $/LDT benchmarks, not broker guesswork."],
              ["Verified buyers in Turkey",  "Active recycling yards in Aliağa with capital ready to deploy on the right vessel."],
              ["No obligation at any stage", "Review indicative offers, decide to proceed or not. No commitment required."],
            ].map(([title, body], i) => (
              <div key={title} style={{
                paddingBottom: 22, marginBottom: 22,
                borderBottom: i < 3 ? "1px solid #F1F5F9" : "none",
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: NAVY, marginBottom: 5 }}>{title}</div>
                <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.65 }}>{body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WEEKLY INTEL ─────────────────────────────────────────────────────── */}
      <section style={{ background: "#fff", padding: "80px 24px", borderTop: "1px solid #E2E8F0" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", color: GOLD, textTransform: "uppercase", margin: 0 }}>
              ShipScout Weekly
            </p>
            <span style={{ fontSize: 12, color: "#CBD5E1" }}>Every Monday</span>
          </div>
          <h2 style={{ fontFamily: SERIF, fontSize: "clamp(22px, 2.8vw, 34px)", fontWeight: 700, color: NAVY, margin: "0 0 16px", fontStyle: "italic", lineHeight: 1.25 }}>
            Maritime intelligence for people who need to act on it.
          </h2>
          <p style={{ fontSize: 15, color: "#64748B", margin: "0 0 32px", lineHeight: 1.8 }}>
            Arrests, detentions, sanctions, and auctions — curated, classified, and matched
            to vessel records. AI-written lead story with vessel photos and owner context.
            Delivered every Monday morning.
          </p>
          <Link href="/weekly" style={{
            fontSize: 15, fontWeight: 700, color: NAVY, textDecoration: "none",
            borderBottom: `1px solid ${NAVY}`, paddingBottom: 2,
          }}>
            Read latest issue →
          </Link>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
      <footer style={{ background: NAVY, borderTop: "1px solid rgba(255,255,255,0.06)", padding: "32px 24px" }}>
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
              <Link key={label} href={href} style={{ fontSize: 13, color: "rgba(255,255,255,0.32)", textDecoration: "none" }}>
                {label}
              </Link>
            ))}
          </div>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.18)" }}>© 2026 ShipScout</span>
        </div>
      </footer>

    </div>
  );
}
