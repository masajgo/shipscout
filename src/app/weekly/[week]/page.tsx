"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { use } from "react";
import type { WeeklyDigestDetail, WeeklyDigestEvent } from "@/app/api/weekly/[week]/route";

// ─── Design tokens ────────────────────────────────────────────────────────────

const CATEGORY_META = [
  {
    key:    "arrest_seizure",
    label:  "Arrests & Seizures",
    types:  ["arrest", "bank_seizure"],
    color:  "#991B1B", bg: "#FEF2F2", border: "#FECACA",
  },
  {
    key:    "auction",
    label:  "Judicial Auctions",
    types:  ["auction"],
    color:  "#C9A84C", bg: "#FEFCE8", border: "#FDE68A",
  },
  {
    key:    "detention",
    label:  "PSC Detentions",
    types:  ["detention"],
    color:  "#92400E", bg: "#FFF7ED", border: "#FED7AA",
  },
  {
    key:    "sanction",
    label:  "Sanctions",
    types:  ["sanction"],
    color:  "#6B21A8", bg: "#FAF5FF", border: "#E9D5FF",
  },
  {
    key:    "scrap_sale",
    label:  "Scrap Candidates",
    types:  ["scrap_sale"],
    color:  "#065F46", bg: "#ECFDF5", border: "#A7F3D0",
  },
];

// ─── Components ───────────────────────────────────────────────────────────────

