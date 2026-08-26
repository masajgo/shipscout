"use client";
import Link from "next/link";

const STATS = [
  { value: "4,300+", label: "Vessels monitored" },
  { value: "$420", label: "Aliağa $/LDT today" },
  { value: "24h", label: "Offer turnaround" },
  { value: "100%", label: "Confidential" },
];

const HOW_OWNER = [
  { n: "01", title: "Enter your IMO", body: "Get an instant indicative recycling or second-hand value estimate — free and with no obligation." },
  { n: "02", title: "Submit confidentially", body: "Your vessel details are shared only with verified buyers after your explicit approval. No public listing." },
  { n: "03", title: "Receive verified offers", body: "Within 24 hours we return indicative offers from qualified recycling yards and cash buyers." },
  { n: "04", title: "Close securely", body: "Legal review, KYC/AML and secure closing coordinated by ShipScout with Congar legal support." },
];

const HOW_BUYER = [
  { n: "01", title: "Apply for access", body: "Submit your acquisition criteria, company details and certifications. We verify every buyer." },
  { n: "02", title: "See qualified opportunities", body: "Access anonymous vessel opportunities matched to your criteria — before they reach the open market." },
  { n: "03", title: "Express interest", body: "Shortlist vessels. Owner approves disclosure. NDA executed. Full details released." },
  { n: "04", title: "Submit offers & close", body: "Structured offer process, deal room, document access and secure closing support." },
];

const TRUST = [
  { icon: "🔒", title: "Fully confidential", body: "Owner identity and vessel details are never shared without explicit consent. Calculator use creates no listing." },
  { icon: "✓", title: "Verified buyers only", body: "Every recycling yard and cash buyer is screened for KYC, sanctions, financial capacity and certifications." },
  { icon: "⚖", title: "Legal & compliance", body: "Congar provides independent legal review, KYC/AML, sanctions screening and secure closing coordination." },
  { icon: "📊", title: "Real market data", body: "Live AIS monitoring, real-time scrap benchmarks and independent LDT valuation — not brokerage estimates." },
];

