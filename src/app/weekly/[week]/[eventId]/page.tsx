"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { use } from "react";
import VesselTypeSVG from "@/components/VesselTypeSVG";
import type { ArticleResponse, ArticleEvent } from "@/app/api/weekly/[week]/[eventId]/route";

// ─── Tokens ───────────────────────────────────────────────────────────────────

const NAVY  = "#101828";
const GREEN = "#1D9E75";
const GOLD  = "#C9A84C";

const TYPE_BADGE: Record<string, { color: string; bg: string; border: string }> = {
  arrest:           { color: "#991B1B", bg: "#FEF2F2", border: "#FECACA" },
  bank_seizure:     { color: "#7F1D1D", bg: "#FFF0F0", border: "#FECACA" },
  judicial_auction: { color: "#92400E", bg: "#FFFBEB", border: "#FDE68A" },
  auction:          { color: "#92400E", bg: "#FFFBEB", border: "#FDE68A" },
  bankruptcy:       { color: "#4C1D95", bg: "#F5F3FF", border: "#DDD6FE" },
  detention:        { color: "#7C3D12", bg: "#FFF7ED", border: "#FED7AA" },
  sanction:         { color: "#374151", bg: "#F9FAFB", border: "#D1D5DB" },
  scrap_sale:       { color: "#064E3B", bg: "#ECFDF5", border: "#A7F3D0" },
  layup:            { color: "#1E40AF", bg: "#EFF6FF", border: "#BFDBFE" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function typeLabel(t: string) {
  const labels: Record<string, string> = {
    arrest: "Arrest", bank_seizure: "Bank Seizure",
    judicial_auction: "Judicial Auction", auction: "Judicial Auction",
    bankruptcy: "Bankruptcy", detention: "PSC Detention",
    sanction: "Sanction", scrap_sale: "Scrap Sale", layup: "Layup",
  };
  return labels[t] ?? t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
}

function stripMarkdown(text: string) {
  return text
    .replace(/^#+\s+.*$/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── Photo / placeholder ──────────────────────────────────────────────────────

function HeroImage({ ev, height }: { ev: ArticleEvent; height: number }) {
  if (ev.photo_url) {
    return (
      <div style={{ position: "relative", width: "100%", height, overflow: "hidden", borderRadius: 8 }}>
        <img
          src={ev.photo_thumb ?? ev.photo_url}
          alt={ev.vessel_name ?? `IMO ${ev.imo}`}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
        {ev.photo_attribution && (
          <div style={{ position: "absolute", bottom: 0, right: 0,
            fontSize: 9, color: "rgba(255,255,255,0.75)",
            background: "rgba(0,0,0,0.5)", padding: "3px 8px",
            fontFamily: "Inter, sans-serif" }}>
            {ev.photo_attribution}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height, borderRadius: 8, overflow: "hidden" }}>
      <VesselTypeSVG vesselType={ev.vessel_type} imo={ev.imo} width="100%" height="100%" />
    </div>
  );
}

// ─── Related card ─────────────────────────────────────────────────────────────

function RelatedCard({ ev, weekSlug }: { ev: ArticleEvent; weekSlug: string }) {
  const bs = TYPE_BADGE[ev.event_type] ?? TYPE_BADGE.sanction;
  const name = ev.vessel_name || (ev.imo ? `IMO ${ev.imo}` : "Unknown vessel");

  return (
    <Link href={`/weekly/${weekSlug}/${ev.id}`} style={{ textDecoration: "none", display: "block" }}>
      <div style={{ border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden",
        background: "#fff", transition: "border-color 0.15s" }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = GREEN)}
        onMouseLeave={e => (e.currentTarget.style.borderColor = "#E5E7EB")}>

        {/* Thumbnail */}
        <div style={{ height: 110, overflow: "hidden" }}>
          {ev.photo_url ? (
            <img src={ev.photo_thumb ?? ev.photo_url} alt={name}
              style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <VesselTypeSVG vesselType={ev.vessel_type} imo={ev.imo} width="100%" height="110" />
          )}
        </div>

        <div style={{ padding: "10px 12px 12px" }}>
          <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 3,
            color: bs.color, background: bs.bg, border: `1px solid ${bs.border}`,
            textTransform: "uppercase", letterSpacing: "0.07em",
            fontFamily: "Inter, sans-serif" }}>
            {typeLabel(ev.event_type)}
          </span>
          <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginTop: 6,
            fontFamily: "'Georgia', serif", lineHeight: 1.3 }}>
            {name}
          </div>
          {ev.location && (
            <div style={{ fontSize: 10, color: "#9CA3AF", fontFamily: "Inter, sans-serif", marginTop: 3 }}>
              {ev.location}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ArticlePage({
  params,
}: {
  params: Promise<{ week: string; eventId: string }>;
}) {
  const { week, eventId } = use(params);
  const [data,    setData]    = useState<ArticleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/weekly/${week}/${eventId}`)
      .then(async r => {
        if (r.status === 404) { setNotFound(true); return; }
        setData(await r.json());
      })
      .finally(() => setLoading(false));
  }, [week, eventId]);

  if (loading) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "60px 24px",
        textAlign: "center", fontFamily: "Inter, sans-serif" }}>
        <div style={{ color: "#9CA3AF", marginBottom: 8 }}>Generating article…</div>
        <div style={{ fontSize: 12, color: "#D1D5DB" }}>First load may take a few seconds.</div>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "60px 24px",
        textAlign: "center", fontFamily: "Inter, sans-serif" }}>
        <div style={{ color: "#6B7280" }}>Article not found.</div>
        <Link href={`/weekly/${week}`} style={{ color: GREEN, display: "inline-block", marginTop: 16 }}>
          ← Back to issue
        </Link>
      </div>
    );
  }

  const { event: ev, related, week_label } = data;
  const badge = TYPE_BADGE[ev.event_type] ?? TYPE_BADGE.sanction;
  const vesselName = ev.vessel_name || (ev.imo ? `IMO ${ev.imo}` : "Unknown vessel");
  const headline   = ev.article_headline
    ? stripMarkdown(ev.article_headline)
    : vesselName;

  const bodyParagraphs: string[] = ev.article_body
    ? stripMarkdown(ev.article_body).split(/\n\n+/).filter(Boolean)
    : [ev.summary];

  const specs = [
    ev.imo         ? `IMO ${ev.imo}`                                       : null,
    ev.vessel_type ?? null,
    ev.vessel_dwt  ? `${Number(ev.vessel_dwt).toLocaleString()} DWT`       : null,
    ev.vessel_built ? `Built ${ev.vessel_built}`                           : null,
    ev.vessel_flag ?? null,
  ].filter(Boolean);

  return (
    <>
      <style>{`
        @media print {
          nav, header, .no-print { display: none !important; }
          body { background: #fff !important; }
          a { color: inherit !important; text-decoration: none !important; }
        }
      `}</style>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px 80px" }}>

        {/* ── Breadcrumb ── */}
        <div className="no-print" style={{ marginBottom: 24, fontFamily: "Inter, sans-serif",
          fontSize: 13, color: "#6B7280" }}>
          <Link href="/weekly" style={{ color: "#9CA3AF", textDecoration: "none" }}>
            Weekly
          </Link>
          {" / "}
          <Link href={`/weekly/${week}`} style={{ color: "#6B7280", textDecoration: "none" }}>
            {week_label}
          </Link>
        </div>

        {/* ── Hero image ── */}
        <HeroImage ev={ev} height={460} />

        {/* ── Article header ── */}
        <div style={{ marginTop: 28, marginBottom: 24 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 3,
              color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`,
              textTransform: "uppercase", letterSpacing: "0.08em",
              fontFamily: "Inter, sans-serif" }}>
              {typeLabel(ev.event_type)}
            </span>
            {ev.location && (
              <span style={{ fontSize: 13, color: "#6B7280", fontFamily: "Inter, sans-serif" }}>
                {ev.location}
              </span>
            )}
            {ev.event_date && (
              <span style={{ fontSize: 12, color: "#9CA3AF", fontFamily: "Inter, sans-serif" }}>
                {formatDate(ev.event_date)}
              </span>
            )}
          </div>

          <h1 style={{ fontSize: 30, fontWeight: 900, color: NAVY, margin: "0 0 8px",
            fontFamily: "'Georgia', serif", letterSpacing: "-0.02em", lineHeight: 1.15 }}>
            {headline}
          </h1>

          <div style={{ fontSize: 12, color: "#9CA3AF", fontFamily: "Inter, sans-serif" }}>
            Source: {ev.source_name}
          </div>
        </div>

        {/* ── Gold divider ── */}
        <div style={{ height: 2, background: GOLD, marginBottom: 28 }} />

        {/* ── Two-column layout: article + sidebar ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: 40,
          alignItems: "start" }}>

          {/* Article body */}
          <div>
            {bodyParagraphs.map((para, i) => (
              <p key={i} style={{ fontSize: 16, color: "#1F2937", lineHeight: 1.85,
                margin: "0 0 20px", fontFamily: "'Georgia', serif" }}>
                {para}
              </p>
            ))}
          </div>

          {/* Sidebar */}
          <div style={{ position: "sticky", top: 24 }}>

            {/* Vessel details */}
            <div style={{ border: "1px solid #E5E7EB", borderRadius: 8, padding: "16px 18px",
              marginBottom: 16, background: "#FAFAFA" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: GOLD,
                textTransform: "uppercase", letterSpacing: "0.12em",
                fontFamily: "Inter, sans-serif", marginBottom: 12 }}>
                Vessel Details
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: NAVY,
                  fontFamily: "'Georgia', serif", lineHeight: 1.2 }}>
                  {vesselName}
                </div>
                {specs.map(s => (
                  <div key={s} style={{ fontSize: 12, color: "#6B7280",
                    fontFamily: "Inter, sans-serif" }}>
                    {s}
                  </div>
                ))}
                {(ev.owner_name || ev.manager_name) && (
                  <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: 8, marginTop: 4,
                    fontSize: 12, color: "#6B7280", fontFamily: "Inter, sans-serif" }}>
                    {ev.manager_name || ev.owner_name}
                  </div>
                )}
                {ev.vessel_mmsi && (
                  <Link href={`/?mmsi=${ev.vessel_mmsi}`}
                    style={{ fontSize: 12, color: GREEN, fontFamily: "Inter, sans-serif",
                      textDecoration: "none", marginTop: 4, display: "inline-block" }}>
                    View in fleet map →
                  </Link>
                )}
              </div>
            </div>

            {/* Contact CTA */}
            {ev.has_contact && (
              <Link href="/opportunities" style={{ textDecoration: "none", display: "block" }}>
                <div style={{ background: GREEN, borderRadius: 8, padding: "14px 18px",
                  marginBottom: 16, cursor: "pointer" }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#fff",
                    fontFamily: "Inter, sans-serif", marginBottom: 4 }}>
                    OWNER CONTACT AVAILABLE
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)",
                    fontFamily: "Inter, sans-serif", lineHeight: 1.4 }}>
                    View in Opportunities →
                  </div>
                </div>
              </Link>
            )}

            {/* Source */}
            <div style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "Inter, sans-serif",
              lineHeight: 1.5 }}>
              Source: {ev.source_name}.
              Contact details available to registered users only.
            </div>
          </div>
        </div>

        {/* ── More from this issue ── */}
        {related.length > 0 && (
          <div style={{ marginTop: 52, borderTop: "1px solid #E5E7EB", paddingTop: 32 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#9CA3AF",
              textTransform: "uppercase", letterSpacing: "0.14em",
              fontFamily: "Inter, sans-serif", marginBottom: 20 }}>
              More from {week_label}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: 14 }}>
              {related.slice(0, 4).map(r => (
                <RelatedCard key={r.id} ev={r} weekSlug={week} />
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 40, borderTop: "1px solid #E5E7EB", paddingTop: 20,
          display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "Inter, sans-serif" }}>
            Compiled by ShipScout · shipscout.io
          </span>
          <Link href={`/weekly/${week}`} className="no-print"
            style={{ fontSize: 12, color: GREEN, fontFamily: "Inter, sans-serif",
              textDecoration: "none" }}>
            ← Back to {week_label}
          </Link>
        </div>
      </div>
    </>
  );
}