function EventTypeBadge({ type }: { type: string }) {
  const cat = CATEGORY_META.find(c => c.types.includes(type));
  const s   = cat ?? { color: "#374151", bg: "#F3F4F6", border: "#D1D5DB" };
  const label = type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 3,
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
      textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function EventCard({ ev }: { ev: WeeklyDigestEvent }) {
  const vesselLabel = ev.vessel_name || (ev.imo ? `IMO ${ev.imo}` : "Unknown vessel");
  const ownerLabel  = ev.owner_name ?? ev.manager_name;
  const dateStr = ev.event_date
    ? new Date(ev.event_date + "T00:00:00Z").toLocaleDateString("en-GB",
        { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: 20, marginTop: 20 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>

        {/* Badge + date col */}
        <div style={{ flexShrink: 0, minWidth: 130, display: "flex", flexDirection: "column", gap: 5 }}>
          <EventTypeBadge type={ev.event_type} />
          {dateStr && (
            <span style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "Inter, sans-serif" }}>
              {dateStr}
            </span>
          )}
          {ev.location && (
            <span style={{ fontSize: 11, color: "#6B7280", fontFamily: "Inter, sans-serif" }}>
              {ev.location}
            </span>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: "1 1 300px", minWidth: 240 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
            {ev.matched_vessel_id ? (
              <Link href={`/?mmsi=${ev.vessel_mmsi}`}
                style={{ fontSize: 16, fontWeight: 700, color: "#101828",
                  fontFamily: "'Georgia', serif", textDecoration: "none",
                  borderBottom: "1px solid #1D9E75" }}>
                {vesselLabel}
              </Link>
            ) : (
              <span style={{ fontSize: 16, fontWeight: 700, color: "#101828",
                fontFamily: "'Georgia', serif" }}>
                {vesselLabel}
              </span>
            )}
            {ev.imo && (
              <span style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "Inter, sans-serif" }}>
                IMO {ev.imo}
              </span>
            )}
            {ev.vessel_flag && (
              <span style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "Inter, sans-serif" }}>
                {ev.vessel_flag}
              </span>
            )}
          </div>

          <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.65, margin: "0 0 10px",
            fontFamily: "Inter, sans-serif" }}>
            {ev.summary}
          </p>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            {ownerLabel && (
              <span style={{ fontSize: 12, color: "#6B7280", fontFamily: "Inter, sans-serif" }}>
                {ownerLabel}
              </span>
            )}
            {ev.has_contact && (
              <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                color: "#1D9E75", background: "#ECFDF5", border: "1px solid #A9EFC5",
                fontFamily: "Inter, sans-serif" }}>
                Contact available
              </span>
            )}
            <span style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "Inter, sans-serif" }}>
              Source: {ev.source_name}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CategorySection({
  label, events, color, bg, border,
}: {
  label: string; events: WeeklyDigestEvent[];
  color: string; bg: string; border: string;
}) {
  if (events.length === 0) return null;
  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color, textTransform: "uppercase",
          letterSpacing: "0.1em", margin: 0, fontFamily: "Inter, sans-serif" }}>
          {label}
        </h2>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 3,
          color, background: bg, border: `1px solid ${border}` }}>
          {events.length}
        </span>
      </div>
      {events.map(ev => <EventCard key={ev.id} ev={ev} />)}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WeeklyDigestPage({ params }: { params: Promise<{ week: string }> }) {
  const { week } = use(params);
  const [digest, setDigest] = useState<WeeklyDigestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/weekly/${week}`)
      .then(async r => {
        if (r.status === 404) { setNotFound(true); return; }
        const d = await r.json();
        setDigest(d);
      })
      .finally(() => setLoading(false));
  }, [week]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", color: "#9CA3AF", padding: 80, fontFamily: "Inter, sans-serif" }}>
        Loading digest…
      </div>
    );
  }

  if (notFound || !digest) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "60px 24px",
        fontFamily: "Inter, sans-serif", textAlign: "center" }}>
        <div style={{ fontSize: 16, color: "#6B7280" }}>Digest not found.</div>
        <Link href="/weekly" style={{ color: "#1D9E75", fontSize: 14, marginTop: 16, display: "inline-block" }}>
          ← Back to archive
        </Link>
      </div>
    );
  }

  // Group events by category
  const grouped = CATEGORY_META.map(cat => ({
    ...cat,
    events: digest.events.filter(e => cat.types.includes(e.event_type)),
  }));

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          nav, header, .no-print { display: none !important; }
          body { background: #fff !important; }
          a { color: inherit !important; text-decoration: none !important; }
        }
      `}</style>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px 80px",
        fontFamily: "'Georgia', 'Times New Roman', serif" }}>

        {/* Back link */}
        <div className="no-print" style={{ marginBottom: 24 }}>
          <Link href="/weekly"
            style={{ fontSize: 13, color: "#6B7280", textDecoration: "none",
              fontFamily: "Inter, sans-serif" }}>
            ← All digests
          </Link>
        </div>

        {/* Masthead */}
        <div style={{ borderBottom: "2px solid #101828", paddingBottom: 20, marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
            textTransform: "uppercase", color: "#1D9E75", marginBottom: 10,
            fontFamily: "Inter, sans-serif" }}>
            ShipScout Weekly
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#101828", margin: "0 0 4px",
            fontFamily: "'Georgia', serif", letterSpacing: "-0.01em" }}>
            {digest.week_label}
          </h1>
          <div style={{ fontSize: 12, color: "#9CA3AF", fontFamily: "Inter, sans-serif" }}>
            {digest.event_count} event{digest.event_count !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Intro */}
        {digest.intro_text && (
          <p style={{ fontSize: 16, color: "#374151", lineHeight: 1.75, margin: "0 0 36px",
            fontStyle: "italic", borderLeft: "3px solid #1D9E75", paddingLeft: 16 }}>
            {digest.intro_text}
          </p>
        )}

        {/* Event sections */}
        {grouped.map(cat => (
          <CategorySection
            key={cat.key}
            label={cat.label}
            events={cat.events}
            color={cat.color}
            bg={cat.bg}
            border={cat.border}
          />
        ))}

        {/* Footer */}
        <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: 24, marginTop: 40,
          fontSize: 11, color: "#9CA3AF", fontFamily: "Inter, sans-serif",
          display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span>ShipScout Intelligence — Confidential</span>
          <span>Contact details available to registered users only.</span>
        </div>
      </div>
    </>
  );
}