export default function HomePage() {
  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", color: "#0F172A" }}>

      {/* ── HERO ─────────────────────────────── */}
      <section style={{
        background: "linear-gradient(135deg, #07122E 0%, #0d1f4a 100%)",
        padding: "88px 24px 100px",
        textAlign: "center",
      }}>
        <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", color: "#C9A84C", textTransform: "uppercase", marginBottom: 20 }}>
          Vessel Transaction Platform
        </p>
        <h1 style={{ fontSize: "clamp(28px, 5vw, 52px)", fontWeight: 800, color: "#fff", lineHeight: 1.15, margin: "0 auto 20px", maxWidth: 720, letterSpacing: -1 }}>
          Direct vessel opportunities.<br />
          <span style={{ color: "#C9A84C" }}>Verified buyers.</span> Secure transactions.
        </h1>
        <p style={{ fontSize: 18, color: "rgba(255,255,255,0.7)", maxWidth: 540, margin: "0 auto 44px", lineHeight: 1.65 }}>
          ShipScout connects shipowners directly with verified recycling yards
          and cash buyers for confidential vessel sales and recycling transactions.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/shipowners" style={{
            background: "#C9A84C", color: "#07122E", padding: "15px 32px",
            borderRadius: 8, fontWeight: 700, fontSize: 16, textDecoration: "none",
          }}>
            Submit a Vessel →
          </Link>
          <Link href="/buyers" style={{
            background: "rgba(255,255,255,0.1)", color: "#fff",
            border: "1px solid rgba(255,255,255,0.25)",
            padding: "15px 32px", borderRadius: 8, fontWeight: 600,
            fontSize: 16, textDecoration: "none",
          }}>
            Buyer Access
          </Link>
        </div>
        <p style={{ marginTop: 20, fontSize: 13, color: "rgba(255,255,255,0.35)" }}>
          Free · Confidential · No obligation
        </p>
      </section>

      {/* ── STATS ─────────────────────────────── */}
      <section style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0", padding: "28px 24px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 20 }}>
          {STATS.map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#07122E" }}>{s.value}</div>
              <div style={{ fontSize: 13, color: "#64748B", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────── */}
      <section style={{ padding: "80px 24px", background: "#fff" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <p style={{ textAlign: "center", fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", color: "#C9A84C", textTransform: "uppercase", marginBottom: 12 }}>
            How It Works
          </p>
          <h2 style={{ textAlign: "center", fontSize: 30, fontWeight: 700, color: "#07122E", margin: "0 0 56px" }}>
            Two sides. One secure platform.
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>

            <div style={{ paddingRight: 48 }}>
              <div style={{ background: "#07122E", color: "#C9A84C", padding: "6px 14px", borderRadius: 6, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", display: "inline-block", marginBottom: 28, textTransform: "uppercase" }}>
                For Shipowners
              </div>
              {HOW_OWNER.map(s => (
                <div key={s.n} style={{ display: "flex", gap: 16, marginBottom: 28 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#C9A84C", minWidth: 28, paddingTop: 1 }}>{s.n}</div>
                  <div>
                    <div style={{ fontWeight: 600, color: "#0F172A", marginBottom: 4 }}>{s.title}</div>
                    <div style={{ fontSize: 14, color: "#64748B", lineHeight: 1.6 }}>{s.body}</div>
                  </div>
                </div>
              ))}
              <Link href="/shipowners" style={{
                display: "inline-block", marginTop: 4,
                background: "#07122E", color: "#fff",
                padding: "11px 22px", borderRadius: 7,
                fontSize: 14, fontWeight: 600, textDecoration: "none",
              }}>
                Estimate my vessel →
              </Link>
            </div>

            <div style={{ borderLeft: "1px solid #E2E8F0", paddingLeft: 48 }}>
              <div style={{ background: "#F0F9F6", color: "#0D6E54", padding: "6px 14px", borderRadius: 6, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", display: "inline-block", marginBottom: 28, textTransform: "uppercase" }}>
                For Recycling Yards & Cash Buyers
              </div>
              {HOW_BUYER.map(s => (
                <div key={s.n} style={{ display: "flex", gap: 16, marginBottom: 28 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0D6E54", minWidth: 28, paddingTop: 1 }}>{s.n}</div>
                  <div>
                    <div style={{ fontWeight: 600, color: "#0F172A", marginBottom: 4 }}>{s.title}</div>
                    <div style={{ fontSize: 14, color: "#64748B", lineHeight: 1.6 }}>{s.body}</div>
                  </div>
                </div>
              ))}
              <Link href="/buyers" style={{
                display: "inline-block", marginTop: 4,
                background: "#0D6E54", color: "#fff",
                padding: "11px 22px", borderRadius: 7,
                fontSize: 14, fontWeight: 600, textDecoration: "none",
              }}>
                Apply for buyer access →
              </Link>
            </div>

          </div>
        </div>
      </section>

      {/* ── EXAMPLE OPPORTUNITY ───────────────── */}
      <section style={{ background: "#F8FAFC", padding: "72px 24px", borderTop: "1px solid #E2E8F0" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", textAlign: "center" }}>
          <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", color: "#64748B", textTransform: "uppercase", marginBottom: 12 }}>
            Example Opportunity
          </p>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "#07122E", margin: "0 0 8px" }}>
            What verified buyers see
          </h2>
          <p style={{ fontSize: 15, color: "#64748B", margin: "0 0 32px", lineHeight: 1.6 }}>
            Owner identity and vessel name remain confidential until explicit disclosure approval.
          </p>

          <div style={{
            background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12,
            padding: "28px 28px", textAlign: "left",
            boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A" }}>
                28-year-old Bulk Carrier
              </div>
              <span style={{ background: "#FEF9EE", border: "1px solid #F5D87A", borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 700, color: "#92400E" }}>
                REVIEWING OFFERS
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
              {[
                ["LDT", "12,400 t"],
                ["Delivery", "Mediterranean"],
                ["Availability", "Q4 2026"],
                ["Est. value", "$4.8M – $5.2M"],
              ].map(([label, val]) => (
                <div key={label} style={{ background: "#F8FAFC", padding: "10px 12px", borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", marginTop: 3 }}>{val}</div>
                </div>
              ))}
            </div>

            <div style={{ background: "#F1F5F9", borderRadius: 8, padding: "11px 14px", fontSize: 13, color: "#475569" }}>
              🔒 Owner identity, vessel name, exact position and documents available after NDA and owner approval.
            </div>
          </div>
        </div>
      </section>

      {/* ── TRUST ─────────────────────────────── */}
      <section style={{ background: "#07122E", padding: "72px 24px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <p style={{ textAlign: "center", fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", color: "#C9A84C", textTransform: "uppercase", marginBottom: 12 }}>
            Why ShipScout
          </p>
          <h2 style={{ textAlign: "center", fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 44px" }}>
            Built for high-value, confidential transactions
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {TRUST.map(t => (
              <div key={t.title} style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.09)",
                borderRadius: 12, padding: "22px",
              }}>
                <div style={{ fontSize: 22, marginBottom: 10 }}>{t.icon}</div>
                <div style={{ fontWeight: 600, color: "#fff", marginBottom: 6 }}>{t.title}</div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", lineHeight: 1.65 }}>{t.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────── */}
      <section style={{ background: "#F8FAFC", padding: "72px 24px", textAlign: "center", borderTop: "1px solid #E2E8F0" }}>
        <h2 style={{ fontSize: 26, fontWeight: 700, color: "#07122E", margin: "0 0 10px" }}>
          Ready to get started?
        </h2>
        <p style={{ fontSize: 15, color: "#64748B", margin: "0 0 28px" }}>
          Shipowners estimate for free. Buyers apply for verified access.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/shipowners" style={{
            background: "#07122E", color: "#fff",
            padding: "13px 28px", borderRadius: 8,
            fontWeight: 700, fontSize: 15, textDecoration: "none",
          }}>
            Submit a Vessel
          </Link>
          <Link href="/buyers" style={{
            background: "#fff", color: "#07122E",
            border: "1px solid #CBD5E1",
            padding: "13px 28px", borderRadius: 8,
            fontWeight: 600, fontSize: 15, textDecoration: "none",
          }}>
            Buyer Access
          </Link>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────── */}
      <footer style={{ background: "#07122E", borderTop: "1px solid rgba(255,255,255,0.08)", padding: "28px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#fff", letterSpacing: -0.3 }}>
            Ship<span style={{ color: "#C9A84C" }}>Scout</span>
          </span>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {[
              ["How It Works", "/how-it-works"],
              ["Shipowners", "/shipowners"],
              ["Buyers", "/buyers"],
              ["Contact", "mailto:hello@shipscout.io"],
            ].map(([label, href]) => (
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
