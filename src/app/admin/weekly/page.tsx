"use client";
import { useCallback, useEffect, useState } from "react";

interface AdminDigest {
  id:                 number;
  week_start:         string;
  week_end:           string;
  week_label:         string;
  intro_text:         string | null;
  event_count:        number;
  actual_event_count: number;
  published:          boolean;
  created_at:         string;
  arrests:            number;
  detentions:         number;
  auctions:           number;
  sanctions:          number;
  scrap_sales:        number;
}

function AuthGate({ onAuth }: { onAuth: (key: string) => void }) {
  const [val, setVal] = useState("");
  const [err, setErr] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/admin/weekly?key=${encodeURIComponent(val)}`);
    if (res.ok) { sessionStorage.setItem("admin_key", val); onAuth(val); }
    else setErr(true);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#0D1F28", fontFamily: "Inter, sans-serif" }}>
      <form onSubmit={submit} style={{ background: "#0F2733", border: "1px solid rgba(143,168,178,0.15)",
        borderRadius: 12, padding: 32, width: 340 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#E8F0F3", marginBottom: 20 }}>
          Admin — Weekly Digest
        </div>
        {err && <div style={{ color: "#F87171", fontSize: 12, marginBottom: 12 }}>Incorrect key</div>}
        <input type="password" value={val} onChange={e => setVal(e.target.value)}
          placeholder="ADMIN_SECRET" autoFocus
          style={{ width: "100%", padding: "10px 12px", borderRadius: 8,
            border: "1px solid rgba(143,168,178,0.2)", background: "#0D1F28",
            color: "#E8F0F3", fontSize: 13, marginBottom: 12, boxSizing: "border-box" as const }} />
        <button type="submit" style={{ width: "100%", padding: 11, background: "#1D9E75",
          color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          Enter
        </button>
      </form>
    </div>
  );
}

function DigestCard({
  digest, adminKey, onUpdate,
}: {
  digest: AdminDigest;
  adminKey: string;
  onUpdate: (id: number, patch: Partial<AdminDigest>) => void;
}) {
  const [editingIntro, setEditingIntro] = useState(false);
  const [introDraft,   setIntroDraft]   = useState(digest.intro_text ?? "");
  const [saving, setSaving] = useState(false);

  async function saveIntro() {
    setSaving(true);
    const res = await fetch(`/api/admin/weekly?key=${encodeURIComponent(adminKey)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: digest.id, intro_text: introDraft }),
    });
    if (res.ok) { onUpdate(digest.id, { intro_text: introDraft }); setEditingIntro(false); }
    setSaving(false);
  }

  async function togglePublish() {
    setSaving(true);
    const res = await fetch(`/api/admin/weekly?key=${encodeURIComponent(adminKey)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: digest.id, published: !digest.published }),
    });
    if (res.ok) onUpdate(digest.id, { published: !digest.published });
    setSaving(false);
  }

  const catPills = [
    digest.arrests     > 0 && { label: `${digest.arrests} arrest/seize`,   color: "#991B1B" },
    digest.detentions  > 0 && { label: `${digest.detentions} detention`,    color: "#92400E" },
    digest.auctions    > 0 && { label: `${digest.auctions} auction`,        color: "#C9A84C" },
    digest.sanctions   > 0 && { label: `${digest.sanctions} sanction`,      color: "#6B21A8" },
    digest.scrap_sales > 0 && { label: `${digest.scrap_sales} scrap`,       color: "#065F46" },
  ].filter(Boolean) as { label: string; color: string }[];

  return (
    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10,
      padding: "20px 24px", fontFamily: "Inter, sans-serif" }}>

      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#101828", marginBottom: 4,
            fontFamily: "'Georgia', serif" }}>
            {digest.week_label}
          </div>
          <div style={{ fontSize: 12, color: "#9CA3AF" }}>
            {digest.actual_event_count} events · created {new Date(digest.created_at).toLocaleDateString("en-GB")}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {/* Published status */}
          <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 6,
            color:       digest.published ? "#027A48" : "#B54708",
            background:  digest.published ? "#ECFDF3"  : "#FFFAEB",
            border:      `1px solid ${digest.published ? "#A9EFC5" : "#FEF0C7"}` }}>
            {digest.published ? "Published" : "Draft"}
          </span>
          {/* Publish / Unpublish */}
          <button onClick={togglePublish} disabled={saving}
            style={{ fontSize: 12, fontWeight: 600, padding: "5px 14px", borderRadius: 6,
              border: "none", cursor: saving ? "not-allowed" : "pointer",
              background: digest.published ? "#FEF2F2" : "#1D9E75",
              color:      digest.published ? "#991B1B" : "#fff",
              opacity:    saving ? 0.6 : 1 }}>
            {digest.published ? "Unpublish" : "Publish"}
          </button>
          {/* Preview */}
          <a href={`/weekly/${digest.week_start}`} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 12, padding: "5px 14px", borderRadius: 6, border: "1px solid #D1D5DB",
              color: "#374151", textDecoration: "none", background: "#fff" }}>
            Preview
          </a>
        </div>
      </div>

      {/* Category pills */}
      {catPills.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {catPills.map(p => (
            <span key={p.label} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4,
              color: p.color, background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
              {p.label}
            </span>
          ))}
        </div>
      )}

      {/* Intro text editor */}
      <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase",
          letterSpacing: "0.08em", marginBottom: 8 }}>
          Intro paragraph
        </div>
        {editingIntro ? (
          <>
            <textarea
              value={introDraft}
              onChange={e => setIntroDraft(e.target.value)}
              rows={4}
              style={{ width: "100%", fontSize: 13, padding: "10px 12px", borderRadius: 8,
                border: "1px solid #D1D5DB", color: "#374151", lineHeight: 1.6,
                resize: "vertical", fontFamily: "Inter, sans-serif", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={saveIntro} disabled={saving}
                style={{ fontSize: 12, fontWeight: 600, padding: "6px 16px", borderRadius: 6,
                  background: "#1D9E75", color: "#fff", border: "none", cursor: "pointer",
                  opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button onClick={() => { setEditingIntro(false); setIntroDraft(digest.intro_text ?? ""); }}
                style={{ fontSize: 12, padding: "6px 14px", borderRadius: 6,
                  border: "1px solid #D1D5DB", background: "#fff", color: "#6B7280", cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <p style={{ flex: 1, fontSize: 13, color: digest.intro_text ? "#374151" : "#9CA3AF",
              lineHeight: 1.6, margin: 0, fontStyle: digest.intro_text ? "normal" : "italic" }}>
              {digest.intro_text ?? "No intro generated."}
            </p>
            <button onClick={() => setEditingIntro(true)}
              style={{ fontSize: 12, padding: "4px 12px", borderRadius: 6, flexShrink: 0,
                border: "1px solid #D1D5DB", background: "#fff", color: "#374151", cursor: "pointer" }}>
              Edit
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminWeeklyPage() {
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [digests, setDigests]   = useState<AdminDigest[]>([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState<"all" | "draft" | "published">("all");

  useEffect(() => {
    const stored = sessionStorage.getItem("admin_key");
    if (stored) setAdminKey(stored);
  }, []);

  const load = useCallback(async (key: string) => {
    setLoading(true);
    const res = await fetch(`/api/admin/weekly?key=${encodeURIComponent(key)}`);
    if (res.ok) {
      const d = await res.json();
      setDigests(d.digests ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (adminKey) load(adminKey);
  }, [adminKey, load]);

  function handleUpdate(id: number, patch: Partial<AdminDigest>) {
    setDigests(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d));
  }

  if (!adminKey) return <AuthGate onAuth={k => { setAdminKey(k); }} />;

  const filtered = digests.filter(d => {
    if (tab === "draft")     return !d.published;
    if (tab === "published") return  d.published;
    return true;
  });

  const TAB_STYLE = (active: boolean): React.CSSProperties => ({
    fontSize: 13, fontWeight: 600, padding: "6px 16px", borderRadius: 6,
    border: active ? "1px solid #1D9E75" : "1px solid #E5E7EB",
    background: active ? "#ECFDF5" : "#fff",
    color: active ? "#1D9E75" : "#6B7280",
    cursor: "pointer",
  });

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px 80px",
      fontFamily: "Inter, sans-serif" }}>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 6px" }}>
          Weekly Digest Admin
        </h1>
        <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>
          Review AI-generated digests, edit intro paragraphs, and publish.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {(["all", "draft", "published"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={TAB_STYLE(tab === t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === "all"       && ` (${digests.length})`}
            {t === "draft"     && ` (${digests.filter(d => !d.published).length})`}
            {t === "published" && ` (${digests.filter(d =>  d.published).length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", color: "#9CA3AF", padding: 48 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", color: "#9CA3AF", padding: 48, fontSize: 14 }}>
          No digests found. Run <code>node scripts/generateWeeklyDigest.js --backfill</code>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {filtered.map(d => (
            <DigestCard key={d.id} digest={d} adminKey={adminKey} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}
