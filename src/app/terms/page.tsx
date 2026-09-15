import Link from "next/link";

const NAVY = "#07122E";
const GOLD = "#C9A84C";
const SERIF = "var(--font-serif), Georgia, serif";

const LAST_UPDATED = "13 September 2026";

export default function TermsPage() {
  return (
    <div style={{ background: "#F8FAFC", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ background: NAVY, padding: "48px 40px 40px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: GOLD, textTransform: "uppercase", marginBottom: 12 }}>
            Legal
          </p>
          <h1 style={{ fontFamily: SERIF, fontSize: "clamp(28px, 3vw, 42px)", fontWeight: 700, color: "#fff", margin: "0 0 12px" }}>
            Terms of Service
          </h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", margin: 0 }}>
            Last updated: {LAST_UPDATED}
          </p>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "56px 40px 80px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 40, fontSize: 15, color: "#374151", lineHeight: 1.8 }}>

          <Section title="1. About ShipScout">
            <p>
              ShipScout is a maritime brokerage and intelligence platform operated by <strong>Turqomarine</strong>.
              By accessing shipscout.io or submitting an inquiry, you agree to these Terms of Service.
              If you do not agree, please do not use the platform.
            </p>
          </Section>

          <Section title="2. Services provided">
            <p>ShipScout provides:</p>
            <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
              <li>Vessel sourcing, introduction, and brokerage services for buyers and sellers</li>
              <li>Pre-purchase inspection coordination with certified marine surveyors</li>
              <li>Deal negotiation, escrow coordination, and transaction support</li>
              <li>Maritime intelligence including AIS signals, PSC detention records, and market data</li>
              <li>A vessel listing database sourced from publicly available maritime listings</li>
            </ul>
            <p>
              ShipScout is a brokerage intermediary. We facilitate transactions but are not a party to
              any sale or purchase agreement between buyer and seller.
            </p>
          </Section>

          <Section title="3. No upfront fees">
            <p>
              ShipScout does not charge upfront fees for its brokerage services. We earn a commission
              only upon successful completion of a transaction. The commission rate will be agreed in
              writing before any deal is progressed.
            </p>
          </Section>

          <Section title="4. Vessel data and accuracy">
            <p>
              Vessel data shown on ShipScout — including AIS position, age, deadweight, detention records,
              and estimated scrap values — is sourced from third-party maritime databases and public records.
              This data is provided for informational purposes only.
            </p>
            <p>
              <strong>ShipScout makes no warranty</strong> as to the accuracy, completeness, or timeliness
              of vessel data. Data may be delayed, incomplete, or contain errors. You should independently
              verify all material information before making any commercial decision.
            </p>
          </Section>

          <Section title="5. Price estimates">
            <p>
              Any scrap value, LDT price, or vessel valuation shown on ShipScout is an estimate based on
              publicly available market data. These figures are indicative only and do not constitute a
              formal valuation, offer, or financial advice.
            </p>
            <p>
              Actual prices may differ materially based on vessel condition, market conditions, flag state,
              classification status, and negotiation. ShipScout is not liable for any loss arising from
              reliance on estimated figures.
            </p>
          </Section>

          <Section title="6. Vessel listings">
            <p>
              The vessels listed in the "For Sale" section are sourced from publicly available third-party
              listing platforms. ShipScout does not represent the sellers of these vessels and does not
              guarantee that any listed vessel is available, accurately described, or free from encumbrances.
            </p>
            <p>
              Contact us to verify availability or request further details before entering into any commitment.
            </p>
          </Section>

          <Section title="7. Confidentiality">
            <p>
              All deal-specific information shared between ShipScout and a client — including vessel identities,
              pricing discussions, and counterparty details — is treated as strictly confidential.
              Nothing will be disclosed to any third party without explicit written consent from the relevant party.
            </p>
          </Section>

          <Section title="8. Broker partners">
            <p>
              Registered broker partners access ShipScout's platform under a separate Partner Agreement.
              Broker accounts are personal and non-transferable. ShipScout reserves the right to suspend
              or terminate broker access for breach of the Partner Agreement or these Terms.
            </p>
          </Section>

          <Section title="9. Acceptable use">
            <p>You agree not to:</p>
            <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
              <li>Use ShipScout to facilitate transactions involving sanctioned vessels, entities, or jurisdictions</li>
              <li>Scrape, copy, or redistribute vessel data or contact information from the platform</li>
              <li>Attempt to circumvent ShipScout's role in a transaction introduced by ShipScout</li>
              <li>Provide false or misleading information in any inquiry or registration</li>
            </ul>
          </Section>

          <Section title="10. Limitation of liability">
            <p>
              To the fullest extent permitted by applicable law, ShipScout and Turqomarine shall not be
              liable for any indirect, incidental, consequential, or punitive damages arising from use of
              the platform or reliance on any information provided, including but not limited to loss of
              profit, loss of a transaction, or damage to business reputation.
            </p>
            <p>
              Our total liability to you for any claim arising from use of ShipScout shall not exceed the
              commission or fees actually paid by you to ShipScout in the six months preceding the claim.
            </p>
          </Section>

          <Section title="11. Sanctions compliance">
            <p>
              ShipScout operates in full compliance with applicable international sanctions regimes,
              including OFAC, EU, and UN sanctions lists. We will not knowingly facilitate transactions
              involving sanctioned parties or vessels. If you have reason to believe a vessel or counterparty
              may be subject to sanctions, you must notify us immediately.
            </p>
          </Section>

          <Section title="12. Governing law">
            <p>
              These Terms are governed by the laws of the Republic of Turkey. Any disputes shall be subject
              to the exclusive jurisdiction of the courts of Istanbul, Turkey, unless otherwise agreed in writing.
            </p>
          </Section>

          <Section title="13. Changes to these Terms">
            <p>
              We may update these Terms at any time. Material changes will be reflected in the "Last updated"
              date at the top of this page. Continued use of ShipScout after changes are posted constitutes
              your acceptance of the revised Terms.
            </p>
          </Section>

          <Section title="14. Contact">
            <p>
              For questions about these Terms, please contact us at{" "}
              <a href="mailto:info@turqomarine.com" style={{ color: NAVY }}>info@turqomarine.com</a>.
            </p>
          </Section>

          <div style={{ borderTop: "1px solid #E2E8F0", paddingTop: 32 }}>
            <p style={{ color: "#94A3B8", fontSize: 14 }}>
              Also read our{" "}
              <Link href="/privacy" style={{ color: NAVY }}>Privacy Policy</Link>.
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
