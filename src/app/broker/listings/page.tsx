"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Listing = {
  listing_id: string;
  imo: string;
  vessel_name: string | null;
  listing_type: "sale" | "charter" | "scrap";
  status: "pending" | "approved" | "rejected" | "withdrawn";
  currency: string;
  price_usd: number | null;
  description: string;
  images: string[];
  submitted_at: string;
  approved_at: string | null;
  rejection_reason: string | null;
};

const STATUS_STYLE: Record<string, { color: string; bg: string; border: string; label: string }> = {
  pending:   { color: "#B54708", bg: "#FFFAEB", border: "#FEF0C7", label: "Pending review" },
  approved:  { color: "#027A48", bg: "#ECFDF3", border: "#A9EFC5", label: "Published"      },
  rejected:  { color: "#B42318", bg: "#FEF3F2", border: "#FECDCA", label: "Rejected"        },
  withdrawn: { color: "#667085", bg: "#F9FAFB", border: "#EAECF0", label: "Withdrawn"       },
};
const TYPE_LABEL: Record<string, string> = { sale: "For Sale", charter: "Charter", scrap: "For Scrap" };

export default function BrokerListingsPage() {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading]   = useState(true);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [deleting, setDeleting]       = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/listings")
      .then(r => {
        if (r.status === 401) { router.push("/broker/auth"); return null; }
        return r.ok ? r.json() : Promise.reject();
      })
      .then(d => d && setListings(d.listings || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  async function withdraw(id: string) {
    if (!confirm("Withdraw this listing?")) return;
    setWithdrawing(id);
    const res = await fetch(`/api/listings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "withdraw" }),
    });
    if (res.ok) setListings(l => l.map(x => x.listing_id === id ? { ...x, status: "withdrawn" } : x));
    setWithdrawing(null);
  }

  async function remove(id: string) {
    if (!confirm("Permanently delete this listing?")) return;
    setDeleting(id);
    const res = await fetch(`/api/listings/${id}`, { method: "DELETE" });
    if (res.ok) setListings(l => l.filter(x => x.listing_id !== id));
    setDeleting(null);
  }

  async function signOut() {
    await fetch("/api/broker/logout", { method: "POST" });
    router.push("/broker/auth");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F9FAFB", fontFamily: "Inter, sans-serif" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #EAECF0", padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#101828" }}>My Listings</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => router.push("/broker/listings/new")}
            style={{ padding: "9px 18px", background: "#1D9E75", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            + New Listing
          </button>
          <button onClick={signOut}
            style={{ padding: "9px 14px", background: "#fff", color: "#667085", border: "1px solid #EAECF0", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
            Sign out
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 20px" }}>
        {loading && <div style={{ textAlign: "center", padding: 48, color: "#98A2B3", fontSize: 13 }}>Loading…</div>}

        {!loading && listings.length === 0 && (
          <div style={{ textAlign: "center", padding: "64px 20px" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🚢</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#101828", marginBottom: 6 }}>No listings yet</div>
            <div style={{ fontSize: 13, color: "#667085", marginBottom: 24 }}>Submit your first vessel — for sale, charter, or scrap.</div>
            <button onClick={() => router.push("/broker/listings/new")}
              style={{ padding: "10px 22px", background: "#1D9E75", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              + New Listing
            </button>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {listings.map(l => {
            const st = STATUS_STYLE[l.status];
            return (
              <div key={l.listing_id} style={{ background: "#fff", border: "1px solid #EAECF0", borderRadius: 10, padding: "18px 20px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#101828" }}>{l.vessel_name || `IMO ${l.imo}`}</span>
                      <span style={{ fontSize: 11, color: "#98A2B3", fontFamily: "monospace" }}>IMO {l.imo}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 5, color: "#344054", background: "#F2F4F7", border: "1px solid #EAECF0" }}>
                        {TYPE_LABEL[l.listing_type]}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "#667085", marginBottom: 8, lineHeight: 1.5 }}>
                      {l.description.length > 160 ? l.description.slice(0, 160) + "…" : l.description}
                    </div>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" as const }}>
                      {l.price_usd && (
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#101828" }}>
                            {l.currency === "USD" ? "$" : l.currency + " "}
                            {l.price_usd >= 1_000_000 ? `${(l.price_usd / 1_000_000).toFixed(2)}M` : l.price_usd.toLocaleString()}
                          </span>
                          <span style={{ fontSize: 10, color: "#98A2B3", marginLeft: 4, textTransform: "uppercase" as const }}>asking</span>
                        </div>
                      )}
                      {l.images?.length > 0 && <span style={{ fontSize: 11, color: "#667085" }}>{l.images.length} photo{l.images.length !== 1 ? "s" : ""}</span>}
                      <span style={{ fontSize: 11, color: "#98A2B3" }}>
                        Submitted {new Date(l.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    </div>
                    {l.rejection_reason && (
                      <div style={{ marginTop: 8, padding: "8px 10px", background: "#FEF3F2", border: "1px solid #FECDCA", borderRadius: 6, fontSize: 12, color: "#B42318" }}>
                        <strong>Reason:</strong> {l.rejection_reason}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 5, color: st.color, background: st.bg, border: `1px solid ${st.border}` }}>
                      {st.label}
                    </span>
                    {(l.status === "pending" || l.status === "approved") && (
                      <button onClick={() => withdraw(l.listing_id)} disabled={withdrawing === l.listing_id}
                        style={{ fontSize: 11, color: "#667085", background: "none", border: "1px solid #EAECF0", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
                        {withdrawing === l.listing_id ? "…" : "Withdraw"}
                      </button>
                    )}
                    {(l.status === "pending" || l.status === "rejected") && (
                      <button onClick={() => remove(l.listing_id)} disabled={deleting === l.listing_id}
                        style={{ fontSize: 11, color: "#B42318", background: "none", border: "1px solid #FECDCA", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
                        {deleting === l.listing_id ? "…" : "Delete"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
