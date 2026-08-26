import Link from "next/link";

const OWNER_STEPS = [
  { n: "01", title: "Estimate your vessel value", body: "Enter your IMO number. We instantly retrieve vessel specifications and calculate an indicative recycling value based on live yard benchmarks — free and with no obligation." },
  { n: "02", title: "Submit confidentially", body: "Choose to submit your vessel for verified offers. Your identity and vessel details are never shared without your explicit approval. No public listing is created." },
  { n: "03", title: "Identity & authority verification", body: "ShipScout verifies your identity and authority to represent the vessel. This protects both sides and ensures only legitimate transactions proceed." },
  { n: "04", title: "Receive indicative offers", body: "Within 24 hours, we return indicative offers from verified recycling yards and cash buyers matched to your vessel. Review all offers on equal terms." },
  { n: "05", title: "Approve disclosure", body: "You decide which buyers may see your full vessel details. Only after your explicit approval are identity, documents and exact position shared." },
  { n: "06", title: "NDA & secure deal room", body: "NDA executed. A secure deal room is opened with full vessel documentation, class certificates and relevant commercial information." },
  { n: "07", title: "Close securely", body: "Legal review by Congar, KYC/AML and sanctions screening, MOA execution, secure payment and delivery coordination — all managed through ShipScout." },
];

const BUYER_STEPS = [
  { n: "01", title: "Apply for buyer access", body: "Submit your acquisition criteria, company details and certifications. We verify every buyer for KYC, sanctions compliance, financial capacity and relevant certifications." },
  { n: "02", title: "Receive matched opportunities", body: "Access anonymous vessel opportunities matched to your DWT range, vessel type and delivery preferences — before they appear on the open market." },
  { n: "03", title: "Express interest", body: "Shortlist vessels that match your criteria. Your interest is logged confidentially. Shipowner is notified that a verified buyer has expressed interest." },
  { n: "04", title: "Owner approves disclosure", body: "Shipowner reviews buyer profile and approves disclosure. NDA is executed. Full vessel details, documents and owner identity are released." },
  { n: "05", title: "Submit indicative offer", body: "Review full vessel information in the secure deal room. Submit your indicative offer with price, delivery terms and conditions." },
  { n: "06", title: "Due diligence & KYC review", body: "Congar conducts independent KYC/AML, sanctions screening and legal review for both parties. All compliance requirements verified." },
  { n: "07", title: "MOA, payment & secure closing", body: "Memorandum of Agreement executed. Secure payment coordination and delivery management — with legal support throughout the closing process." },
];

const PRINCIPLES = [
  { title: "Confidentiality by design", body: "Owner identity, vessel name, exact position and documents are never shared without explicit consent at each stage. Calculator use creates no listing." },
  { title: "Verified buyers only", body: "Every recycling yard and cash buyer is screened for KYC, sanctions, financial capacity and certifications before receiving any opportunity access." },
  { title: "Owner-controlled disclosure", body: "Shipowners control exactly what is shared and with whom. Each disclosure requires explicit approval. Offers can be reviewed before any identity is revealed." },
  { title: "24-month non-circumvention", body: "All parties agree to non-circumvention terms. Transactions introduced through ShipScout are protected for 24 months regardless of flag, name or structure changes." },
  { title: "Independent legal support", body: "Congar provides independent legal review, KYC/AML compliance, sanctions screening, MOA drafting and secure closing coordination." },
  { title: "Real market data", body: "Live AIS monitoring, independent LDT assessment and real-time yard benchmarks — not brokerage estimates or indicative market chatter." },
];

