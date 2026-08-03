"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { use } from "react";
import type { WeeklyDigestDetail, WeeklyDigestEvent } from "@/app/api/weekly/[week]/route";

// ─── Design tokens ────────────────────────────────────────────────────────────

const NAVY   = "#101828";
const GREEN  = "#1D9E75";
const GOLD   = "#C9A84C";

const CATEGORY_META = [
  { key: "arrest_seizure", label: "Arrests & Seizures", types: ["arrest", "bank_seizure"],
    color: "#991B1B", bg: "#FEF2F2", border: "#FECACA" },
  { key: "auction",        label: "Judicial Auctions",  types: ["auction"],
    color: "#92400E", bg: "#FFFBEB", border: "#FDE68A" },
  { key: "detention",      label: "PSC Detentions",     types: ["detention"],
    color: "#7C3D12", bg: "#FFF7ED", border: "#FED7AA" },
  { key: "sanction",       label: "Sanctions",          types: ["sanction"],
    color: "#4C1D95", bg: "#F5F3FF", border: "#DDD6FE" },
  { key: "scrap_sale",     label: "Scrap Candidates",   types: ["scrap_sale"],
    color: "#064E3B", bg: "#ECFDF5", border: "#A7F3D0" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripMarkdown(text: string): string {
  return text
    .replace(/^#+\s+.*$/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
}

function categoryOf(eventType: string) {
  return CATEGORY_META.find(c => c.types.includes(eventType))
    ?? { color: "#374151", bg: "#F3F4F6", border: "#D1D5DB", label: eventType };
}

function typeLabel(t: string) {
  return t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function vesselSpecs(ev: WeeklyDigestEvent) {
  return [
    ev.imo         ? `IMO ${ev.imo}`                                              : null,
    ev.vessel_type ?? null,
    ev.vessel_dwt  ? `${Number(ev.vessel_dwt).toLocaleString()} DWT`             : null,
    ev.vessel_built ? `Built ${ev.vessel_built}`                                  : null,
    ev.vessel_flag ?? null,
  ].filter(Boolean).join(" · ");
}

// ─── Placeholder photo ────────────────────────────────────────────────────────

function PlaceholderPhoto({ type, imo, height }: { type?: string | null; imo?: string | null; height: number }) {
  return (
    <div style={{ width: "100%", height, background: NAVY, display: "flex",
      flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none"
        xmlns="http://www.w3.org/2000/svg" opacity={0.55}>
        {/* simple ship hull side-view */}
        <path d="M4 28 L8 18 L36 18 L40 28 Z" stroke={GREEN} strokeWidth="1.8" fill="none" strokeLinejoin="round"/>
        <line x1="22" y1="10" x2="22" y2="18" stroke={GREEN} strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M14 10 L22 10 L30 14 L14 14 Z" stroke={GREEN} strokeWidth="1.5" fill="none" strokeLinejoin="round"/>
        <line x1="4" y1="28" x2="40" y2="28" stroke={GREEN} strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
      {type && (
        <div style={{ fontSize: 11, color: "#4B5563", fontFamily: "Inter, sans-serif",
          letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {type}
        </div>
      )}
      {imo && (
        <div style={{ fontSize: 10, color: "#374151", fontFamily: "monospace" }}>
          IMO {imo}
        </div>
      )}
    </div>
  );
}

// ─── Photo with attribution ───────────────────────────────────────────────────

function VesselPhoto({ ev, height, rounded = false }: {
  ev: WeeklyDigestEvent; height: number; rounded?: boolean;
}) {
  const hasPhoto = !!ev.photo_url;
  const borderRadius = rounded ? 6 : 0;

  return (
    <div style={{ position: "relative", width: "100%", height, overflow: "hidden",
      borderRadius, flexShrink: 0 }}>
      {hasPhoto ? (
        <>
          <img
            src={ev.photo_thumb || ev.photo_url!}
            alt={ev.vessel_name ?? `IMO ${ev.imo}`}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            loading="lazy"
          />
          {ev.photo_attribution && (
            <div style={{ position: "absolute", bottom: 0, right: 0,
              fontSize: 9, color: "rgba(255,255,255,0.75)",
              background: "rgba(0,0,0,0.45)", padding: "2px 6px",
              fontFamily: "Inter, sans-serif", lineHeight: 1.4 }}>
              {ev.photo_attribution}
            </div>
          )}
        </>
      ) : (
        <PlaceholderPhoto type={ev.vessel_type} imo={ev.imo} height={height} />
      )}
    </div>
  );
}

// ─── Type badge ───────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const cat = categoryOf(type);
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 3,
      color: cat.color, background: cat.bg, border: `1px solid ${cat.border}`,
      textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap",
      fontFamily: "Inter, sans-serif" }}>
      {typeLabel(type)}
    </span>
  );
}

// ─── Contact badge ────────────────────────────────────────────────────────────

function ContactBadge() {
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 3,
      color: GREEN, background: "#ECFDF5", border: "1px solid #A7F3D0",
      fontFamily: "Inter, sans-serif" }}>
      Contact available
    </span>
  );
}

// ─── Lead story ───────────────────────────────────────────────────────────────

function LeadStory({ ev }: { ev: WeeklyDigestEvent }) {
  const dateStr = ev.event_date ? formatDate(ev.event_date) : null;
  const specs   = vesselSpecs(ev);
  const text    = stripMarkdown(ev.editorial_summary || ev.summary);
  const name    = ev.vessel_name || (ev.imo ? `IMO ${ev.imo}` : null);

  return (
    <section style={{ marginBottom: 52 }}>
      {/* Section kicker */}
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em",
        textTransform: "uppercase", color: GOLD, fontFamily: "Inter, sans-serif",
        marginBottom: 14 }}>
        Lead Story
      </div>

      {/* Cover photo */}
      <div style={{ borderRadius: 8, overflow: "hidden", marginBottom: 24, position: "relative" }}>
        <VesselPhoto ev={ev} height={400} />
      </div>

      {/* Meta row */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <TypeBadge type={ev.event_type} />
        {ev.location && (
          <span style={{ fontSize: 13, color: "#6B7280", fontFamily: "Inter, sans-serif" }}>
            {ev.location}
          </span>
        )}
        {dateStr && (
          <span style={{ fontSize: 12, color: "#9CA3AF", fontFamily: "Inter, sans-serif" }}>
            {dateStr}
          </span>
        )}
      </div>

      {/* Vessel name */}
      {name && (
        ev.vessel_mmsi ? (
          <Link href={`/?mmsi=${ev.vessel_mmsi}`} style={{ textDecoration: "none" }}>
            <h2 style={{ fontSize: 34, fontWeight: 800, color: NAVY, margin: "0 0 18px",
              fontFamily: "'Georgia', serif", letterSpacing: "-0.02em", lineHeight: 1.1,
              borderBottom: `2px solid ${GREEN}`, display: "inline" }}>
              {name}
            </h2>
          </Link>
        ) : (
          <h2 style={{ fontSize: 34, fontWeight: 800, color: NAVY, margin: "0 0 18px",
            fontFamily: "'Georgia', serif", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
            {name}
          </h2>
        )
      )}

      {/* Editorial text */}
      {text && (
        <p style={{ fontSize: 17, color: "#1F2937", lineHeight: 1.8, margin: "0 0 20px",
          fontFamily: "'Georgia', serif" }}>
          {text}
        </p>
      )}

      {/* Vessel specs */}
      {specs && (
        <div style={{ fontSize: 12, color: "#6B7280", fontFamily: "Inter, sans-serif",
          borderTop: `1px solid #F3F4F6`, paddingTop: 12, marginBottom: 14 }}>
          {specs}
        </div>
      )}

      {/* Footer row */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        {ev.has_contact && <ContactBadge />}
        <span style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "Inter, sans-serif" }}>
          Source: {ev.source_name}
        </span>
      </div>
    </section>
  );
}

// ─── Grid card ────────────────────────────────────────────────────────────────

function GridCard({ ev }: { ev: WeeklyDigestEvent }) {
  const dateStr = ev.event_date ? formatDate(ev.event_date) : null;
  const specs   = vesselSpecs(ev);
  const name    = ev.vessel_name || (ev.imo ? `IMO ${ev.imo}` : null);

  return (
    <div style={{ border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden",
      background: "#fff", display: "flex", flexDirection: "column" }}>

      {/* Photo */}
      <VesselPhoto ev={ev} height={180} />

      {/* Content */}
      <div style={{ padding: "14px 16px 16px", flex: 1, display: "flex",
        flexDirection: "column", gap: 8 }}>

        {/* Badge + meta */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <TypeBadge type={ev.event_type} />
          {dateStr && (
            <span style={{ fontSize: 10, color: "#9CA3AF", fontFamily: "Inter, sans-serif" }}>
              {dateStr}
            </span>
          )}
        </div>

        {/* Vessel name */}
        {name && (
          ev.vessel_mmsi ? (
            <Link href={`/?mmsi=${ev.vessel_mmsi}`} style={{ textDecoration: "none" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: NAVY,
                fontFamily: "'Georgia', serif", lineHeight: 1.25,
                borderBottom: `1px solid ${GREEN}`, display: "inline" }}>
                {name}
              </div>
            </Link>
          ) : (
            <div style={{ fontSize: 16, fontWeight: 700, color: NAVY,
              fontFamily: "'Georgia', serif", lineHeight: 1.25 }}>
              {name}
            </div>
          )
        )}

        {/* Location */}
        {ev.location && (
          <div style={{ fontSize: 11, color: "#6B7280", fontFamily: "Inter, sans-serif" }}>
            {ev.location}
          </div>
        )}

        {/* Summary */}
        <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.65, margin: 0,
          fontFamily: "Inter, sans-serif",
          display: "-webkit-box", WebkitLineClamp: 4,
          WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties}>
          {ev.summary}
        </p>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Specs + source */}
        {specs && (
          <div style={{ fontSize: 10, color: "#9CA3AF", fontFamily: "Inter, sans-serif",
            borderTop: "1px solid #F3F4F6", paddingTop: 8, marginTop: 4 }}>
            {specs}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {ev.has_contact && <ContactBadge />}
          <span style={{ fontSize: 10, color: "#9CA3AF", fontFamily: "Inter, sans-serif" }}>
            {ev.source_name}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Category section ─────────────────────────────────────────────────────────

function CategorySection({
  label, events, leadId, color,
}: {
  label: string; events: WeeklyDigestEvent[];
  leadId: number | null; color: string;
}) {
  // Exclude lead story from section (already shown above)
  const sectionEvents = events.filter(e => e.id !== leadId);
  if (sectionEvents.length === 0) return null;

  return (
    <div style={{ marginBottom: 48 }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20,
        borderBottom: `2px solid ${color}`, paddingBottom: 10 }}>
        <h2 style={{ fontSize: 13, fontWeight: 800, color, margin: 0,
          textTransform: "uppercase", letterSpacing: "0.12em",
          fontFamily: "Inter, sans-serif" }}>
          {label}
        </h2>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#9CA3AF",
          fontFamily: "Inter, sans-serif" }}>
          {sectionEvents.length}
        </span>
      </div>

      {/* 2-col grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        {sectionEvents.map(ev => <GridCard key={ev.id} ev={ev} />)}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WeeklyDigestPage({ params }: { params: Promise<{ week: string }> }) {
  const { week }  = use(params);
  const [digest, setDigest]   = useState<WeeklyDigestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/weekly/${week}`)
      .then(async r => {
        if (r.status === 404) { setNotFound(true); return; }
        setDigest(await r.json());
      })
      .finally(() => setLoading(false));
  }, [week]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", color: "#9CA3AF", padding: 80,
        fontFamily: "Inter, sans-serif" }}>
        Loading…
      </div>
    );
  }

  if (notFound || !digest) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "60px 24px",
        fontFamily: "Inter, sans-serif", textAlign: "center" }}>
        <div style={{ fontSize: 16, color: "#6B7280" }}>Digest not found.</div>
        <Link href="/weekly" style={{ color: GREEN, fontSize: 14,
          marginTop: 16, display: "inline-block" }}>
          ← Back to archive
        </Link>
      </div>
    );
  }

  const leadEvent = digest.lead_story_id
    ? digest.events.find(e => e.id === digest.lead_story_id) ?? digest.events[0]
    : digest.events[0];

  const grouped = CATEGORY_META.map(cat => ({
    ...cat,
    events: digest.events.filter(e => cat.types.includes(e.event_type)),
  }));

  return (
    <>
      <style>{`
        @media print {
          nav, header, .no-print { display: none !important; }
          body { background: #fff !important; }
          a { color: inherit !important; text-decoration: none !important; }
          .grid-2col { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 600px) {
          .grid-2col { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "36px 24px 80px",
        fontFamily: "'Georgia', 'Times New Roman', serif" }}>

        {/* Back */}
        <div className="no-print" style={{ marginBottom: 28 }}>
          <Link href="/weekly"
            style={{ fontSize: 13, color: "#6B7280", textDecoration: "none",
              fontFamily: "Inter, sans-serif" }}>
            ← All issues
          </Link>
        </div>

        {/* ── Masthead ── */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.2em",
            textTransform: "uppercase", color: GREEN,
            fontFamily: "Inter, sans-serif", marginBottom: 10 }}>
            ShipScout Intelligence
          </div>
          <div style={{ fontSize: 52, fontWeight: 900, color: NAVY,
            letterSpacing: "-0.035em", lineHeight: 0.9,
            fontFamily: "'Georgia', serif", marginBottom: 16 }}>
            SHIPSCOUT<br />WEEKLY
          </div>
          <div style={{ height: 2, background: GOLD, marginBottom: 16 }} />
          <div style={{ display: "flex", justifyContent: "space-between",
            alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: NAVY,
              fontFamily: "'Georgia', serif" }}>
              {digest.week_label}
            </div>
            <div style={{ fontSize: 13, color: "#9CA3AF",
              fontFamily: "Inter, sans-serif" }}>
              {digest.event_count} event{digest.event_count !== 1 ? "s" : ""}
            </div>
          </div>
        </div>

        {/* ── Intro ── */}
        {digest.intro_text && (
          <p style={{ fontSize: 15, color: "#4B5563", lineHeight: 1.8,
            margin: "0 0 40px", fontStyle: "italic",
            borderLeft: `3px solid ${GOLD}`, paddingLeft: 16,
            fontFamily: "'Georgia', serif" }}>
            {digest.intro_text}
          </p>
        )}

        {/* ── Lead story ── */}
        {leadEvent && <LeadStory ev={leadEvent} />}

        {/* ── Category sections ── */}
        {grouped.map(cat => (
          <CategorySection
            key={cat.key}
            label={cat.label}
            events={cat.events}
            leadId={leadEvent?.id ?? null}
            color={cat.color}
          />
        ))}

        {/* ── Footer ── */}
        <div style={{ borderTop: `1px solid #E5E7EB`, paddingTop: 24, marginTop: 40,
          display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "Inter, sans-serif" }}>
            Compiled by ShipScout · shipscout.io
          </span>
          <span style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "Inter, sans-serif" }}>
            Contact details available to registered users only.
          </span>
        </div>
      </div>
    </>
  );
}
