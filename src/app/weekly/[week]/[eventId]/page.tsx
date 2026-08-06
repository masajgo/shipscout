"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { use } from "react";
import VesselTypeSVG from "@/components/VesselTypeSVG";
import type { ArticleResponse, ArticleEvent } from "@/app/api/weekly/[week]/[eventId]/route";

// ─── Tokens ────────────────────────────────────────────────────────────────────
const NAVY  = "#101828";
const GREEN = "#1D9E75";
const GOLD  = "#C9A84C";
const BG    = "#FAFAF8";

const TYPE_CFG: Record<string, { label: string; color: string; bg: string; border: string; bar: string }> = {
  arrest:           { label: "Arrest",          color: "#991B1B", bg: "#FEF2F2", border: "#FECACA", bar: "#EF4444" },
  bank_seizure:     { label: "Bank Seizure",     color: "#7F1D1D", bg: "#FEF2F2", border: "#FECACA", bar: "#DC2626" },
  judicial_auction: { label: "Judicial Auction", color: "#92400E", bg: "#FFFBEB", border: "#FDE68A", bar: "#F59E0B" },
  auction:          { label: "Judicial Auction", color: "#92400E", bg: "#FFFBEB", border: "#FDE68A", bar: "#F59E0B" },
  bankruptcy:       { label: "Bankruptcy",       color: "#4C1D95", bg: "#F5F3FF", border: "#DDD6FE", bar: "#8B5CF6" },
  detention:        { label: "PSC Detention",    color: "#7C3D12", bg: "#FFF7ED", border: "#FED7AA", bar: "#EA580C" },
  sanction:         { label: "Sanction",         color: "#374151", bg: "#F9FAFB", border: "#D1D5DB", bar: "#6B7280" },
  scrap_sale:       { label: "Scrap Sale",       color: "#064E3B", bg: "#ECFDF5", border: "#A7F3D0", bar: "#10B981" },
  layup:            { label: "Layup",            color: "#1E40AF", bg: "#EFF6FF", border: "#BFDBFE", bar: "#3B82F6" },
};

