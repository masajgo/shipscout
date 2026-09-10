"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";

const NAVY = "#07122E";
const GOLD = "#C9A84C";
const SERIF = "var(--font-serif), Georgia, serif";

type Listing = {
  id: number;
  title: string;
  vessel_type: string;
  year_built: number | null;
  dwt: number | null;
  length_m: number | null;
  beam_m: number | null;
  draft_m: number | null;
  classification: string | null;
  price_usd: number | null;
  price_on_request: boolean;
};

function formatPrice(l: Listing) {
  if (l.price_on_request || !l.price_usd) return "Price on request";
  return "$" + l.price_usd.toLocaleString();
}

function formatDims(l: Listing) {
  if (!l.length_m) return null;
  const parts = [l.length_m + "m"];
  if (l.beam_m) parts.push(l.beam_m + "m");
  if (l.draft_m) parts.push(l.draft_m + "m");
  return parts.join(" × ");
}

export default function ForSalePage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [types, setTypes]       = useState<string[]>([]);
  const [loading, setLoading]   = useState(true);
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch]     = useState("");

  useEffect(() => {
    fetch("/api/for-sale")
      .then(r => r.json())
      .then(d => { setListings(d.listings || []); setTypes(d.types || []); })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return listings.filter(l => {
      if (typeFilter && l.vessel_type !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          l.title?.toLowerCase().includes(q) ||
          l.vessel_type?.toLowerCase().includes(q) ||
          l.classification?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [listings, typeFilter, search]);

  const inputStyle: React.CSSProperties = {
    padding: "9px 14px", fontSize: 13, border: "1px solid #E2E8F0",
    borderRadius: 7, outline: "none", color: "#0F172A", background: "#fff",
  };

  return (
    <div style={{ background: "#F8FAFC", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ background: NAVY, padding: "48px 40px 40px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: GOLD, textTransform: "uppercase", marginBottom: 12 }}>
            Vessels for Sale
          </p>
          <h1 style={{ fontFamily: SERIF, fontSize: "clamp(28px, 3vw, 42px)", fontWeight: 700, color: "#fff", margin: "0 0 12px", lineHeight: 1.1 }}>
            {loading ? "Loading…" : `${filtered.length} vessels available`}
          </h1>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.45)", margin: "0 0 32px" }}>
            Tankers, cargo ships, bulk carriers and more — updated regularly.
          </p>

          {/* Filters */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <input
              placeholder="Search by name, type…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...inputStyle, minWidth: 220 }}
            />
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              style={{ ...inputStyle, minWidth: 200 }}
            >
              <option value="">All vessel types</option>
              {types.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {(typeFilter || search) && (
              <button
                onClick={() => { setTypeFilter(""); setSearch(""); }}
                style={{ ...inputStyle, cursor: "pointer", color: "#64748B", background: "#F8FAFC" }}
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Listings */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 40px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#94A3B8", fontSize: 15 }}>
            Loading vessels…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#94A3B8", fontSize: 15 }}>
            No vessels match your filters.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
            {filtered.map(l => (
              <div key={l.id} style={{
                background: "#fff", borderRadius: 10,
                border: "1px solid #E2E8F0",
                padding: "20px 22px",
                display: "flex", flexDirection: "column", gap: 12,
              }}>
                {/* Type badge */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
                    textTransform: "uppercase", color: NAVY,
                    background: "rgba(7,18,46,0.07)", padding: "3px 8px", borderRadius: 4,
                  }}>
                    {l.vessel_type}
                  </span>
                  {l.year_built && (
                    <span style={{ fontSize: 12, color: "#94A3B8" }}>{l.year_built}</span>
                  )}
                </div>

                {/* Title */}
                <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, lineHeight: 1.35 }}>
                  {l.title}
                </div>

                {/* Specs */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {l.dwt && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, color: "#94A3B8" }}>Deadweight</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{l.dwt.toLocaleString()} MT</span>
                    </div>
                  )}
                  {formatDims(l) && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, color: "#94A3B8" }}>Dimensions</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{formatDims(l)}</span>
                    </div>
                  )}
                  {l.classification && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, color: "#94A3B8" }}>Class</span>
                      <span style={{ fontSize: 12, color: "#374151", textAlign: "right", maxWidth: 180 }}>{l.classification}</span>
                    </div>
                  )}
                </div>

                {/* Price + CTA */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  borderTop: "1px solid #F1F5F9", paddingTop: 12, marginTop: 4,
                }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: l.price_on_request ? "#94A3B8" : NAVY, fontFamily: SERIF }}>
                      {formatPrice(l)}
                    </div>
                  </div>
                  <a href="#contact" style={{
                    fontSize: 12, fontWeight: 700, color: NAVY,
                    background: GOLD, padding: "7px 14px",
                    borderRadius: 6, textDecoration: "none", whiteSpace: "nowrap",
                  }}>
                    Inquire →
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CTA bottom */}
        <div style={{
          marginTop: 64, textAlign: "center", padding: "48px 40px",
          background: NAVY, borderRadius: 12,
        }}>
          <h2 style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 700, color: "#fff", margin: "0 0 12px" }}>
            Don't see what you're looking for?
          </h2>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", margin: "0 0 28px" }}>
            Tell us what you need — vessel type, size, budget. We'll find it before it hits any public listing.
          </p>
          <a href="/#contact" style={{
            display: "inline-block", background: GOLD, color: NAVY,
            padding: "13px 28px", borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: "none",
          }}>
            Start a deal →
          </a>
        </div>
      </div>
    </div>
  );
}
