"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Photo = {
  id: number;
  imo: string;
  url: string;
  thumb: string;
  artist: string;
  license: string;
  licenseUrl: string | null;
  pageUrl: string | null;
  attribution: string;
  confidence: "high" | "medium" | null;
  isPrimary: boolean;
  source: string;
  createdAt: string;
  vesselName: string | null;
  vesselType: string | null;
  flag: string | null;
  builtYear: number | null;
  scrapScore: number | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildUrl(path: string, key: string, extra?: Record<string, string>) {
  const u = new URL(path, window.location.origin);
  u.searchParams.set("key", key);
  if (extra) Object.entries(extra).forEach(([k, v]) => u.searchParams.set(k, v));
  return u.toString();
}

// ─── Auth gate ────────────────────────────────────────────────────────────────

function AuthGate({ onAuth }: { onAuth: (key: string) => void }) {
  const [val, setVal] = useState("");
  const [err, setErr] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/admin/photos?key=${encodeURIComponent(val)}&limit=1`);
    if (res.ok) {
      sessionStorage.setItem("admin_key", val);
      onAuth(val);
    } else {
      setErr(true);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0D1F28", fontFamily: "Inter, sans-serif" }}>
      <form onSubmit={submit} style={{ background: "#0F2733", border: "1px solid rgba(143,168,178,0.15)", borderRadius: 12, padding: 32, width: 340 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#E8F0F3", marginBottom: 8 }}>Admin — Photo Moderation</div>
        <div style={{ fontSize: 12, color: "#8FA8B2", marginBottom: 20 }}>Enter ADMIN_SECRET value</div>
        <input
          type="password"
          value={val}
          onChange={e => { setVal(e.target.value); setErr(false); }}
          placeholder="Admin secret..."
          autoFocus
          style={{ width: "100%", padding: "10px 12px", background: "rgba(143,168,178,0.08)", border: `1px solid ${err ? "#F87171" : "rgba(143,168,178,0.2)"}`, borderRadius: 8, color: "#E8F0F3", fontSize: 13, fontFamily: "monospace", boxSizing: "border-box", marginBottom: 8, outline: "none" }}
        />
        {err && <div style={{ fontSize: 11, color: "#F87171", marginBottom: 8 }}>Wrong key</div>}
        <button type="submit" style={{ width: "100%", padding: "10px", background: "#1D9E75", border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Login
        </button>
      </form>
    </div>
  );
}

// ─── Photo card ───────────────────────────────────────────────────────────────

function PhotoCard({
  photo, adminKey, onDeleted,
}: {
  photo: Photo;
  adminKey: string;
  onDeleted: (id: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [imgOk, setImgOk] = useState(true);

  async function del(mode: "single" | "wrong_vessel") {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(
        buildUrl(`/api/admin/photos/${photo.id}`, adminKey, { mode }),
        { method: "DELETE" },
      );
      if (res.ok) onDeleted(photo.id);
      else {
        const d = await res.json().catch(() => ({}));
        alert(d.error || "Could not delete");
      }
    } finally {
      setBusy(false);
    }
  }

  const isMedium = photo.confidence === "medium";

  return (
    <div style={{
      background: "#0F2733",
      border: `2px solid ${isMedium ? "rgba(234,179,8,0.5)" : "rgba(143,168,178,0.1)"}`,
      borderRadius: 10,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      opacity: busy ? 0.4 : 1,
      transition: "opacity 0.15s",
    }}>
      {/* Thumbnail */}
      <a href={photo.pageUrl ?? photo.url} target="_blank" rel="noreferrer" style={{ display: "block", position: "relative", paddingBottom: "62%", background: "#0A1820", flexShrink: 0 }}>
        {imgOk ? (
          <img
            src={photo.thumb}
            alt=""
            onError={() => setImgOk(false)}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(143,168,178,0.3)", fontSize: 11 }}>broken</div>
        )}
        {/* Badges */}
        <div style={{ position: "absolute", top: 4, left: 4, display: "flex", gap: 3, flexWrap: "wrap" }}>
          {photo.isPrimary && (
            <span style={{ background: "#1D9E75", color: "#fff", fontSize: 8, fontWeight: 700, padding: "2px 5px", borderRadius: 4 }}>PRIMARY</span>
          )}
          <span style={{
            background: isMedium ? "rgba(234,179,8,0.85)" : "rgba(34,197,94,0.85)",
            color: "#fff", fontSize: 8, fontWeight: 700, padding: "2px 5px", borderRadius: 4,
          }}>
            {photo.confidence ?? "?"}
          </span>
        </div>
      </a>

      {/* Info */}
      <div style={{ padding: "8px 8px 0", flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#E8F0F3", lineHeight: 1.3, marginBottom: 2, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {photo.vesselName ?? `IMO ${photo.imo}`}
        </div>
        <div style={{ fontSize: 9, color: "#8FA8B2", fontFamily: "monospace", marginBottom: 3 }}>
          IMO {photo.imo}{photo.flag ? ` · ${photo.flag}` : ""}{photo.builtYear ? ` · ${photo.builtYear}` : ""}
        </div>
        {photo.vesselType && (
          <div style={{ fontSize: 9, color: "rgba(143,168,178,0.6)", marginBottom: 2 }}>{photo.vesselType}</div>
        )}
        <div style={{ fontSize: 9, color: "rgba(143,168,178,0.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={photo.artist}>
          © {photo.artist}
        </div>
        <div style={{ fontSize: 9, color: "rgba(143,168,178,0.4)", marginBottom: 6 }}>{photo.license}</div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 4, padding: "0 6px 6px" }}>
        <button
          onClick={() => del("single")}
          disabled={busy}
          style={{ flex: 1, padding: "5px 4px", background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 6, color: "#F87171", fontSize: 9, fontWeight: 700, cursor: busy ? "default" : "pointer", fontFamily: "Inter, sans-serif" }}
        >
          Delete
        </button>
        <button
          onClick={() => del("wrong_vessel")}
          disabled={busy}
          title="Delete all photos for this vessel + skip future searches"
          style={{ flex: 1.4, padding: "5px 4px", background: "rgba(251,146,60,0.12)", border: "1px solid rgba(251,146,60,0.3)", borderRadius: 6, color: "#FB923C", fontSize: 9, fontWeight: 700, cursor: busy ? "default" : "pointer", fontFamily: "Inter, sans-serif" }}
        >
          Wrong vessel
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminPhotosPage() {
  const [adminKey, setAdminKey] = useState<string | null>(() =>
    typeof window !== "undefined" ? sessionStorage.getItem("admin_key") : null
  );

  // Filters
  const [confidence, setConfidence] = useState<"" | "high" | "medium">("");
  const [primaryOnly, setPrimaryOnly] = useState(false);
  const [search, setSearch]           = useState("");
  const [searchInput, setSearchInput] = useState("");

  // Data
  const [photos,  setPhotos]  = useState<Photo[]>([]);
  const [total,   setTotal]   = useState(0);
  const [pages,   setPages]   = useState(1);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPhotos = useCallback(async (key: string, pg: number) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { page: String(pg), limit: "60" };
      if (confidence) params.confidence = confidence;
      if (primaryOnly) params.primaryOnly = "true";
      if (search) params.search = search;
      const res = await fetch(buildUrl("/api/admin/photos", key, params));
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? `HTTP ${res.status}`);
        return;
      }
      const d = await res.json();
      setPhotos(d.photos ?? []);
      setTotal(d.total ?? 0);
      setPages(d.pages ?? 1);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [confidence, primaryOnly, search]);

  // Refetch when filters or page changes
  useEffect(() => {
    if (!adminKey) return;
    fetchPhotos(adminKey, page);
  }, [adminKey, page, fetchPhotos]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [confidence, primaryOnly, search]);

  // Debounced search
  function handleSearchInput(val: string) {
    setSearchInput(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(val), 400);
  }

  function handleDeleted(id: number) {
    setPhotos(prev => prev.filter(p => p.id !== id));
    setTotal(prev => Math.max(0, prev - 1));
  }

  if (!adminKey) {
    return <AuthGate onAuth={k => { setAdminKey(k); }} />;
  }

  const C = {
    bg: "#0D1F28", panel: "#0F2733", steel: "#8FA8B2", fg: "#E8F0F3",
    green: "#1D9E75", border: "rgba(143,168,178,0.12)",
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "Inter, sans-serif", color: C.fg }}>

      {/* Header */}
      <div style={{ background: C.panel, borderBottom: `1px solid ${C.border}`, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Photo Moderation</div>
          <div style={{ fontSize: 11, color: C.steel, marginTop: 2 }}>
            {loading ? "Loading…" : `${total.toLocaleString()} photos`}
            {" · "}
            <span style={{ color: "rgba(234,179,8,0.8)" }}>Yellow = medium (risky)</span>
          </div>
        </div>
        <button
          onClick={() => { sessionStorage.removeItem("admin_key"); setAdminKey(null); }}
          style={{ background: "none", border: "1px solid rgba(143,168,178,0.2)", borderRadius: 6, padding: "6px 12px", color: C.steel, fontSize: 11, cursor: "pointer" }}
        >
          Logout
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ padding: "12px 24px", background: C.panel, borderBottom: `1px solid ${C.border}`, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        {/* Search */}
        <input
          value={searchInput}
          onChange={e => handleSearchInput(e.target.value)}
          placeholder="IMO or vessel name..."
          style={{ padding: "7px 12px", background: "rgba(143,168,178,0.08)", border: `1px solid ${C.border}`, borderRadius: 7, color: C.fg, fontSize: 12, width: 220, outline: "none", fontFamily: "Inter, sans-serif" }}
        />

        {/* Confidence */}
        <div style={{ display: "flex", gap: 4 }}>
          {(["", "medium", "high"] as const).map(v => (
            <button key={v} onClick={() => setConfidence(v)} style={{
              padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none",
              background: confidence === v
                ? (v === "medium" ? "rgba(234,179,8,0.25)" : v === "high" ? "rgba(34,197,94,0.15)" : "rgba(108,184,230,0.15)")
                : "rgba(143,168,178,0.08)",
              color: confidence === v
                ? (v === "medium" ? "#EAB308" : v === "high" ? "#22C55E" : C.fg)
                : C.steel,
            }}>
              {v === "" ? "All" : v === "medium" ? "⚠ Medium" : "✓ High"}
            </button>
          ))}
        </div>

        {/* Primary only */}
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: C.steel }}>
          <input
            type="checkbox"
            checked={primaryOnly}
            onChange={e => setPrimaryOnly(e.target.checked)}
            style={{ accentColor: C.green }}
          />
          Primary only
        </label>

        {/* Refresh */}
        <button
          onClick={() => fetchPhotos(adminKey, page)}
          style={{ padding: "6px 12px", background: "rgba(29,158,117,0.12)", border: "1px solid rgba(29,158,117,0.3)", borderRadius: 6, color: C.green, fontSize: 11, fontWeight: 600, cursor: "pointer" }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ margin: "16px 24px", padding: "10px 16px", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 8, color: "#F87171", fontSize: 12 }}>
          Error: {error}
        </div>
      )}

      {/* Grid */}
      <div style={{ padding: "16px 24px" }}>
        {loading && !photos.length ? (
          <div style={{ textAlign: "center", color: C.steel, padding: 60, fontSize: 13 }}>Loading…</div>
        ) : !photos.length ? (
          <div style={{ textAlign: "center", color: C.steel, padding: 60, fontSize: 13 }}>No results found</div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 10,
          }}>
            {photos.map(p => (
              <PhotoCard
                key={p.id}
                photo={p}
                adminKey={adminKey}
                onDeleted={handleDeleted}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "16px 24px 32px" }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ padding: "7px 16px", background: "rgba(143,168,178,0.08)", border: `1px solid ${C.border}`, borderRadius: 7, color: page === 1 ? "rgba(143,168,178,0.3)" : C.fg, fontSize: 12, cursor: page === 1 ? "default" : "pointer" }}
          >
            ← Previous
          </button>
          <span style={{ padding: "7px 12px", fontSize: 12, color: C.steel }}>
            {page} / {pages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(pages, p + 1))}
            disabled={page === pages}
            style={{ padding: "7px 16px", background: "rgba(143,168,178,0.08)", border: `1px solid ${C.border}`, borderRadius: 7, color: page === pages ? "rgba(143,168,178,0.3)" : C.fg, fontSize: 12, cursor: page === pages ? "default" : "pointer" }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
