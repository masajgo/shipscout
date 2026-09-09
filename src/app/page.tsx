"use client";
import Link from "next/link";

const NAVY  = "#07122E";
const GOLD  = "#C9A84C";
const GREEN = "#0D6E54";
const SERIF = "var(--font-serif), Georgia, serif";

const TICKER = [
  { flag: "PA", vessel: "MV OCEAN PIONEER",  signal: "DETENTION", color: "#F97316", location: "Rotterdam"      },
  { flag: "MH", vessel: "MT SILVER STRAIT",   signal: "ARREST",    color: "#EF4444", location: "Singapore"      },
  { flag: "CY", vessel: "MV EASTERN WIND",    signal: "LAYUP",     color: "#60A5FA", location: "Fujairah"       },
  { flag: "GR", vessel: "MV ATHENA GLORY",    signal: "DETENTION", color: "#F97316", location: "Hamburg"        },
  { flag: "LR", vessel: "MT BLACK SEA STAR",  signal: "SANCTION",  color: "#A78BFA", location: "OFAC SDN"       },
  { flag: "BZ", vessel: "MV PACIFIC TRADER",  signal: "AUCTION",   color: "#FBBF24", location: "Admiralty Court"},
  { flag: "TR", vessel: "MV BOSPHORUS ACE",   signal: "ARREST",    color: "#EF4444", location: "Istanbul"       },
  { flag: "SG", vessel: "MT CORAL SEA",       signal: "DETENTION", color: "#F97316", location: "Port Klang"     },
];

const RADAR_ROWS = [
  { flag: "PA", name: "MV OCEAN PIONEER", imo: "9234567", type: "Bulk Carrier",  signal: "DETENTION", sColor: "#FED7AA", sBg: "rgba(146,64,14,0.4)",  score: 847, days: 14 },
  { flag: "MH", name: "MT SILVER STRAIT",  imo: "9456789", type: "Tanker",        signal: "ARREST",    sColor: "#FECACA", sBg: "rgba(153,27,27,0.4)",  score: 923, days: 3  },
  { flag: "CY", name: "MV EASTERN WIND",   imo: "9123456", type: "General Cargo", signal: "LAYUP",     sColor: "#BFDBFE", sBg: "rgba(30,58,95,0.4)",   score: 612, days: 47 },
  { flag: "GR", name: "MV ATHENA GLORY",   imo: "9345678", type: "Tanker",        signal: "DETENTION", sColor: "#FED7AA", sBg: "rgba(146,64,14,0.4)",  score: 731, days: 8  },
];

const HOW = [
  { n: "01", title: "AI detects",  body: "Machine learning flags idle vessels from AIS. AI extracts arrest and detention events from court records within hours of the event." },
  { n: "02", title: "We trace",    body: "Equasis ownership chain resolved to ISM manager. Email enriched via Hunter.io and SMTP-verified — ready to send." },
  { n: "03", title: "You contact", body: "Full owner details delivered to your dashboard. You reach the owner days before the vessel appears on any public market." },
];

