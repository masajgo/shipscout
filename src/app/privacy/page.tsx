import Link from "next/link";

const NAVY = "#07122E";
const GOLD = "#C9A84C";
const SERIF = "var(--font-serif), Georgia, serif";

const LAST_UPDATED = "13 September 2026";

export default function PrivacyPage() {
  return (
    <div style={{ background: "#F8FAFC", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ background: NAVY, padding: "48px 40px 40px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: GOLD, textTransform: "uppercase", marginBottom: 12 }}>
            Legal
          </p>
          <h1 style={{ fontFamily: SERIF, fontSize: "clamp(28px, 3vw, 42px)", fontWeight: 700, color: "#fff", margin: "0 0 12px" }}>
            Privacy Policy
          </h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", margin: 0 }}>
            Last updated: {LAST_UPDATED}
          </p>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "56px 40px 80px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 40, fontSize: 15, color: "#374151", lineHeight: 1.8 }}>

          <Section title="1. Who we are">
            <p>
              ShipScout is a maritime brokerage platform operated by <strong>Turqomarine</strong>.
              We connect shipowners, cash buyers, and recycling yards for confidential vessel transactions.
              When this policy says "ShipScout", "we", "us", or "our", it refers to Turqomarine and the
              shipscout.io platform.
            </p>
            <p>
              Contact us at: <a href="mailto:info@turqomarine.com" style={{ color: NAVY }}>info@turqomarine.com</a>
            </p>
          </Section>

          <Section title="2. What data we collect">
            <p>We only collect personal data you provide directly to us:</p>
            <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
              <li><strong>Contact form</strong> — your name, company name, email address, the nature of your inquiry, and any message you write.</li>
              <li><strong>Email correspondence</strong> — if you contact us by email, we retain that correspondence.</li>
              <li><strong>Broker registration</strong> — if you register as a broker partner, we collect your name, company, and email.</li>
            </ul>
            <p>
              We do <strong>not</strong> collect payment data, passport or ID information, or any sensitive personal categories of data.
            </p>
          </Section>

          <Section title="3. How we use your data">
            <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
              <li>To respond to your inquiry or deal request</li>
              <li>To match buyers and sellers for specific vessel transactions</li>
              <li>To send you information you have requested about a vessel or transaction</li>
              <li>To maintain a record of our communications</li>
            </ul>
            <p>
              We do not use your data for unsolicited marketing, and we do not sell your data to any third party.
            </p>
          </Section>

          <Section title="4. Legal basis (GDPR)">
            <p>
              If you are located in the European Economic Area, we process your personal data under the following legal bases:
            </p>
            <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
              <li><strong>Contractual necessity</strong> — to fulfil a brokerage inquiry or deal you have initiated.</li>
              <li><strong>Legitimate interests</strong> — to maintain business communications and prevent fraud.</li>
              <li><strong>Consent</strong> — where you have opted in to receive specific communications.</li>
            </ul>
          </Section>

          <Section title="5. Third-party processors">
            <p>We share data with the following service providers solely to operate the platform:</p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#F1F5F9", textAlign: "left" }}>
                  <th style={{ padding: "10px 14px", fontWeight: 600, color: NAVY }}>Provider</th>
                  <th style={{ padding: "10px 14px", fontWeight: 600, color: NAVY }}>Purpose</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Resend", "Transactional email delivery (contact form notifications)"],
                  ["Vercel", "Website hosting and infrastructure"],
                  ["Datalastic", "Vessel AIS data and maritime intelligence"],
                ].map(([name, purpose], i) => (
                  <tr key={name} style={{ borderTop: "1px solid #E2E8F0", background: i % 2 ? "#F8FAFC" : "#fff" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600 }}>{name}</td>
                    <td style={{ padding: "10px 14px", color: "#64748B" }}>{purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              These processors act under data processing agreements and are not permitted to use your data for their own purposes.
            </p>
          </Section>

          <Section title="6. Vessel and company data">
            <p>
              ShipScout monitors publicly available AIS signals, port state control records, and maritime news sources.
              This vessel and company data relates to commercial entities, not private individuals, and is sourced from
              public maritime databases. It is not subject to GDPR personal data protections.
            </p>
          </Section>

          <Section title="7. Data retention">
            <p>
              We retain contact form submissions and email correspondence for up to <strong>3 years</strong> from the date of
              last contact, or for the duration of any active transaction, whichever is longer. After this period, data is deleted.
            </p>
          </Section>

          <Section title="8. Your rights">
            <p>You have the right to:</p>
            <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
              <li><strong>Access</strong> — request a copy of the personal data we hold about you</li>
              <li><strong>Rectification</strong> — ask us to correct inaccurate data</li>
              <li><strong>Erasure</strong> — ask us to delete your personal data</li>
              <li><strong>Restriction</strong> — ask us to limit how we use your data</li>
              <li><strong>Portability</strong> — receive your data in a structured, machine-readable format</li>
              <li><strong>Objection</strong> — object to processing based on legitimate interests</li>
            </ul>
            <p>
              To exercise any of these rights, email us at{" "}
              <a href="mailto:info@turqomarine.com" style={{ color: NAVY }}>info@turqomarine.com</a>.
              We will respond within 30 days.
            </p>
          </Section>

          <Section title="9. Cookies">
            <p>
              ShipScout does not use tracking or advertising cookies. We may use strictly necessary session cookies
              required for the platform to function (e.g. broker authentication). These are not used for analytics
              or cross-site tracking.
            </p>
          </Section>

          <Section title="10. Security">
            <p>
              We use industry-standard measures to protect your data, including encrypted connections (HTTPS),
              access controls, and regular security reviews. No transmission over the internet is 100% secure,
              but we take all reasonable precautions.
            </p>
          </Section>

          <Section title="11. Changes to this policy">
            <p>
              We may update this policy from time to time. Material changes will be noted at the top of this page
              with a new "Last updated" date. Continued use of ShipScout after changes constitutes acceptance.
            </p>
          </Section>

          <div style={{ borderTop: "1px solid #E2E8F0", paddingTop: 32 }}>
            <p style={{ color: "#94A3B8", fontSize: 14 }}>
              Questions? Contact us at{" "}
              <a href="mailto:info@turqomarine.com" style={{ color: NAVY }}>info@turqomarine.com</a>
              {" "}or read our{" "}
              <Link href="/terms" style={{ color: NAVY }}>Terms of Service</Link>.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: NAVY, margin: "0 0 16px" }}>
        {title}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {children}
      </div>
    </div>
  );
}
