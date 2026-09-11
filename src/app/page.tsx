"use client";
import Link from "next/link";
import { useState } from "react";

const NAVY  = "#07122E";
const GOLD  = "#C9A84C";
const SERIF = "var(--font-serif), Georgia, serif";

const TICKER = [
  { flag: "PA", vessel: "MV OCEAN PIONEER",  signal: "DETENTION", color: "#F97316", location: "Rotterdam"       },
  { flag: "MH", vessel: "MT SILVER STRAIT",   signal: "ARREST",    color: "#EF4444", location: "Singapore"       },
  { flag: "CY", vessel: "MV EASTERN WIND",    signal: "LAYUP",     color: "#60A5FA", location: "Fujairah"        },
  { flag: "GR", vessel: "MV ATHENA GLORY",    signal: "DETENTION", color: "#F97316", location: "Hamburg"         },
  { flag: "LR", vessel: "MT BLACK SEA STAR",  signal: "SANCTION",  color: "#A78BFA", location: "OFAC SDN"        },
  { flag: "BZ", vessel: "MV PACIFIC TRADER",  signal: "AUCTION",   color: "#FBBF24", location: "Admiralty Court" },
  { flag: "TR", vessel: "MV BOSPHORUS ACE",   signal: "ARREST",    color: "#EF4444", location: "Istanbul"        },
  { flag: "SG", vessel: "MT CORAL SEA",       signal: "DETENTION", color: "#F97316", location: "Port Klang"      },
];

const RADAR_ROWS = [
  { flag: "PA", name: "MV OCEAN PIONEER", imo: "9234567", type: "Bulk Carrier",  signal: "DETENTION", sColor: "#FED7AA", sBg: "rgba(146,64,14,0.4)",  score: 847, days: 14 },
  { flag: "MH", name: "MT SILVER STRAIT",  imo: "9456789", type: "Tanker",        signal: "ARREST",    sColor: "#FECACA", sBg: "rgba(153,27,27,0.4)",  score: 923, days: 3  },
  { flag: "CY", name: "MV EASTERN WIND",   imo: "9123456", type: "General Cargo", signal: "LAYUP",     sColor: "#BFDBFE", sBg: "rgba(30,58,95,0.4)",   score: 612, days: 47 },
  { flag: "GR", name: "MV ATHENA GLORY",   imo: "9345678", type: "Tanker",        signal: "DETENTION", sColor: "#FED7AA", sBg: "rgba(146,64,14,0.4)",  score: 731, days: 8  },
];

const STEPS = [
  {
    n: "01", title: "Find",
    body: "Our AI monitors 81,000+ vessels around the clock. Arrests, detentions, layups, sanctions — flagged within hours, long before they appear on any public market.",
  },
  {
    n: "02", title: "Inspect",
    body: "Before any offer is made, we send a certified marine surveyor. Hull, machinery, documentation — a full technical report in your hands so you know exactly what you're buying.",
  },
  {
    n: "03", title: "Negotiate",
    body: "Armed with the survey report, we approach the owner directly. Real leverage, real data — not gut feel. Issues found mean price comes down. Clean report means you close fast.",
  },
  {
    n: "04", title: "Escrow",
    body: "Funds held securely before title transfer. Full documentation and legal compliance handled end-to-end. Zero exposure for buyer or seller.",
  },
  {
    n: "05", title: "Close",
    body: "Deal done. Title transferred. No upfront fees — we earn only when you do. Every incentive aligned from first contact to final handshake.",
  },
];