export default function HowItWorksPage() {
  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", color: "#0F172A" }}>

      {/* Header */}
      <section style={{ background: "linear-gradient(135deg, #07122E 0%, #0d1f4a 100%)", padding: "64px 24px 72px", textAlign: "center" }}>
        <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", color: "#C9A84C", textTransform: "uppercase", marginBottom: 14 }}>
          The Process
        </p>
        <h1 style={{ fontSize: "clamp(26px, 4vw, 44px)", fontWeight: 800, color: "#fff", margin: "0 0 16px", letterSpacing: -0.5 }}>
          How ShipScout works
        </h1>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.65)", maxWidth: 520, margin: "0 auto", lineHeight: 1.65 }}>
          A controlled, confidential process from first estimate to secure closing —
          with verified buyers and independent legal support at every stage.
        </p>
      </section>

      {/* North-star flow */}
      <section style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0", padding: "28px 24px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 0 }}>
            {["Estimate value", "Submit confidentially", "Receive verified offers", "Close securely"].map((step, i, arr) => (
              <div key={step} style={{ display: "flex", alignItems: "center" }}>
                <div style={{ textAlign: "center", padding: "8px 16px" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#07122E" }}>{step}</div>
                </div>
                {i < arr.length - 1 && (
                  <div style={{ fontSize: 18, color: "#C9A84C", padding: "0 4px" }}>→</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Two-column steps */}
      <section style={{ padding: "72px 24px", background: "#fff" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56 }}>

          {/* Owners */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
              <div style={{ background: "#07122E", color: "#C9A84C", padding: "6px 14px", borderRadius: 6, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                For Shipowners
              </div>
            </div>
            {OWNER_STEPS.map((s, i) => (
              <div key={s.n} style={{ display: "flex", gap: 18, marginBottom: 28, paddingBottom: 28, borderBottom: i < OWNER_STEPS.length - 1 ? "1px solid #F1F5F9" : "none" }}>
                <div style={{ minWidth: 36, height: 36, background: "#07122E", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#C9A84C", flexShrink: 0 }}>
                  {s.n}
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: "#0F172A", marginBottom: 6 }}>{s.title}</div>
                  <div style={{ fontSize: 14, color: "#64748B", lineHeight: 1.65 }}>{s.body}</div>
                </div>
              </div>
            ))}
            <Link href="/shipowners" style={{
              display: "inline-block", background: "#07122E", color: "#fff",
              padding: "12px 24px", borderRadius: 8, fontSize: 14,
              fontWeight: 700, textDecoration: "none", marginTop: 8,
            }}>
              Estimate my vessel →
            </Link>
          </div>

          {/* Buyers */}
          <div style={{ borderLeft: "1px solid #E2E8F0", paddingLeft: 56 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
              <div style={{ background: "#0D6E54", color: "#fff", padding: "6px 14px", borderRadius: 6, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                For Recycling Yards & Cash Buyers
              </div>
            </div>
            {BUYER_STEPS.map((s, i) => (
              <div key={s.n} style={{ display: "flex", gap: 18, marginBottom: 28, paddingBottom: 28, borderBottom: i < BUYER_STEPS.length - 1 ? "1px solid #F1F5F9" : "none" }}>
                <div style={{ minWidth: 36, height: 36, background: "#0D6E54", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                  {s.n}
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: "#0F172A", marginBottom: 6 }}>{s.title}</div>
                  <div style={{ fontSize: 14, color: "#64748B", lineHeight: 1.65 }}>{s.body}</div>
                </div>
              </div>
            ))}
            <Link href="/buyers" style={{
              display: "inline-block", background: "#0D6E54", color: "#fff",
              padding: "12px 24px", borderRadius: 8, fontSize: 14,
              fontWeight: 700, textDecoration: "none", marginTop: 8,
            }}>
              Apply for buyer access →
            </Link>
          </div>

        </div>
      </section>

      {/* Principles */}
      <section style={{ background: "#07122E", padding: "72px 24px" }}>
        <div style={{ maxWidth: 940, margin: "0 auto" }}>
          <p style={{ textAlign: "center", fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", color: "#C9A84C", textTransform: "uppercase", marginBottom: 12 }}>
            Platform Principles
          </p>
          <h2 style={{ textAlign: "center", fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 44px" }}>
            Confidential. Verified. Secure.
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
            {PRINCIPLES.map(p => (
              <div key={p.title} style={{
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
                borderRadius: 12, padding: "22px",
              }}>
                <div style={{ fontWeight: 600, color: "#fff", marginBottom: 8 }}>{p.title}</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.65 }}>{p.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: "#F8FAFC", padding: "64px 24px", textAlign: "center", borderTop: "1px solid #E2E8F0" }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: "#07122E", margin: "0 0 10px" }}>
          Ready to get started?
        </h2>
        <p style={{ fontSize: 15, color: "#64748B", margin: "0 0 28px" }}>
          Shipowners estimate for free. Buyers apply for verified access.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/shipowners" style={{
            background: "#07122E", color: "#fff", padding: "13px 28px",
            borderRadius: 8, fontWeight: 700, fontSize: 15, textDecoration: "none",
          }}>
            Submit a Vessel
          </Link>
          <Link href="/buyers" style={{
            background: "#fff", color: "#07122E", border: "1px solid #CBD5E1",
            padding: "13px 28px", borderRadius: 8, fontWeight: 600,
            fontSize: 15, textDecoration: "none",
          }}>
            Buyer Access
          </Link>
        </div>
      </section>

    </div>
  );
}
