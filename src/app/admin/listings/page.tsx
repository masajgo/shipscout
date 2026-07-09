"use client";
import { useCallback, useEffect, useState } from "react";

type AdminListing = {
  listing_id: string;
  imo: string;
  vessel_name: string | null;
  db_vessel_name: string | null;
  listing_type: "sale" | "charter" | "scrap";
  status: string;
  currency: string;
  price_usd: number | null;
  description: string;
  images: string[];
  broker_name: string | null;
  broker_email: string;
  broker_phone: string | null;
  broker_company: string | null;
  submitted_at: string;
  vessel_type: string | null;
  flag: string | null;
  built_year: number | null;
  scrap_score: number | null;
  scrap_category: string | null;
  rejection_reason: string | null;
};

const STATUS_TABS = ["pending", "approved", "rejected", "all"] as const;
type Tab = typeof STATUS_TABS[number];

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  pending:  { color: "#B54708", bg: "#FFFAEB" },
  approved: { color: "#027A48", bg: "#ECFDF3" },
  rejected: { color: "#B42318", bg: "#FEF3F2" },
  withdrawn:{ color: "#667085", bg: "#F9FAFB" },
};

function AuthGate({ onAuth }: { onAuth: (key: string) => void }) {
  const [val, setVal] = useState("");
  const [err, setErr] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/admin/listings?key=${encodeURIComponent(val)}&limit=1`);
    if (res.ok) { sessionStorage.setItem("admin_key", val); onAuth(val); }
    else setErr(true);
  }
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0D1F28", fontFamily: "Inter, sans-serif" }}>
      <form onSubmit={submit} style={{ background: "#0F2733", border: "1px solid rgba(143,168,178,0.15)", borderRadius: 12, padding: 32, width: 340 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#E8F0F3", marginBottom: 20 }}>Admin — Listing Moderation</div>
        {err && <div style={{ color: "#F87171", fontSize: 12, marginBottom: 12 }}>Incorrect key</div>}
        <input type="password" value={val} onChange={e => setVal(e.target.value)} placeholder="ADMIN_SECRET"
          style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(143,168,178,0.2)", background: "#0D1F28", color: "#E8F0F3", fontSize: 13, marginBottom: 12, boxSizing: "border-box" as const }} />
        <button type="submit" style={{ width: "100%", padding: 11, background: "#1D9E75", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          Enter
        </button>
      </form>
    </div>
  );
}

export default function AdminListingsPage() {
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [listings, setListings] = useState<AdminListing[]>([]);
  const [tab, setTab]           = useState<Tab>("pending");
  const [loading, setLoading]   = useState(false);
  const [total, setTotal]       = useState(0);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [acting, setActing]     = useState<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("admin_key");
    if (stored) setAdminKey(stored);
  }, []);

  const load = useCallback(async (key: string, status: Tab) => {
    setLoading(true);
    const res = await fetch(`/api/admin/listings?key=${encodeURIComponent(key)}&status=${status}&limit=50`);
    if (res.ok) {
      const d = await res.json();
      setListings(d.listings);
      setTotal(d.total);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (adminKey) load(adminKey, tab);
  }, [adminKey, tab, load]);

  async function act(id: string, action: "approve" | "reject", reason?: string) {
    if (!adminKey) return;
    setActing(id);
    const res = await fetch(`/api/admin/listings/${id}?key=${encodeURIComponent(adminKey)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, rejection_reason: reason }),
    });
    if (res.ok) {
      setListings(l => l.filter(x => x.listing_id !== id));
      setTotal(t => t - 1);
      setRejectTarget(null);
      setRejectReason("");
    }
    setActing(null);
  }

  if (!adminKey) return <AuthGate onAuth={k => { setAdminKey(k); }} />;

  return (
    <div style={{ minHeight: "100vh", background: "#F9FAFB", fontFamily: "Inter, sans-serif" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #EAECF0", padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#101828" }}>Listing Moderation</div>
        <div style={{ fontSize: 12, color: "#98A2B3" }}>{total} {tab === "all" ? "total" : tab} listing{total !== 1 ? "s" : ""}</div>
      </div>

      {/* Tabs */}
      <div style={{ background: "#fff", borderBottom: "1px solid #EAECF0", padding: "0 28px", display: "flex" }}>
        {STATUS_TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: "none", border: "none", padding: "12px 18px", fontSize: 13,
            fontWeight: tab === t ? 600 : 400,
            color: tab === t ? "#101828" : "#667085",
            borderBottom: tab === t ? "2px solid #1D9E75" : "2px solid transparent",
            cursor: "pointer", fontFamily: "Inter, sans-serif", textTransform: "capitalize",
          }}>{t}</button>
        ))}
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px" }}>
        {loading && <div style={{ textAlign: "center", padding: 48, color: "#98A2B3", fontSize: 13 }}>Loading…</div>}

        {!loading && listings.length === 0 && (
          <div style={{ textAlign: "center", padding: 48, color: "#98A2B3", fontSize: 13 }}>
            No {tab} listings.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {listings.map(l => {
            const st = STATUS_STYLE[l.status] || STATUS_STYLE.withdrawn;
            const name = l.vessel_name || l.db_vessel_name || `IMO ${l.imo}`;
            return (
              <div key={l.listing_id} style={{ background: "#fff", border: "1px solid #EAECF0", borderRadius: 10, padding: "18px 20px" }}>
                {/* Top row */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#101828" }}>{name}</span>
                      <span style={{ fontSize: 11, color: "#98A2B3", fontFamily: "monospace" }}>IMO {l.imo}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 5, background: "#F2F4F7", color: "#344054", border: "1px solid #EAECF0", textTransform: "capitalize" }}>
                        {l.listing_type}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 5, color: st.color, background: st.bg }}>
                        {l.status}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" as const }}>
                      {[
                        l.vessel_type  ? { label: "Type",  val: l.vessel_type }                   : null,
                        l.flag         ? { label: "Flag",  val: l.flag }                           : null,
                        l.built_year   ? { label: "Built", val: l.built_year }                    : null,
                        l.scrap_score  ? { label: "Scrap", val: `${l.scrap_score}/100` }          : null,
                        l.price_usd    ? { label: "Price", val: `${l.currency} ${l.price_usd.toLocaleString()}` } : null,
                      ].filter(Boolean).map(s => s && (
                        <div key={s.label}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#344054" }}>{s.val}</div>
                          <div style={{ fontSize: 9, color: "#98A2B3", textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {l.status === "pending" && (
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <button onClick={() => act(l.listing_id, "approve")} disabled={acting === l.listing_id}
                        style={{ padding: "8px 16px", background: "#1D9E75", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        {acting === l.listing_id ? "…" : "Approve"}
                      </button>
                      <button onClick={() => { setRejectTarget(l.listing_id); setRejectReason(""); }} disabled={acting === l.listing_id}
                        style={{ padding: "8px 16px", background: "#FEF3F2", color: "#B42318", border: "1px solid #FECDCA", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        Reject
                      </button>
                    </div>
                  )}
                </div>

                {/* Description */}
                <div style={{ fontSize: 12, color: "#475467", lineHeight: 1.6, marginBottom: 10 }}>
                  {l.description}
                </div>

                {/* Photos */}
                {l.images?.length > 0 && (
                  <div style={{ display: "flex", gap: 6, marginBottom: 10, overflowX: "auto" as const }}>
                    {l.images.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={url} alt="" style={{ height: 80, width: "auto", borderRadius: 6, border: "1px solid #EAECF0", flexShrink: 0 }} />
                    ))}
                  </div>
                )}

                {/* Broker info */}
                <div style={{ fontSize: 11, color: "#98A2B3", display: "flex", gap: 14, flexWrap: "wrap" as const }}>
                  {l.broker_name    && <span>{l.broker_name}</span>}
                  {l.broker_company && <span>{l.broker_company}</span>}
                  <span>{l.broker_email}</span>
                  {l.broker_phone   && <span>{l.broker_phone}</span>}
                  <span>Submitted {new Date(l.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </div>

                {/* Rejection form */}
                {rejectTarget === l.listing_id && (
                  <div style={{ marginTop: 12, padding: "12px 14px", background: "#FEF3F2", border: "1px solid #FECDCA", borderRadius: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#B42318", marginBottom: 8 }}>Rejection reason (shown to broker)</div>
                    <textarea
                      value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                      placeholder="e.g. Duplicate listing / Missing vessel photos / IMO not found in our database…"
                      style={{ width: "100%", padding: "8px 10px", fontSize: 12, border: "1px solid #FECDCA", borderRadius: 6, fontFamily: "Inter, sans-serif", resize: "vertical" as const, boxSizing: "border-box" as const, minHeight: 60 }}
                    />
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button onClick={() => act(l.listing_id, "reject", rejectReason)} disabled={!rejectReason.trim() || acting === l.listing_id}
                        style={{ padding: "7px 16px", background: "#B42318", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: !rejectReason.trim() ? 0.6 : 1 }}>
                        {acting === l.listing_id ? "…" : "Confirm Reject"}
                      </button>
                      <button onClick={() => setRejectTarget(null)}
                        style={{ padding: "7px 12px", background: "none", border: "1px solid #FECDCA", borderRadius: 6, fontSize: 12, color: "#B42318", cursor: "pointer" }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {l.rejection_reason && l.status === "rejected" && (
                  <div style={{ marginTop: 8, fontSize: 11, color: "#B42318" }}>
                    <strong>Rejection reason:</strong> {l.rejection_reason}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
