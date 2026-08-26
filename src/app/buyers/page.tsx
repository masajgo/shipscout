"use client";
import { useState } from "react";

const INPUT = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} style={{
    width: "100%", boxSizing: "border-box",
    border: "1px solid #CBD5E1", borderRadius: 7, padding: "10px 14px",
    fontSize: 14, color: "#0F172A", background: "#fff", outline: "none",
    ...props.style,
  }} />
);

const LABEL = ({ children }: { children: React.ReactNode }) => (
  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
    {children}
  </label>
);

const VESSEL_TYPES = ["Bulk Carrier", "Tanker", "Container", "General Cargo", "Ro-Ro", "Vehicles Carrier", "Reefer", "All types"];

export default function BuyersPage() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  const [form, setForm] = useState({
    company: "", country: "", contact_name: "", email: "", phone: "",
    buyer_type: "recycling_yard", dwt_min: "", dwt_max: "",
    annual_volume: "", certifications: "", notes: "",
  });

  function toggleType(t: string) {
    setSelectedTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setError("");
    try {
      const res = await fetch("/api/apply-buyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          vessel_types: selectedTypes.join(", "),
          dwt_min: form.dwt_min ? parseInt(form.dwt_min) : null,
          dwt_max: form.dwt_max ? parseInt(form.dwt_max) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Submission failed."); return; }
      setSubmitted(true);
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", color: "#0F172A" }}>

      {/* Header */}
      <section style={{ background: "linear-gradient(135deg, #07122E 0%, #0d1f4a 100%)", padding: "56px 24px 64px", textAlign: "center" }}>
        <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", color: "#C9A84C", textTransform: "uppercase", marginBottom: 14 }}>
          For Recycling Yards & Cash Buyers
        </p>
        <h1 style={{ fontSize: "clamp(24px, 4vw, 40px)", fontWeight: 800, color: "#fff", margin: "0 0 14px", letterSpacing: -0.5 }}>
          Access qualified vessel opportunities directly from shipowners
        </h1>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.65)", maxWidth: 500, margin: "0 auto", lineHeight: 1.65 }}>
          Verified vessel opportunities matched to your acquisition criteria.
          Review, offer and close — before opportunities reach the open market.
        </p>
      </section>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "48px 24px 80px", display: "grid", gridTemplateColumns: "1fr 320px", gap: 32, alignItems: "start" }}>

        {/* Form */}
        {submitted ? (
          <div style={{ gridColumn: "span 2", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: "56px 32px", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 12px" }}>Application received</h2>
            <p style={{ fontSize: 15, color: "#64748B", maxWidth: 400, margin: "0 auto", lineHeight: 1.65 }}>
              We will review your application and contact you within <strong>1 business day</strong>.
              Approved buyers receive access to our verified opportunity pipeline.
            </p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: "28px", marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 20px" }}>Company information</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={{ gridColumn: "span 2" }}>
                  <LABEL>Company name *</LABEL>
                  <INPUT required value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="Your company name" />
                </div>
                <div><LABEL>Country</LABEL><INPUT value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} placeholder="Turkey, Bangladesh…" /></div>
                <div>
                  <LABEL>Buyer type *</LABEL>
                  <select required value={form.buyer_type} onChange={e => setForm(f => ({ ...f, buyer_type: e.target.value }))}
                    style={{ width: "100%", border: "1px solid #CBD5E1", borderRadius: 7, padding: "10px 14px", fontSize: 14, color: "#0F172A", background: "#fff", outline: "none" }}>
                    <option value="recycling_yard">Recycling Yard</option>
                    <option value="cash_buyer">Cash Buyer</option>
                  </select>
                </div>
                <div><LABEL>Contact person *</LABEL><INPUT required value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Full name" /></div>
                <div><LABEL>Corporate email *</LABEL><INPUT required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="name@company.com" /></div>
                <div style={{ gridColumn: "span 2" }}>
                  <LABEL>Phone / WhatsApp</LABEL>
                  <INPUT value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+90 232 555 0100" />
                </div>
              </div>
            </div>

            <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: "28px", marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 20px" }}>Acquisition criteria</h3>
              <div style={{ marginBottom: 16 }}>
                <LABEL>Target vessel types</LABEL>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 2 }}>
                  {VESSEL_TYPES.map(t => (
                    <button type="button" key={t} onClick={() => toggleType(t)} style={{
                      padding: "6px 12px", borderRadius: 6, fontSize: 13, cursor: "pointer",
                      border: selectedTypes.includes(t) ? "2px solid #07122E" : "1px solid #CBD5E1",
                      background: selectedTypes.includes(t) ? "#07122E" : "#fff",
                      color: selectedTypes.includes(t) ? "#fff" : "#475569",
                      fontWeight: selectedTypes.includes(t) ? 600 : 400,
                    }}>{t}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                <div><LABEL>DWT min</LABEL><INPUT type="number" value={form.dwt_min} onChange={e => setForm(f => ({ ...f, dwt_min: e.target.value }))} placeholder="5,000" /></div>
                <div><LABEL>DWT max</LABEL><INPUT type="number" value={form.dwt_max} onChange={e => setForm(f => ({ ...f, dwt_max: e.target.value }))} placeholder="100,000" /></div>
                <div>
                  <LABEL>Annual volume</LABEL>
                  <select value={form.annual_volume} onChange={e => setForm(f => ({ ...f, annual_volume: e.target.value }))}
                    style={{ width: "100%", border: "1px solid #CBD5E1", borderRadius: 7, padding: "10px 14px", fontSize: 14, color: "#0F172A", background: "#fff", outline: "none" }}>
                    <option value="">Select…</option>
                    <option value="1-5">1–5 vessels/year</option>
                    <option value="5-15">5–15 vessels/year</option>
                    <option value="15+">15+ vessels/year</option>
                  </select>
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <LABEL>Certifications (ISRS, ISO, Hong Kong Convention…)</LABEL>
                <INPUT value={form.certifications} onChange={e => setForm(f => ({ ...f, certifications: e.target.value }))} placeholder="List relevant certifications" />
              </div>
              <div style={{ marginTop: 14 }}>
                <LABEL>Additional notes</LABEL>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Preferred delivery regions, any other acquisition criteria…"
                  style={{ width: "100%", boxSizing: "border-box", border: "1px solid #CBD5E1", borderRadius: 7, padding: "10px 14px", fontSize: 14, minHeight: 72, resize: "vertical", outline: "none" }}
                />
              </div>
            </div>

            {error && <p style={{ color: "#DC2626", fontSize: 13, marginBottom: 12 }}>{error}</p>}

            <button type="submit" disabled={submitting} style={{
              width: "100%", background: "#07122E", color: "#fff",
              border: "none", borderRadius: 10, padding: "16px",
              fontSize: 16, fontWeight: 700, cursor: "pointer",
            }}>
              {submitting ? "Submitting…" : "Apply for Buyer Access →"}
            </button>
            <p style={{ textAlign: "center", fontSize: 12, color: "#94A3B8", marginTop: 10 }}>
              We review all applications within 1 business day. KYC and verification required.
            </p>
          </form>
        )}

        {/* Sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: "#07122E", borderRadius: 12, padding: "22px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#C9A84C", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
              What you get
            </div>
            {[
              ["✓", "Verified opportunities before open market"],
              ["✓", "Anonymous vessel details matched to your criteria"],
              ["✓", "Direct contact after owner approval"],
              ["✓", "Structured offer process & deal room"],
              ["✓", "Legal & KYC support via Congar"],
            ].map(([icon, text]) => (
              <div key={text} style={{ display: "flex", gap: 10, marginBottom: 10, fontSize: 13, color: "rgba(255,255,255,0.75)", alignItems: "flex-start" }}>
                <span style={{ color: "#C9A84C", fontWeight: 700, marginTop: 1 }}>{icon}</span>
                <span style={{ lineHeight: 1.5 }}>{text}</span>
              </div>
            ))}
          </div>

          <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: "20px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>Example opportunity</div>
            <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.7 }}>
              28-year-old Bulk Carrier<br />
              12,400 LDT · Mediterranean<br />
              Q4 2026 availability<br />
              <strong style={{ color: "#0F172A" }}>Est. $4.8M – $5.2M</strong>
            </div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 10 }}>
              Owner identity disclosed only after NDA and your interest confirmation.
            </div>
          </div>

          <div style={{ background: "#F0F9F6", border: "1px solid #A7F3D0", borderRadius: 12, padding: "20px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#065F46", marginBottom: 8 }}>Questions?</div>
            <p style={{ fontSize: 13, color: "#047857", margin: 0, lineHeight: 1.6 }}>
              Contact us directly at{" "}
              <a href="mailto:hello@shipscout.io" style={{ color: "#047857", fontWeight: 600 }}>
                hello@shipscout.io
              </a>
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