function ContactForm() {
  const [form, setForm]   = useState({ name: "", company: "", email: "", intent: "Buy", message: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setStatus(res.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div style={{ textAlign: "center", padding: "48px 0" }}>
        <div style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 700, color: NAVY, marginBottom: 12 }}>
          Message received.
        </div>
        <p style={{ fontSize: 15, color: "#64748B" }}>We'll be in touch within one business day.</p>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "11px 14px", fontSize: 14,
    border: "1px solid #E2E8F0", borderRadius: 7, outline: "none",
    color: "#0F172A", background: "#fff", boxSizing: "border-box",
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <input required placeholder="Your name" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          style={inputStyle} />
        <input placeholder="Company" value={form.company}
          onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
          style={inputStyle} />
      </div>
      <input required type="email" placeholder="Email address" value={form.email}
        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
        style={inputStyle} />
      <select value={form.intent}
        onChange={e => setForm(f => ({ ...f, intent: e.target.value }))}
        style={{ ...inputStyle, color: form.intent ? "#0F172A" : "#94A3B8" }}>
        <option value="Buy">I want to buy a vessel</option>
        <option value="Sell">I want to sell a vessel</option>
        <option value="Inspect">Request a pre-purchase inspection</option>
        <option value="Both">Buy and sell</option>
        <option value="General">General inquiry</option>
      </select>
      <textarea placeholder="Tell us about your deal — vessel type, size, timeline, budget…"
        value={form.message} rows={4}
        onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
        style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
      <button type="submit" disabled={status === "sending"} style={{
        background: NAVY, color: "#fff", border: "none",
        padding: "13px 28px", borderRadius: 7, fontSize: 15, fontWeight: 700,
        cursor: status === "sending" ? "not-allowed" : "pointer",
        opacity: status === "sending" ? 0.7 : 1,
        alignSelf: "flex-start",
      }}>
        {status === "sending" ? "Sending…" : "Start a deal →"}
      </button>
      {status === "error" && (
        <p style={{ fontSize: 13, color: "#EF4444", margin: 0 }}>
          Something went wrong — email us directly at info@turqomarine.com
        </p>
      )}
    </form>
  );
}

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

        @media (max-width: 768px) {
          .hero-section      { padding: 48px 20px 40px !important; min-height: auto !important; }
          .hero-inner        { gap: 36px !important; }
          .hero-mockup       { display: none !important; }
          .section-pad       { padding: 56px 20px !important; }
          .section-pad-sm    { padding: 40px 20px !important; }
          .steps-grid        { grid-template-columns: 1fr 1fr !important; gap: 28px !important; }
          .chain-row         { overflow-x: auto !important; padding-bottom: 12px !important; }
          .compare-grid      { grid-template-columns: 1fr !important; }
          .compare-row       { grid-template-columns: 1fr !important; gap: 4px !important; }
          .compare-row > *:first-child { display: none !important; }
          .two-col           { grid-template-columns: 1fr !important; gap: 36px !important; }
          .split-panel       { flex-direction: column !important; }
          .split-panel > div { padding: 48px 24px !important; }
          .footer-inner      { flex-direction: column !important; gap: 20px !important; align-items: flex-start !important; }
          .footer-links      { flex-wrap: wrap !important; gap: 14px !important; }
          .contact-info      { display: none !important; }
        }
        @media (max-width: 480px) {
          .steps-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", color: "#0F172A" }}>

        {/* ── HERO ─────────────────────────────────────────────────────────────── */}
        <section className="hero-section" style={{
          background: `radial-gradient(ellipse at 25% 60%, #0d1f4a 0%, ${NAVY} 65%)`,
          padding: "80px 40px 72px",
          minHeight: "88vh",
          display: "flex",
          alignItems: "center",
        }}>
          <div className="hero-inner" style={{ maxWidth: 1140, margin: "0 auto", width: "100%", display: "flex", gap: 64, alignItems: "center", flexWrap: "wrap" }}>

            {/* Left: text */}
            <div style={{ flex: "1 1 380px", maxWidth: 520 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 40 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: GOLD }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(201,168,76,0.75)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  Full-service maritime brokerage
                </span>
              </div>

              <h1 style={{
                fontFamily: SERIF,
                fontSize: "clamp(38px, 5vw, 64px)",
                fontWeight: 700, color: "#fff",
                lineHeight: 1.07, margin: "0 0 24px",
                letterSpacing: -1.5,
              }}>
                We find it.<br />
                <span style={{ color: GOLD }}>We close it.</span>
              </h1>

              <p style={{ fontSize: 16, color: "rgba(255,255,255,0.55)", lineHeight: 1.8, marginBottom: 40, maxWidth: 420 }}>
                AI-powered vessel sourcing, direct owner negotiation, and escrow — handled
                start to finish. No upfront fees. We earn when you close.
              </p>

              <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", marginBottom: 36 }}>
                <a href="#contact" style={{
                  display: "inline-block", background: GOLD, color: NAVY,
                  padding: "14px 30px", borderRadius: 8, fontWeight: 700, fontSize: 15, textDecoration: "none",
                }}>
                  Start a deal →
                </a>
                <Link href="/shipowners" style={{
                  fontSize: 14, color: "rgba(255,255,255,0.42)", textDecoration: "none",
                  borderBottom: "1px solid rgba(255,255,255,0.15)", paddingBottom: 2,
                }}>
                  Estimate my vessel
                </Link>
              </div>

              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.28)", lineHeight: 1.6 }}>
                Trusted by recycling yards in Aliağa, cash buyers in Piraeus, Singapore, and Dubai.
              </p>
            </div>

            {/* Right: radar mockup */}
            <div className="hero-mockup" style={{ flex: "1 1 420px", maxWidth: 580 }}>
              <div style={{
                background: "#080F20",
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: "0 40px 100px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)",
                transform: "perspective(1400px) rotateY(-6deg) rotateX(2deg)",
              }}>
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

                <div style={{
                  display: "grid", gridTemplateColumns: "48px 1fr 110px 72px 60px",
                  padding: "8px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)",
                  background: "rgba(255,255,255,0.02)",
                }}>
                  {["", "Vessel", "Signal", "Score", "Age"].map(h => (
                    <span key={h} style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em", textTransform: "uppercase" }}>{h}</span>
                  ))}
                </div>

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
                      padding: "3px 7px", borderRadius: 3, display: "inline-block",
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

        {/* ── TICKER ───────────────────────────────────────────────────────────── */}
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

        {/* ── 4 STEPS ──────────────────────────────────────────────────────────── */}
        <section className="section-pad" style={{ background: "#F8FAFC", padding: "96px 40px", borderBottom: "1px solid #E2E8F0" }}>
          <div style={{ maxWidth: 1060, margin: "0 auto" }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: GOLD, textTransform: "uppercase", marginBottom: 16 }}>
              How We Work
            </p>
            <h2 style={{ fontFamily: SERIF, fontSize: "clamp(26px, 3vw, 40px)", fontWeight: 700, color: NAVY, margin: "0 0 64px", lineHeight: 1.2 }}>
              One team. Start to close.
            </h2>
            <div className="steps-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 32 }}>
              {STEPS.map((s, i) => (
                <div key={s.n} style={{ position: "relative" }}>
                  {i < STEPS.length - 1 && (
                    <div style={{
                      position: "absolute", top: 28, left: "calc(100% - 20px)", width: 40,
                      height: 1, background: "#E2E8F0", zIndex: 0,
                    }} />
                  )}
                  <div style={{ fontFamily: SERIF, fontSize: 48, fontWeight: 700, color: "#E2E8F0", lineHeight: 1, marginBottom: 16, userSelect: "none" }}>{s.n}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: NAVY, marginBottom: 12 }}>{s.title}</div>
                  <div style={{ fontSize: 14, color: "#64748B", lineHeight: 1.75 }}>{s.body}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CHAIN VISUAL ─────────────────────────────────────────────────────── */}
        <section style={{ background: "#fff", padding: "88px 40px", borderBottom: "1px solid #E2E8F0" }}>
          <div style={{ maxWidth: 980, margin: "0 auto" }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: GOLD, textTransform: "uppercase", marginBottom: 16 }}>
              The difference
            </p>
            <h2 style={{ fontFamily: SERIF, fontSize: "clamp(26px, 3vw, 40px)", fontWeight: 700, color: NAVY, margin: "0 0 72px", lineHeight: 1.2 }}>
              We cut out the chain.
            </h2>

            {/* OLD WAY */}
            <div style={{ marginBottom: 64 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 28 }}>
                The old way — 3 to 4 commissions
              </div>
              <div className="chain-row" style={{ display: "flex", alignItems: "center", overflowX: "auto", paddingBottom: 8 }}>
                {/* Seller */}
                <div style={{ flexShrink: 0, border: "1.5px solid #CBD5E1", borderRadius: 10, padding: "12px 20px", background: "#F8FAFC", textAlign: "center", minWidth: 90 }}>
                  <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Seller</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>Shipowner</div>
                </div>

                {/* Arrow 1 */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, margin: "0 2px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#EF4444", marginBottom: 4 }}>1%</div>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <div style={{ width: 32, height: 1.5, background: "#E2E8F0" }} />
                    <div style={{ width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderLeft: "7px solid #E2E8F0" }} />
                  </div>
                </div>

                {/* Broker 1 */}
                <div style={{ flexShrink: 0, border: "1.5px solid #E2E8F0", borderRadius: 10, padding: "12px 20px", background: "#FAFAFA", textAlign: "center", minWidth: 110 }}>
                  <div style={{ fontSize: 10, color: "#CBD5E1", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Selling broker</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#9CA3AF" }}>Commission</div>
                </div>

                {/* Arrow 2 */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, margin: "0 2px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#EF4444", marginBottom: 4 }}>1%</div>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <div style={{ width: 32, height: 1.5, background: "#E2E8F0" }} />
                    <div style={{ width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderLeft: "7px solid #E2E8F0" }} />
                  </div>
                </div>

                {/* Broker 2 */}
                <div style={{ flexShrink: 0, border: "1.5px solid #E2E8F0", borderRadius: 10, padding: "12px 20px", background: "#FAFAFA", textAlign: "center", minWidth: 110 }}>
                  <div style={{ fontSize: 10, color: "#CBD5E1", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Sub-broker</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#9CA3AF" }}>Commission</div>
                </div>

                {/* Arrow 3 */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, margin: "0 2px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#EF4444", marginBottom: 4 }}>1%</div>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <div style={{ width: 32, height: 1.5, background: "#E2E8F0" }} />
                    <div style={{ width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderLeft: "7px solid #E2E8F0" }} />
                  </div>
                </div>

                {/* Broker 3 */}
                <div style={{ flexShrink: 0, border: "1.5px solid #E2E8F0", borderRadius: 10, padding: "12px 20px", background: "#FAFAFA", textAlign: "center", minWidth: 110 }}>
                  <div style={{ fontSize: 10, color: "#CBD5E1", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Buying broker</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#9CA3AF" }}>Commission</div>
                </div>

                {/* Arrow 4 */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, margin: "0 2px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#EF4444", marginBottom: 4 }}>0.5%</div>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <div style={{ width: 32, height: 1.5, background: "#E2E8F0" }} />
                    <div style={{ width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderLeft: "7px solid #E2E8F0" }} />
                  </div>
                </div>

                {/* Buyer */}
                <div style={{ flexShrink: 0, border: "1.5px solid #CBD5E1", borderRadius: 10, padding: "12px 20px", background: "#F8FAFC", textAlign: "center", minWidth: 90 }}>
                  <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Buyer</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>Cash buyer</div>
                </div>
              </div>
              <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#EF4444", flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: "#EF4444", fontWeight: 600 }}>
                  3.5%+ total commission lost across the chain — on a $10M vessel, that's $350,000.
                </span>
              </div>
            </div>

            {/* SHIPSCOUT WAY */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 28 }}>
                ShipScout — direct
              </div>
              <div style={{ display: "flex", alignItems: "center" }}>
                {/* Seller */}
                <div style={{ flexShrink: 0, border: `2px solid ${NAVY}`, borderRadius: 10, padding: "12px 20px", background: "#fff", textAlign: "center", minWidth: 90 }}>
                  <div style={{ fontSize: 10, color: "#64748B", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Seller</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Shipowner</div>
                </div>

                {/* Line left */}
                <div style={{ flex: 1, height: 2, background: `linear-gradient(to right, ${NAVY}, ${GOLD})`, maxWidth: 120 }} />

                {/* ShipScout node */}
                <div style={{ flexShrink: 0, border: `2px solid ${GOLD}`, borderRadius: 10, padding: "14px 28px", background: NAVY, textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(201,168,76,0.7)", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Direct broker</div>
                  <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 700, color: GOLD }}>ShipScout</div>
                </div>

                {/* Line right */}
                <div style={{ flex: 1, height: 2, background: `linear-gradient(to right, ${GOLD}, ${NAVY})`, maxWidth: 120 }} />

                {/* Buyer */}
                <div style={{ flexShrink: 0, border: `2px solid ${NAVY}`, borderRadius: 10, padding: "12px 20px", background: "#fff", textAlign: "center", minWidth: 90 }}>
                  <div style={{ fontSize: 10, color: "#64748B", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Buyer</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Cash buyer</div>
                </div>
              </div>
              <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#059669", flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: "#059669", fontWeight: 600 }}>
                  One party. One fee. Full deal support from first signal to final transfer.
                </span>
              </div>
            </div>

          </div>
        </section>

        {/* ── COMPARISON ───────────────────────────────────────────────────────── */}
        <section style={{ background: NAVY, padding: "88px 40px" }}>
          <div style={{ maxWidth: 860, margin: "0 auto" }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: GOLD, textTransform: "uppercase", marginBottom: 16 }}>
              Why ShipScout
            </p>
            <h2 style={{ fontFamily: SERIF, fontSize: "clamp(26px, 3vw, 40px)", fontWeight: 700, color: "#fff", margin: "0 0 56px", lineHeight: 1.2 }}>
              The old way leaves money on the table.
            </h2>

            <div className="compare-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0, marginBottom: 0 }}>
              <div />
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.25)", letterSpacing: "0.12em", textTransform: "uppercase", paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                Traditional Broker
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: "0.12em", textTransform: "uppercase", paddingBottom: 16, paddingLeft: 24, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                ShipScout
              </div>
            </div>

            {[
              { cat: "Market reach",   old: "Own network & public listings",       neo: "81,000+ vessels monitored globally" },
              { cat: "Speed",          old: "Weeks to find a suitable vessel",     neo: "Signals within hours of the incident" },
              { cat: "Intelligence",   old: "Phone calls and industry gut feel",   neo: "AI + Equasis ownership chain, verified" },
              { cat: "Timing",         old: "After it hits the public market",     neo: "Before anyone else knows it's available" },
              { cat: "Fees",           old: "Commission both sides, no clarity",   neo: "No upfront fees — we earn when you close" },
              { cat: "Deal support",   old: "Introduce parties and step away",     neo: "Find → Negotiate → Escrow → Close" },
            ].map(({ cat, old, neo }) => (
              <div key={cat} className="compare-row" style={{
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
                gap: 0, padding: "20px 0",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
                alignItems: "center",
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  {cat}
                </div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.28)", lineHeight: 1.5 }}>
                  {old}
                </div>
                <div style={{ fontSize: 14, color: "#fff", lineHeight: 1.5, paddingLeft: 24, borderLeft: `2px solid ${GOLD}` }}>
                  {neo}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── PHOTO BREAK ──────────────────────────────────────────────────────── */}
        <div style={{
          height: 380,
          backgroundImage: `linear-gradient(to bottom, ${NAVY} 0%, transparent 18%, transparent 78%, #F8FAFC 100%), url(/hero-ship.jpg)`,
          backgroundSize: "cover",
          backgroundPosition: "center 40%",
        }} />

        {/* ── BUYER / SELLER SPLIT ─────────────────────────────────────────────── */}
        <section className="split-panel" style={{ display: "flex", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 300px", background: NAVY, padding: "72px 56px", borderRight: "1px solid rgba(255,255,255,0.05)" }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: GOLD, textTransform: "uppercase", marginBottom: 20 }}>
              For Cash Buyers & Recycling Yards
            </p>
            <h2 style={{ fontFamily: SERIF, fontSize: "clamp(22px, 2.5vw, 32px)", fontWeight: 700, color: "#fff", margin: "0 0 20px", lineHeight: 1.25 }}>
              Buy before the market does.
            </h2>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", lineHeight: 1.8, marginBottom: 36 }}>
              We monitor 1,800+ live distress signals — arrests, detentions, layups, sanctions.
              When a vessel is ready to move, we bring it to you before it reaches any public listing.
            </p>
            <a href="#contact" style={{
              display: "inline-block", background: GOLD, color: NAVY,
              padding: "13px 26px", borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: "none",
            }}>
              Start buying →
            </a>
          </div>

          <div style={{ flex: "1 1 300px", background: "#071E14", padding: "72px 56px" }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: "#4ade80", textTransform: "uppercase", marginBottom: 20 }}>
              For Shipowners
            </p>
            <h2 style={{ fontFamily: SERIF, fontSize: "clamp(22px, 2.5vw, 32px)", fontWeight: 700, color: "#fff", margin: "0 0 20px", lineHeight: 1.25 }}>
              Sell on your terms.<br />No public exposure.
            </h2>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", lineHeight: 1.8, marginBottom: 36 }}>
              We find the right buyer from our network, negotiate the best price, and manage
              escrow. Confidential from start to close — nothing disclosed without your approval.
            </p>
            <Link href="/shipowners" style={{
              display: "inline-block", background: "rgba(255,255,255,0.09)", color: "#fff",
              border: "1px solid rgba(255,255,255,0.18)",
              padding: "13px 26px", borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: "none",
            }}>
              Get a free estimate →
            </Link>
          </div>
        </section>

        {/* ── ORIGIN STORY ─────────────────────────────────────────────────────── */}
        <section style={{ background: "#F8FAFC", padding: "96px 40px", borderTop: "1px solid #E2E8F0", borderBottom: "1px solid #E2E8F0" }}>
          <div className="two-col" style={{ maxWidth: 860, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 96, alignItems: "start" }}>

            {/* Left: story */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: GOLD, textTransform: "uppercase", marginBottom: 24 }}>
                How ShipScout started
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
                <p style={{ fontSize: 16, color: "#374151", lineHeight: 1.85, margin: 0 }}>
                  We were trying to sell a vessel. Not a small one —
                  fifteen thousand lightship tons of steel, sitting idle, costing money every day.
                </p>
                <p style={{ fontSize: 16, color: "#374151", lineHeight: 1.85, margin: 0 }}>
                  The first offer came back at{" "}
                  <strong style={{ color: NAVY }}>$230 per LDT.</strong>{" "}
                  We didn't know if it was fair. We had no way to know.
                  So we trusted the broker.
                </p>
                <p style={{ fontSize: 16, color: "#374151", lineHeight: 1.85, margin: 0 }}>
                  We pushed. He came back with <strong style={{ color: NAVY }}>$240.</strong>{" "}
                  A second broker appeared at <strong style={{ color: NAVY }}>$250</strong> —
                  each one claiming to have the best buyer, each one with a chain of
                  people behind them we never got to meet.
                </p>
                <p style={{ fontSize: 16, color: "#374151", lineHeight: 1.85, margin: 0 }}>
                  So we cut through the chain and called a breaking yard directly.
                  The commercial team quoted us <strong style={{ color: NAVY }}>$260.</strong>{" "}
                  Better — but we still felt there was room.
                </p>
                <p style={{ fontSize: 16, color: "#374151", lineHeight: 1.85, margin: 0 }}>
                  Then we reached the owner of the yard personally. Someone we knew.
                  A relationship built over years — not a cold call, not a form, not a broker introduction.
                </p>
                <p style={{ fontFamily: SERIF, fontSize: 24, color: NAVY, lineHeight: 1.4, margin: 0, fontWeight: 700 }}>
                  $285. Final offer. Deal closed.
                </p>
                <p style={{ fontSize: 16, color: "#374151", lineHeight: 1.85, margin: 0 }}>
                  Same vessel. Same steel. Same week.{" "}
                  <strong style={{ color: NAVY }}>$55 more per LDT</strong> — simply because
                  we knew who to call and they picked up.
                </p>
                <p style={{ fontSize: 15, color: "#64748B", lineHeight: 1.85, margin: 0 }}>
                  That was the moment ShipScout was born. The best price in this industry
                  doesn't come from the loudest broker — it comes from the right relationship.
                  We built ShipScout to make those relationships available to every owner.
                </p>
              </div>
            </div>

            {/* Right: pull quote + number */}
            <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
              <div style={{ borderLeft: `3px solid ${GOLD}`, paddingLeft: 28 }}>
                <div style={{ fontFamily: SERIF, fontSize: "clamp(48px, 5vw, 72px)", fontWeight: 700, color: NAVY, lineHeight: 1 }}>
                  $825K
                </div>
                <div style={{ fontSize: 14, color: "#64748B", marginTop: 10, lineHeight: 1.6 }}>
                  more — on a 15,000 LDT vessel at $55/LDT. The difference between the first offer and the right relationship.
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {[
                  { price: "$230", label: "First broker quote",      dim: true  },
                  { price: "$240", label: "Pushed back",             dim: true  },
                  { price: "$250", label: "Second broker",           dim: true  },
                  { price: "$260", label: "Called yard directly",    dim: true  },
                  { price: "$285", label: "Owner relationship",      dim: false },
                ].map(({ price, label, dim }, i, arr) => (
                  <div key={price} style={{
                    display: "flex", alignItems: "center", gap: 16,
                    padding: "14px 0",
                    borderBottom: i < arr.length - 1 ? "1px solid #F1F5F9" : "none",
                  }}>
                    <div style={{
                      fontFamily: SERIF, fontSize: 22, fontWeight: 700, minWidth: 64,
                      color: dim ? "#CBD5E1" : NAVY,
                    }}>
                      {price}
                    </div>
                    <div style={{ fontSize: 13, color: dim ? "#CBD5E1" : "#374151", fontWeight: dim ? 400 : 600 }}>
                      {label}
                    </div>
                    {!dim && (
                      <div style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: GOLD, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                        Best price
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

          </div>
        </section>

        {/* ── NO UPFRONT FEES ──────────────────────────────────────────────────── */}
        <section style={{ background: "#F8FAFC", padding: "88px 40px", borderTop: "1px solid #E2E8F0" }}>
          <div className="two-col" style={{ maxWidth: 860, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
            <div>
              <h2 style={{ fontFamily: SERIF, fontSize: "clamp(30px, 3.5vw, 48px)", fontWeight: 700, color: NAVY, margin: "0 0 20px", lineHeight: 1.1 }}>
                No upfront fees.<br />Ever.
              </h2>
              <p style={{ fontSize: 16, color: "#64748B", lineHeight: 1.8, margin: "0 0 32px" }}>
                We earn when you close. That means every call we make, every owner we track down,
                every negotiation we run — is on us until you have a signed deal.
              </p>
              <a href="#contact" style={{
                display: "inline-block", background: NAVY, color: "#fff",
                padding: "13px 28px", borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: "none",
              }}>
                Talk to us →
              </a>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              {[
                { label: "Confidential",    desc: "Nothing shared or disclosed without your explicit approval." },
                { label: "Verified",        desc: "Every owner contact is SMTP-verified and Equasis-sourced." },
                { label: "End-to-end",      desc: "We stay in the deal from first signal to final transfer." },
              ].map(({ label, desc }) => (
                <div key={label} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <div style={{ width: 3, height: 44, background: GOLD, borderRadius: 2, flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 14, color: "#64748B", lineHeight: 1.6 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CONTACT FORM ─────────────────────────────────────────────────────── */}
        <section id="contact" style={{ background: "#fff", padding: "88px 40px", borderTop: "1px solid #E2E8F0" }}>
          <div className="two-col" style={{ maxWidth: 860, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "flex-start" }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: GOLD, textTransform: "uppercase", marginBottom: 16 }}>
                Start a Deal
              </p>
              <h2 style={{ fontFamily: SERIF, fontSize: "clamp(26px, 3vw, 38px)", fontWeight: 700, color: NAVY, margin: "0 0 20px", lineHeight: 1.2 }}>
                Tell us what you're looking for.
              </h2>
              <p style={{ fontSize: 15, color: "#64748B", lineHeight: 1.8, margin: "0 0 32px" }}>
                Bulk carrier, tanker, general cargo — any vessel type, any size.
                We'll come back to you within one business day with a plan.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <a href="mailto:info@turqomarine.com" style={{ fontSize: 14, color: "#94A3B8", textDecoration: "none" }}>
                  info@turqomarine.com
                </a>
                <a
                  href="https://wa.me/905396675922"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 10,
                    background: "#25D366", color: "#fff",
                    padding: "11px 20px", borderRadius: 8,
                    fontSize: 14, fontWeight: 700, textDecoration: "none",
                    alignSelf: "flex-start", marginTop: 4,
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.554 4.121 1.524 5.855L0 24l6.335-1.505A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.002-1.368l-.36-.214-3.726.885.916-3.618-.235-.372A9.818 9.818 0 1112 21.818z"/>
                  </svg>
                  WhatsApp us
                </a>
              </div>
            </div>
            <ContactForm />
          </div>
        </section>

        {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
        <footer style={{ background: NAVY, borderTop: "1px solid rgba(255,255,255,0.06)", padding: "32px 40px" }}>
          <div className="footer-inner" style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
            <span style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 700, color: "#fff" }}>
              Ship<span style={{ color: GOLD }}>Scout</span>
            </span>
            <div className="footer-links" style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              {([
                ["Opportunities", "/opportunities"],
                ["Vessels for Sale", "/for-sale"],
                ["Shipowners",    "/shipowners"],
                ["Contact",       "mailto:info@turqomarine.com"],
                ["WhatsApp",      "https://wa.me/905396675922"],
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
