"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

type Mode = "login" | "signup";

const INPUT: React.CSSProperties = {
  width: "100%", padding: "10px 12px", fontSize: 13, borderRadius: 8,
  border: "1px solid #D0D5DD", outline: "none", fontFamily: "Inter, sans-serif",
  color: "#101828", background: "#fff", boxSizing: "border-box",
};
const BTN: React.CSSProperties = {
  width: "100%", padding: 11, fontSize: 13, fontWeight: 600,
  borderRadius: 8, border: "none", cursor: "pointer",
  fontFamily: "Inter, sans-serif", background: "#1D9E75", color: "#fff",
};

function AuthForm() {
  const params   = useSearchParams();
  const router   = useRouter();
  const redirect = params.get("redirect") ?? "/broker/listings";

  const [mode, setMode]         = useState<Mode>("login");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [name]    = useState("");
  const [company] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const fromProtected = !!params.get("redirect");

  useEffect(() => { setError(""); }, [mode]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);

    const url  = mode === "login" ? "/api/broker/login" : "/api/broker/register";
    const body = mode === "login"
      ? { email, password }
      : { email, password, full_name: name, company };

    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });

    if (res.ok) {
      router.push(redirect);
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Something went wrong");
    }
    setLoading(false);
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #EAECF0", borderRadius: 14, padding: "36px 32px", width: 380, boxShadow: "0 4px 24px rgba(16,24,40,0.06)" }}>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: "#1D9E75", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "#fff", fontSize: 14, fontWeight: 800 }}>S</span>
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#101828" }}>ShipScout</span>
        <span style={{ fontSize: 12, color: "#98A2B3", marginLeft: 4 }}>Broker Portal</span>
      </div>

      <h1 style={{ fontSize: 20, fontWeight: 700, color: "#101828", margin: "0 0 4px" }}>
        {mode === "login" ? "Sign in" : "Request access"}
      </h1>
      <p style={{ fontSize: 13, color: "#667085", margin: "0 0 24px" }}>
        {fromProtected
          ? "This section is for ShipScout partners. Sign in to continue."
          : mode === "login"
            ? "Sign in to your ShipScout broker account."
            : "ShipScout is invite-only. Contact us to request access."}
      </p>

      {error && (
        <div style={{ background: "#FEF3F2", border: "1px solid #FECDCA", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#B42318", marginBottom: 16 }}>
          {error}
        </div>
      )}

      {mode === "login" ? (
        <>
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: "#344054", display: "block", marginBottom: 5 }}>Email</label>
              <input style={INPUT} type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@company.com" autoComplete="email" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: "#344054", display: "block", marginBottom: 5 }}>Password</label>
              <input style={INPUT} type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" minLength={8} autoComplete="current-password" />
            </div>
            <button type="submit" style={{ ...BTN, opacity: loading ? 0.7 : 1, marginTop: 4 }} disabled={loading}>
              {loading ? "Please wait…" : "Sign in"}
            </button>
          </form>
          <div style={{ textAlign: "center", marginTop: 20, fontSize: 12, color: "#667085" }}>
            No account?{" "}
            <button onClick={() => setMode("signup")} style={{ color: "#1D9E75", fontWeight: 600, background: "none", border: "none", cursor: "pointer", fontSize: 12 }}>
              Request access →
            </button>
          </div>
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 10, padding: "20px 18px", fontSize: 13, color: "#374151", lineHeight: 1.7 }}>
            ShipScout partner access is by invitation only.<br />
            To request an account, email us at{" "}
            <a href="mailto:info@turqomarine.com" style={{ color: "#1D9E75", fontWeight: 600 }}>info@turqomarine.com</a>
            {" "}with your name and company.
          </div>
          <button onClick={() => setMode("login")} style={{ ...BTN, background: "transparent", color: "#667085", border: "1px solid #D0D5DD" }}>
            ← Back to sign in
          </button>
        </div>
      )}
    </div>
  );
}

export default function BrokerAuthPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#F9FAFB", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif" }}>
      <Suspense fallback={<div style={{ color: "#667085", fontSize: 13 }}>Loading…</div>}>
        <AuthForm />
      </Suspense>
    </div>
  );
}