export default function HomePage() {
  const tickerItems = [...TICKER, ...TICKER];

  return (
    <>
      <style>{`
        @keyframes ticker {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ticker-track { animation: ticker 40s linear infinite; }
        .ticker-track:hover { animation-play-state: paused; }
      `}</style>

      <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", color: "#0F172A" }}>

        {/* ── HERO ──────────────────────────────────────────────────────────── */}
        <section style={{
          background: `radial-gradient(ellipse at 25% 60%, #0d1f4a 0%, ${NAVY} 65%)`,
          padding: "80px 40px 72px",
          minHeight: "88vh",
          display: "flex",
          alignItems: "center",
        }}>
          <div style={{ maxWidth: 1140, margin: "0 auto", width: "100%", display: "flex", gap: 64, alignItems: "center", flexWrap: "wrap" }}>

            {/* Left: text */}
            <div style={{ flex: "1 1 380px", maxWidth: 520 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 40 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: GOLD }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(201,168,76,0.75)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  Live · 1,843 active distress signals
                </span>
              </div>

              <h1 style={{
                fontFamily: SERIF,
                fontSize: "clamp(38px, 5vw, 64px)",
                fontWeight: 700, color: "#fff",
                lineHeight: 1.07, margin: "0 0 16px",
                fontStyle: "italic", letterSpacing: -1.5,
              }}>
                Maritime intelligence.<br />
                <span style={{ color: GOLD }}>Before anyone else.</span>
              </h1>

              <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.32)", margin: "0 0 24px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Buy first. Sell on your terms.
              </p>

              <p style={{ fontSize: 16, color: "rgba(255,255,255,0.55)", lineHeight: 1.8, marginBottom: 40, maxWidth: 420 }}>
                AI monitors 81,000+ vessels around the clock for PSC detentions, court arrests,
                layups, and sanctions — with verified owner contacts delivered before anyone else moves.
              </p>

              <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", marginBottom: 36 }}>
                <Link href="/opportunities" style={{
                  display: "inline-block", background: GOLD, color: NAVY,
                  padding: "14px 30px", borderRadius: 8, fontWeight: 700, fontSize: 15, textDecoration: "none",
                }}>
                  Access the Radar →
                </Link>
                <Link href="/shipowners" style={{
                  fontSize: 14, color: "rgba(255,255,255,0.42)", textDecoration: "none",
                  borderBottom: "1px solid rgba(255,255,255,0.15)", paddingBottom: 2,
                }}>
                  I'm selling a vessel
                </Link>
              </div>

              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.28)", lineHeight: 1.6 }}>
                Used by recycling yards in Aliağa, cash buyers in Piraeus, Singapore, and across Asia.
              </p>
            </div>

            {/* Right: radar mockup */}
            <div style={{ flex: "1 1 420px", maxWidth: 580 }}>
              <div style={{
                background: "#080F20",
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: "0 40px 100px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)",
                transform: "perspective(1400px) rotateY(-6deg) rotateX(2deg)",
              }}>
                {/* Browser chrome */}
                <div style={{
                  background: "#05090F",
                  padding: "10px 14px",
                  display: "flex", alignItems: "center", gap: 10,
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                }}>
                  <div style={{ display: "flex", gap: 5 }}>
                    {["#FF5F57","#FFBD2E","#28C840"].map(c => (
                      <div key={c} style={{ width: 9, height: 9, borderRadius: "50%", background: c }} />
                    ))}
                  </div>
                  <div style={{
                    flex: 1, background: "rgba(255,255,255,0.04)",
                    borderRadius: 4, padding: "4px 10px",
                    fontSize: 10, color: "rgba(255,255,255,0.2)", fontFamily: "monospace",
                  }}>
                    shipscout.io/opportunities
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: GOLD, display: "inline-block" }} />
                    <span style={{ fontSize: 9, color: "rgba(201,168,76,0.6)", fontWeight: 700, letterSpacing: "0.08em" }}>LIVE</span>
                  </div>
                </div>

                {/* Table header */}
                <div style={{
                  display: "grid", gridTemplateColumns: "48px 1fr 110px 72px 60px",
                  padding: "8px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)",
                  background: "rgba(255,255,255,0.02)",
                }}>
                  {["", "Vessel", "Signal", "Score", "Age"].map(h => (
                    <span key={h} style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em", textTransform: "uppercase" }}>{h}</span>
                  ))}
                </div>

                {/* Rows */}
                {RADAR_ROWS.map((row, i) => (
                  <div key={row.imo} style={{
                    display: "grid", gridTemplateColumns: "48px 1fr 110px 72px 60px",
                    padding: "13px 16px", alignItems: "center",
                    borderBottom: i < RADAR_ROWS.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none",
                    background: i % 2 ? "rgba(255,255,255,0.012)" : "transparent",
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.45)",
                      background: "rgba(255,255,255,0.05)", borderRadius: 3,
                      padding: "2px 5px", letterSpacing: "0.05em",
                    }}>{row.flag}</span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#fff", marginBottom: 1 }}>{row.name}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.24)" }}>{row.type}</div>
                    </div>
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: "0.07em",
                      background: row.sBg, color: row.sColor,
                      padding: "3px 7px", borderRadius: 3,
                      display: "inline-block",
                    }}>{row.signal}</span>
                    <span style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: GOLD }}>{row.score}</span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.28)" }}>{row.days}d</span>
                  </div>
                ))}

                <div style={{
                  padding: "8px 16px", borderTop: "1px solid rgba(255,255,255,0.04)",
                  display: "flex", justifyContent: "space-between",
                  background: "rgba(255,255,255,0.015)",
                }}>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.15)" }}>1,843 active signals</span>
                  <span style={{ fontSize: 10, color: "rgba(201,168,76,0.45)", fontWeight: 600 }}>AI-updated · 2h ago</span>
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* ── TICKER ──────────────────────────────────────────────────────────── */}
        <div style={{
          background: "#050C1A",
          borderTop: "1px solid rgba(255,255,255,0.05)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          padding: "12px 0", overflow: "hidden",
        }}>
          <div className="ticker-track" style={{ display: "flex", whiteSpace: "nowrap", width: "max-content" }}>
            {tickerItems.map((item, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "0 32px" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: "0.06em" }}>{item.flag}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>{item.vessel}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: item.color, letterSpacing: "0.08em" }}>{item.signal}</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{item.location}</span>
                <span style={{ color: "rgba(255,255,255,0.1)", fontSize: 16 }}>·</span>
              </span>
            ))}
          </div>
        </div>

        {/* ── SOCIAL PROOF ────────────────────────────────────────────────────── */}
        <section style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0", padding: "18px 40px" }}>
          <div style={{ maxWidth: 1140, margin: "0 auto", display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap", justifyContent: "center" }}>
            <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
              Trusted by maritime professionals in
            </span>
            {["Aliağa", "Piraeus", "Singapore", "Istanbul", "Hamburg"].map((city, i, arr) => (
              <span key={city} style={{ display: "flex", alignItems: "center", gap: 32 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#475569" }}>{city}</span>
                {i < arr.length - 1 && <span style={{ color: "#E2E8F0" }}>·</span>}
              </span>
            ))}
          </div>
        </section>

        {/* ── STATS ───────────────────────────────────────────────────────────── */}
        <section style={{ background: "#fff", padding: "52px 40px", borderBottom: "1px solid #E2E8F0" }}>
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

        {/* ── HOW IT WORKS ────────────────────────────────────────────────────── */}
        <section style={{ background: "#F8FAFC", padding: "88px 40px", borderBottom: "1px solid #E2E8F0" }}>
          <div style={{ maxWidth: 960, margin: "0 auto" }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: GOLD, textTransform: "uppercase", marginBottom: 52 }}>
              How It Works
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 56 }}>
              {HOW.map(s => (
                <div key={s.n}>
                  <div style={{ fontFamily: SERIF, fontSize: 56, fontWeight: 700, color: "#E2E8F0", lineHeight: 1, marginBottom: 20, userSelect: "none" }}>{s.n}</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: NAVY, marginBottom: 10 }}>{s.title}</div>
                  <div style={{ fontSize: 14, color: "#64748B", lineHeight: 1.75 }}>{s.body}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── BUYER / SELLER SPLIT ────────────────────────────────────────────── */}
        <section style={{ display: "flex", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 300px", background: NAVY, padding: "72px 56px", borderRight: "1px solid rgba(255,255,255,0.05)" }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: GOLD, textTransform: "uppercase", marginBottom: 20 }}>
              For Cash Buyers & Recycling Yards
            </p>
            <h2 style={{ fontFamily: SERIF, fontSize: "clamp(22px, 2.5vw, 32px)", fontWeight: 700, color: "#fff", margin: "0 0 20px", fontStyle: "italic", lineHeight: 1.25 }}>
              The intelligence edge for distressed vessel transactions.
            </h2>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", lineHeight: 1.8, marginBottom: 36 }}>
              1,843+ live signals filtered by type, age, flag, and proximity to scrap yards.
              Full Equasis ownership chain — manager email, phone, LinkedIn — verified and ready.
            </p>
            <Link href="/opportunities" style={{
              display: "inline-block", background: GOLD, color: NAVY,
              padding: "13px 26px", borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: "none",
            }}>
              See Live Opportunities →
            </Link>
          </div>

          <div style={{ flex: "1 1 300px", background: "#071E14", padding: "72px 56px" }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: "#4ade80", textTransform: "uppercase", marginBottom: 20 }}>
              For Shipowners
            </p>
            <h2 style={{ fontFamily: SERIF, fontSize: "clamp(22px, 2.5vw, 32px)", fontWeight: 700, color: "#fff", margin: "0 0 20px", fontStyle: "italic", lineHeight: 1.25 }}>
              Your vessel. Your terms.<br />No public exposure.
            </h2>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", lineHeight: 1.8, marginBottom: 36 }}>
              Enter your IMO for a free indicative estimate based on current Aliağa benchmarks.
              Confidential — nothing is listed or disclosed without your explicit approval.
            </p>
            <Link href="/shipowners" style={{
              display: "inline-block", background: "rgba(255,255,255,0.09)", color: "#fff",
              border: "1px solid rgba(255,255,255,0.18)",
              padding: "13px 26px", borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: "none",
            }}>
              Estimate my vessel →
            </Link>
          </div>
        </section>

        {/* ── WEEKLY INTEL ────────────────────────────────────────────────────── */}
        <section style={{ background: "#fff", padding: "80px 40px", borderTop: "1px solid #E2E8F0" }}>
          <div style={{ maxWidth: 640, margin: "0 auto" }}>
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
              Arrests, detentions, sanctions, and auctions — AI-curated, classified, and matched
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

        {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
        <footer style={{ background: NAVY, borderTop: "1px solid rgba(255,255,255,0.06)", padding: "32px 40px" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
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
    </>
  );
}
