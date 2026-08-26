"use client";
import { useState } from "react";

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M`;
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
}

type CalcResult = {
  imo: string; name: string; type: string; flag: string | null;
  built_year: number | null; age: number | null;
  ldt: number | null; deadweight: number | null;
  price_category: string;
  estimates: Record<string, { price: number | null; cheque: number | null; country: string }>;
  range: { low: number | null; high: number | null };
};

type Step = "calc" | "result" | "submit" | "done";

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

export default function ShipownersPage() {
  const [step, setStep] = useState<Step>("calc");
  const [imo, setImo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CalcResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ref, setRef] = useState("");

  const [form, setForm] = useState({
    name: "", company: "", title: "", email: "", phone: "",
    preference: "recycling", delivery_region: "", availability: "", notes: "",
  });

  async function lookup() {
    const clean = imo.replace(/\D/g, "");
    if (clean.length !== 7) { setError("Please enter a valid 7-digit IMO number."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/calculator?imo=${clean}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Vessel not found."); return; }
      setResult(data);
      setStep("result");
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!result) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/submit-vessel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imo: result.imo, vessel_name: result.name, vessel_type: result.type, ...form }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Submission failed."); return; }
      setRef(data.ref);
      setStep("done");
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const aliaga = result?.estimates?.aliaga;
  const others = result ? [result.estimates.chittagong, result.estimates.alang].filter(e => e?.cheque) : [];

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", color: "#0F172A" }}>

      {/* Header */}
      <section style={{ background: "linear-gradient(135deg, #07122E 0%, #0d1f4a 100%)", padding: "56px 24px 64px", textAlign: "center" }}>
        <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", color: "#C9A84C", textTransform: "uppercase", marginBottom: 14 }}>
          For Shipowners
        </p>
        <h1 style={{ fontSize: "clamp(24px, 4vw, 40px)", fontWeight: 800, color: "#fff", margin: "0 0 14px", letterSpacing: -0.5 }}>
          What could your vessel be worth today?
        </h1>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.65)", maxWidth: 480, margin: "0 auto", lineHeight: 1.65 }}>
          Get an instant indicative estimate based on current recycling benchmarks.
          Free, confidential, no obligation.
        </p>
      </section>

      <section style={{ maxWidth: 620, margin: "0 auto", padding: "48px 24px 80px" }}>

        {/* ── STEP 1: IMO input ── */}
        {step === "calc" && (
          <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: "36px 32px", boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 6px" }}>Enter your IMO number</h2>
            <p style={{ fontSize: 14, color: "#64748B", margin: "0 0 24px" }}>
              We'll automatically retrieve your vessel's specifications and calculate the indicative scrap value.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <input
                type="text" placeholder="e.g. 9171735" value={imo}
                onChange={e => setImo(e.target.value.replace(/\D/g, "").slice(0, 7))}
                onKeyDown={e => e.key === "Enter" && lookup()}
                maxLength={7}
                style={{
                  flex: 1, border: "1px solid #CBD5E1", borderRadius: 7,
                  padding: "12px 16px", fontSize: 18, fontWeight: 600,
                  color: "#0F172A", letterSpacing: 2, outline: "none",
                }}
              />
              <button onClick={lookup} disabled={loading} style={{
                background: "#07122E", color: "#fff", border: "none",
                borderRadius: 7, padding: "12px 24px", fontSize: 15,
                fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
              }}>
                {loading ? "Looking up…" : "Get Estimate →"}
              </button>
            </div>
            {error && <p style={{ color: "#DC2626", fontSize: 13, marginTop: 10 }}>{error}</p>}
            <p style={{ fontSize: 12, color: "#94A3B8", marginTop: 16 }}>
              🔒 This lookup creates no listing and shares no data. Fully confidential.
            </p>
          </div>
        )}

        {/* ── STEP 2: Result ── */}
        {step === "result" && result && (
          <div>
            {/* Vessel card */}
            <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: "28px", marginBottom: 16, boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Vessel identified</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>M/V {result.name}</div>
                  <div style={{ fontSize: 14, color: "#64748B", marginTop: 2 }}>
                    {result.type}{result.built_year ? ` · Built ${result.built_year}` : ""}{result.flag ? ` · ${result.flag}` : ""}
                  </div>
                </div>
                <button onClick={() => { setStep("calc"); setResult(null); setImo(""); }} style={{
                  background: "none", border: "1px solid #E2E8F0", borderRadius: 6,
                  padding: "6px 12px", fontSize: 12, color: "#64748B", cursor: "pointer",
                }}>
                  Change vessel
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 24 }}>
                {[
                  ["IMO", result.imo],
                  ["Age", result.age ? `${result.age} years` : "—"],
                  ["DWT", result.deadweight ? `${Number(result.deadweight).toLocaleString()} t` : "—"],
                  ["LDT", result.ldt ? `${Number(result.ldt).toLocaleString()} t` : "—"],
                  ["Type", result.price_category],
                  ["Flag", result.flag ?? "—"],
                ].map(([l, v]) => (
                  <div key={l} style={{ background: "#F8FAFC", padding: "10px 12px", borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em" }}>{l}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Scrap value */}
              <div style={{ background: "linear-gradient(135deg, #07122E, #0d1f4a)", borderRadius: 12, padding: "24px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#C9A84C", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
                  Indicative Recycling Value
                </div>
                {result.range.low && result.range.high ? (
                  <>
                    <div style={{ fontSize: 36, fontWeight: 800, color: "#fff", lineHeight: 1 }}>
                      {fmt(result.range.low)} – {fmt(result.range.high)}
                    </div>
                    {aliaga?.price && result.ldt && (
                      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 6 }}>
                        Based on {Number(result.ldt).toLocaleString()} LDT × ${aliaga.price}/LDT · Aliağa benchmark
                      </div>
                    )}
                    {others.length > 0 && (
                      <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap" }}>
                        {others.map((o, i) => o?.cheque ? (
                          <div key={i} style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                            {o.country}: {fmt(o.cheque)}
                          </div>
                        ) : null)}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 15 }}>
                    LDT data unavailable — contact us for a manual valuation.
                  </div>
                )}
              </div>

              <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 12, lineHeight: 1.5 }}>
                Indicative estimate only. Final value subject to verified LDT, inspection, delivery location and market conditions.
              </p>
            </div>

            <button onClick={() => setStep("submit")} style={{
              width: "100%", background: "#C9A84C", color: "#07122E",
              border: "none", borderRadius: 10, padding: "16px",
              fontSize: 16, fontWeight: 700, cursor: "pointer",
            }}>
              Request Verified Offers →
            </button>
            <p style={{ textAlign: "center", fontSize: 12, color: "#94A3B8", marginTop: 10 }}>
              Free · Confidential · Indicative offers within 24 hours
            </p>
          </div>
        )}

        {/* ── STEP 3: Submit form ── */}
        {step === "submit" && result && (
          <form onSubmit={submit}>
            <div style={{ background: "#F0F9F6", border: "1px solid #A7F3D0", borderRadius: 10, padding: "14px 18px", marginBottom: 24, fontSize: 14, color: "#065F46" }}>
              ✓ M/V <strong>{result.name}</strong> (IMO {result.imo}) — estimate carried over
            </div>

            <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: "28px", marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 20px" }}>Your contact details</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div><LABEL>Full name *</LABEL><INPUT required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="John Smith" /></div>
                <div><LABEL>Company</LABEL><INPUT value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="Shipping Co. Ltd" /></div>
                <div><LABEL>Title / Role</LABEL><INPUT value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Director, Fleet Manager…" /></div>
                <div><LABEL>Corporate email *</LABEL><INPUT required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="name@company.com" /></div>
                <div style={{ gridColumn: "span 2" }}><LABEL>Phone / WhatsApp</LABEL><INPUT value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 212 555 0100" /></div>
              </div>
            </div>

            <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: "28px", marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 20px" }}>Vessel & transaction details</h3>
              <div style={{ display: "grid", gap: 14 }}>
                <div>
                  <LABEL>Preference</LABEL>
                  <div style={{ display: "flex", gap: 10 }}>
                    {[["recycling", "Recycling / Scrap"], ["secondhand", "Second-hand sale"], ["both", "Both options"]].map(([val, label]) => (
                      <label key={val} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 14, color: form.preference === val ? "#07122E" : "#64748B" }}>
                        <input type="radio" name="preference" value={val} checked={form.preference === val} onChange={() => setForm(f => ({ ...f, preference: val }))} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div><LABEL>Delivery region</LABEL><INPUT value={form.delivery_region} onChange={e => setForm(f => ({ ...f, delivery_region: e.target.value }))} placeholder="e.g. Mediterranean, Far East" /></div>
                  <div><LABEL>Availability</LABEL><INPUT value={form.availability} onChange={e => setForm(f => ({ ...f, availability: e.target.value }))} placeholder="e.g. Q4 2026, immediate" /></div>
                </div>
                <div>
                  <LABEL>Additional notes</LABEL>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Charter status, class survey, any relevant information…"
                    style={{ width: "100%", boxSizing: "border-box", border: "1px solid #CBD5E1", borderRadius: 7, padding: "10px 14px", fontSize: 14, minHeight: 80, resize: "vertical", outline: "none" }}
                  />
                </div>
              </div>
            </div>

            {error && <p style={{ color: "#DC2626", fontSize: 13, marginBottom: 12 }}>{error}</p>}

            <button type="submit" disabled={submitting} style={{
              width: "100%", background: "#07122E", color: "#fff",
              border: "none", borderRadius: 10, padding: "16px",
              fontSize: 16, fontWeight: 700, cursor: "pointer",
            }}>
              {submitting ? "Submitting…" : "Submit Confidentially →"}
            </button>
            <p style={{ textAlign: "center", fontSize: 12, color: "#94A3B8", marginTop: 10, lineHeight: 1.5 }}>
              🔒 Your details are shared with verified buyers only after your explicit approval.
              We respond within 1 business day.
            </p>
          </form>
        )}

        {/* ── STEP 4: Done ── */}
        {step === "done" && (
          <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: "48px 32px", textAlign: "center", boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px" }}>Submission received</h2>
            <div style={{ display: "inline-block", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 6, padding: "6px 16px", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 20 }}>
              {ref}
            </div>
            <p style={{ fontSize: 15, color: "#64748B", maxWidth: 380, margin: "0 auto", lineHeight: 1.65 }}>
              We will review your submission and return with indicative offers
              from verified buyers <strong>within 24 hours</strong>.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 32, textAlign: "left" }}>
              {[
                ["Initial review", "Within 1 business day"],
                ["Indicative offers", "Normally within 24 hours"],
                ["Confidentiality", "Your identity protected throughout"],
                ["No obligation", "Review offers before deciding"],
              ].map(([label, val]) => (
                <div key={label} style={{ background: "#F8FAFC", padding: "12px 14px", borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{val}</div>
                </div>
              ))}
            </div>
          </div>
        )}

      </section>
    </div>
  );
}