function cfg(type: string) {
  return TYPE_CFG[type] ?? { label: type.replace(/_/g, " "), color: "#374151", bg: "#F9FAFB", border: "#D1D5DB", bar: "#6B7280" };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
}
function stripMarkdown(text: string) {
  return text.replace(/^#+\s+.*$/gm, "").replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1").replace(/\n{3,}/g, "\n\n").trim();
}

// ─── Hero image ────────────────────────────────────────────────────────────────
function HeroImage({ ev }: { ev: ArticleEvent }) {
  if (ev.photo_url) {
    return (
      <div style={{ position: "relative", width: "100%", paddingTop: "52%", overflow: "hidden", borderRadius: 4 }}>
        <img
          src={ev.photo_thumb ?? ev.photo_url}
          alt={ev.vessel_name ?? `IMO ${ev.imo}`}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
        {ev.photo_attribution && (
          <div style={{ position: "absolute", bottom: 0, right: 0,
            fontSize: 9, color: "rgba(255,255,255,0.65)",
            background: "rgba(0,0,0,0.4)", padding: "3px 8px",
            fontFamily: "Inter, sans-serif" }}>
            {ev.photo_attribution}
          </div>
        )}
      </div>
    );
  }
  return (
    <div style={{ width: "100%", paddingTop: "52%", position: "relative", overflow: "hidden", borderRadius: 4 }}>
      <div style={{ position: "absolute", inset: 0 }}>
        <VesselTypeSVG vesselType={ev.vessel_type} vesselName={ev.vessel_name} imo={ev.imo} width="100%" height="100%" theme="light" size="cover" />
      </div>
    </div>
  );
}

// ─── Related card ──────────────────────────────────────────────────────────────
function RelatedCard({ ev, weekSlug }: { ev: ArticleEvent; weekSlug: string }) {
  const [hover, setHover] = useState(false);
  const c = cfg(ev.event_type);
  const name = ev.vessel_name || (ev.imo ? `IMO ${ev.imo}` : "Unknown vessel");

  return (
    <Link href={`/weekly/${weekSlug}/${ev.id}`} style={{ textDecoration: "none", display: "block" }}>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ border: `1px solid ${hover ? "#D1D5DB" : "#E5E7EB"}`, borderRadius: 6,
          overflow: "hidden", background: "#fff", transition: "border-color 0.15s",
          boxShadow: hover ? "0 4px 16px rgba(16,24,40,0.06)" : "none" }}>
        <div style={{ position: "relative", width: "100%", paddingTop: "62%", overflow: "hidden" }}>
          {ev.photo_url ? (
            <img src={ev.photo_thumb ?? ev.photo_url} alt={name}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ position: "absolute", inset: 0 }}>
              <VesselTypeSVG vesselType={ev.vessel_type} vesselName={ev.vessel_name} imo={ev.imo} width="100%" height="100%" theme="light" />
            </div>
          )}
        </div>
        <div style={{ padding: "10px 12px 14px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
            <span style={{ width: 3, height: 12, background: c.bar, borderRadius: 2, display: "inline-block" }} />
            <span style={{ fontSize: 9, fontWeight: 700, color: c.color, textTransform: "uppercase",
              letterSpacing: "0.09em", fontFamily: "Inter, sans-serif" }}>
              {c.label}
            </span>
          </span>
          <div style={{ fontSize: 13, fontWeight: 700, color: NAVY,
            fontFamily: "var(--font-serif, Georgia, serif)", lineHeight: 1.25 }}>
            {name}
          </div>
          {ev.location && (
            <div style={{ fontSize: 10, color: "#9CA3AF", fontFamily: "Inter, sans-serif", marginTop: 4 }}>
              {ev.location}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────────
export default function ArticlePage({
  params,
}: {
  params: Promise<{ week: string; eventId: string }>;
}) {
  const { week, eventId } = use(params);
  const [data,     setData]     = useState<ArticleResponse | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/weekly/${week}/${eventId}`)
      .then(async r => {
        if (r.status === 404) { setNotFound(true); return; }
        const json = await r.json();
        if (json.error) { setNotFound(true); return; }
        setData(json);
      })
      .finally(() => setLoading(false));
  }, [week, eventId]);

  if (loading) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "60px 24px",
        textAlign: "center", fontFamily: "Inter, sans-serif", background: BG, minHeight: "100vh" }}>
        <div style={{ color: "#9CA3AF", marginBottom: 8 }}>Generating article…</div>
        <div style={{ fontSize: 12, color: "#D1D5DB" }}>First load may take a few seconds.</div>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "60px 24px",
        textAlign: "center", fontFamily: "Inter, sans-serif", background: BG, minHeight: "100vh" }}>
        <div style={{ color: "#6B7280" }}>Article not found.</div>
        <Link href={`/weekly/${week}`} style={{ color: GREEN, display: "inline-block", marginTop: 16 }}>
          ← Back to issue
        </Link>
      </div>
    );
  }

  const { event: ev, related, week_label } = data;
  const c = cfg(ev.event_type);
  const vesselName = ev.vessel_name || (ev.imo ? `IMO ${ev.imo}` : "Unknown vessel");
  const headline   = ev.article_headline ? stripMarkdown(ev.article_headline) : vesselName;

  const bodyParagraphs: string[] = ev.article_body
    ? stripMarkdown(ev.article_body).split(/\n\n+/).filter(Boolean)
    : [ev.summary];

  const specs = [
    ev.imo          ? `IMO ${ev.imo}`                                     : null,
    ev.vessel_type  ?? null,
    ev.vessel_dwt   ? `${Number(ev.vessel_dwt).toLocaleString()} DWT`    : null,
    ev.vessel_built ? `Built ${ev.vessel_built}`                          : null,
    ev.vessel_flag  ?? null,
  ].filter(Boolean);

  return (
    <>
      <style>{`
        @media print {
          nav, header, .no-print { display: none !important; }
          body { background: #fff !important; }
          a { color: inherit !important; text-decoration: none !important; }
        }
        .drop-cap::first-letter {
          float: left;
          font-size: 4em;
          line-height: 0.78;
          margin: 0.06em 0.1em 0 0;
          font-family: var(--font-serif, Georgia, serif);
          font-weight: 700;
          color: ${NAVY};
        }
        @media (max-width: 700px) {
          .article-grid { grid-template-columns: 1fr !important; }
          .article-sidebar { position: static !important; }
        }
      `}</style>

      <div style={{ background: BG, minHeight: "100vh" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 32px 80px" }}>

          {/* ── Breadcrumb ── */}
          <div className="no-print" style={{ marginBottom: 28, fontFamily: "Inter, sans-serif",
            fontSize: 12, color: "#9CA3AF" }}>
            <Link href="/weekly" style={{ color: "#C4C9D4", textDecoration: "none" }}>Weekly</Link>
            <span style={{ margin: "0 8px", color: "#D1D5DB" }}>·</span>
            <Link href={`/weekly/${week}`} style={{ color: "#9CA3AF", textDecoration: "none" }}>
              {week_label}
            </Link>
          </div>

          {/* ── Hero image (full width of container) ── */}
          <HeroImage ev={ev} />

          {/* ── Article header ── */}
          <div style={{ maxWidth: 720, marginTop: 28, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
              {/* Bar-style category badge */}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 3, height: 14, background: c.bar, borderRadius: 2, display: "inline-block" }} />
                <span style={{ fontSize: 10, fontWeight: 800, color: c.color, textTransform: "uppercase",
                  letterSpacing: "0.1em", fontFamily: "Inter, sans-serif" }}>
                  {c.label}
                </span>
              </span>
              {ev.location && (
                <span style={{ fontSize: 13, color: "#6B7280", fontFamily: "Inter, sans-serif" }}>
                  · {ev.location}
                </span>
              )}
              {ev.event_date && (
                <span style={{ fontSize: 12, color: "#9CA3AF", fontFamily: "Inter, sans-serif" }}>
                  · {formatDate(ev.event_date)}
                </span>
              )}
            </div>

            <h1 style={{ fontSize: "clamp(26px, 4vw, 38px)", fontWeight: 800, color: NAVY,
              margin: "0 0 10px", fontFamily: "var(--font-serif, Georgia, serif)",
              letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              {headline}
            </h1>

            <div style={{ fontSize: 12, color: "#9CA3AF", fontFamily: "Inter, sans-serif" }}>
              Source: {ev.source_name}
            </div>
          </div>

          {/* ── Gold rule ── */}
          <div style={{ height: 2, background: GOLD, margin: "20px 0 32px", maxWidth: 720 }} />

          {/* ── Two-column layout ── */}
          <div className="article-grid"
            style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 52, alignItems: "start" }}>

            {/* Article body — 680px reading width */}
            <div style={{ maxWidth: 680 }}>
              {bodyParagraphs.map((para, i) => (
                <p key={i}
                  className={i === 0 ? "drop-cap" : undefined}
                  style={{ fontSize: 17, color: "#1F2937", lineHeight: 1.8,
                    margin: "0 0 24px", fontFamily: "var(--font-serif, Georgia, serif)" }}>
                  {para}
                </p>
              ))}
            </div>

            {/* Sidebar */}
            <aside className="article-sidebar" style={{ position: "sticky", top: 24 }}>

              {/* Vessel details */}
              <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 6,
                padding: "18px 20px", marginBottom: 16 }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: GOLD,
                  textTransform: "uppercase", letterSpacing: "0.14em",
                  fontFamily: "Inter, sans-serif", marginBottom: 14 }}>
                  Vessel Details
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: NAVY,
                  fontFamily: "var(--font-serif, Georgia, serif)", lineHeight: 1.2, marginBottom: 10 }}>
                  {vesselName}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {specs.map(s => (
                    <div key={s} style={{ fontSize: 12, color: "#6B7280", fontFamily: "Inter, sans-serif" }}>
                      {s}
                    </div>
                  ))}
                  {(ev.owner_name || ev.manager_name) && (
                    <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 8, marginTop: 2,
                      fontSize: 12, color: "#6B7280", fontFamily: "Inter, sans-serif" }}>
                      {ev.manager_name || ev.owner_name}
                    </div>
                  )}
                </div>
                {ev.vessel_mmsi && (
                  <Link href={`/?mmsi=${ev.vessel_mmsi}`}
                    style={{ fontSize: 12, color: GREEN, fontFamily: "Inter, sans-serif",
                      textDecoration: "none", marginTop: 12, display: "inline-block" }}>
                    View in fleet map →
                  </Link>
                )}
              </div>

              {/* Contact CTA */}
              {ev.has_contact && (
                <Link href="/opportunities" style={{ textDecoration: "none", display: "block", marginBottom: 16 }}>
                  <div style={{ background: GREEN, borderRadius: 6, padding: "14px 18px", cursor: "pointer" }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#fff",
                      fontFamily: "Inter, sans-serif", marginBottom: 4, textTransform: "uppercase",
                      letterSpacing: "0.08em" }}>
                      Owner Contact Available
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)",
                      fontFamily: "Inter, sans-serif", lineHeight: 1.4 }}>
                      View in Opportunities →
                    </div>
                  </div>
                </Link>
              )}

              {/* Source note */}
              <div style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "Inter, sans-serif", lineHeight: 1.6 }}>
                Source: {ev.source_name}.{" "}
                Contact details available to registered users only.
              </div>
            </aside>
          </div>

          {/* ── Related articles ── */}
          {related.length > 0 && (
            <div style={{ marginTop: 64, paddingTop: 36, borderTop: "1px solid #E5E7EB" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: "#9CA3AF",
                  textTransform: "uppercase", letterSpacing: "0.14em", fontFamily: "Inter, sans-serif" }}>
                  More from {week_label}
                </span>
                <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 20 }}>
                {related.slice(0, 4).map(r => (
                  <RelatedCard key={r.id} ev={r} weekSlug={week} />
                ))}
              </div>
            </div>
          )}

          {/* ── Footer ── */}
          <div style={{ marginTop: 48, borderTop: "1px solid #E5E7EB", paddingTop: 20,
            display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "Inter, sans-serif" }}>
              Compiled by ShipScout · shipscout.io
            </span>
            <Link href={`/weekly/${week}`} className="no-print"
              style={{ fontSize: 12, color: GREEN, fontFamily: "Inter, sans-serif", textDecoration: "none" }}>
              ← Back to {week_label}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
