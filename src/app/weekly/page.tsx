"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { WeeklyDigestSummary } from "@/app/api/weekly/route";
import VesselTypeSVG from "@/components/VesselTypeSVG";

// ─── Design tokens ────────────────────────────────────────────────────────────

const NAVY  = "#101828";
const GREEN = "#1D9E75";
const GOLD  = "#C9A84C";
const BG    = "#FAFAF8";

const EVENT_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  arrest_seizure: { color: "#991B1B", bg: "#FEF2F2",  border: "#FECACA" },
  detention:      { color: "#7C3D12", bg: "#FFF7ED",  border: "#FED7AA" },
  auction:        { color: "#92400E", bg: "#FFFBEB",  border: "#FDE68A" },
  sanction:       { color: "#4C1D95", bg: "#F5F3FF",  border: "#DDD6FE" },
  scrap_sale:     { color: "#064E3B", bg: "#ECFDF5",  border: "#A7F3D0" },
};

function CategoryPill({ label, count, style }: {
  label: string; count: number;
  style: { color: string; bg: string; border: string };
}) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 3,
      color: style.color, background: style.bg, border: `1px solid ${style.border}`,
      whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4,
      fontFamily: "Inter, sans-serif" }}>
      {label}
      <span style={{ fontWeight: 800, opacity: 0.7 }}>{count}</span>
    </span>
  );
}

// ─── Issue card ───────────────────────────────────────────────────────────────

function IssueCard({ d, isCurrent }: { d: WeeklyDigestSummary; isCurrent?: boolean }) {
  const [hover, setHover] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const hasPhoto = !imgErr && (!!d.lead_photo_thumb || !!d.lead_photo_url);

  return (
    <Link href={`/weekly/${d.week_start}`} style={{ textDecoration: "none", display: "block" }}>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          border: `1px solid ${hover ? GREEN : "#E5E7EB"}`,
          borderRadius: 10, overflow: "hidden", background: "#fff",
          transition: "border-color 0.15s, box-shadow 0.15s",
          boxShadow: hover ? "0 4px 16px rgba(16,24,40,0.08)" : "none",
          display: "flex", flexDirection: "column",
        }}>

        {/* Cover image */}
        <div style={{ position: "relative", width: "100%", paddingTop: "52%",
          background: NAVY, overflow: "hidden", flexShrink: 0 }}>
          {hasPhoto ? (
            <img
              src={d.lead_photo_thumb || d.lead_photo_url!}
              alt={d.lead_vessel_name ?? d.week_label}
              onError={() => setImgErr(true)}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
                objectFit: "cover" }}
              loading="lazy"
            />
          ) : (
            <div style={{ position: "absolute", inset: 0 }}>
              <VesselTypeSVG
                vesselType={d.lead_vessel_type}
                vesselName={d.lead_vessel_name}
                imo={null}
                width="100%"
                height="100%"
                theme="dark"
                size="cover"
              />
            </div>
          )}
          {/* THIS WEEK badge */}
          {isCurrent && (
            <div style={{ position: "absolute", top: 10, right: 12,
              fontSize: 9, fontWeight: 900, letterSpacing: "0.16em",
              textTransform: "uppercase", color: NAVY,
              fontFamily: "Inter, sans-serif",
              background: GOLD, padding: "3px 9px", borderRadius: 3 }}>
              This Week
            </div>
          )}
          {/* Week label overlay */}
          <div style={{ position: "absolute", top: 10, left: 12,
            fontSize: 10, fontWeight: 800, letterSpacing: "0.12em",
            textTransform: "uppercase", color: "rgba(255,255,255,0.9)",
            fontFamily: "Inter, sans-serif",
            background: "rgba(0,0,0,0.4)", padding: "2px 8px", borderRadius: 3 }}>
            {d.week_label.split(" · ")[0]}
          </div>
        </div>

        {/* Card body */}
        <div style={{ padding: "16px 18px 18px", display: "flex",
          flexDirection: "column", gap: 10, flex: 1 }}>

          <div style={{ fontSize: 18, fontWeight: 700, color: NAVY,
            fontFamily: "var(--font-serif, 'Georgia', serif)", lineHeight: 1.2 }}>
            {d.week_label}
          </div>

          {d.intro_text && (
            <p style={{ fontSize: 12, color: "#6B7280", margin: 0, lineHeight: 1.6,
              fontFamily: "Inter, sans-serif",
              display: "-webkit-box", WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties}>
              {d.intro_text}
            </p>
          )}

          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {d.arrests     > 0 && <CategoryPill label="Arrests"    count={d.arrests}     style={EVENT_STYLE.arrest_seizure} />}
            {d.detentions  > 0 && <CategoryPill label="Detentions" count={d.detentions}  style={EVENT_STYLE.detention} />}
            {d.auctions    > 0 && <CategoryPill label="Auctions"   count={d.auctions}    style={EVENT_STYLE.auction} />}
            {d.sanctions   > 0 && <CategoryPill label="Sanctions"  count={d.sanctions}   style={EVENT_STYLE.sanction} />}
            {d.scrap_sales > 0 && <CategoryPill label="Scrap"      count={d.scrap_sales} style={EVENT_STYLE.scrap_sale} />}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between",
            alignItems: "center", marginTop: 4 }}>
            <span style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "Inter, sans-serif" }}>
              {d.event_count} events
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: GREEN,
              fontFamily: "Inter, sans-serif" }}>
              Read issue →
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WeeklyArchivePage() {
  const [digests, setDigests] = useState<WeeklyDigestSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/weekly")
      .then(r => r.json())
      .then(d => setDigests(d.digests ?? []))
      .finally(() => setLoading(false));
  }, []);

  const latest   = digests[0] ?? null;
  const archive  = digests.slice(1);

  return (
    <div style={{ background: BG, minHeight: "100vh" }}>
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 32px 100px" }}>

      {/* ── Masthead ── */}
      <header style={{ marginBottom: 48 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.2em",
          textTransform: "uppercase", color: GREEN,
          fontFamily: "Inter, sans-serif", marginBottom: 8 }}>
          ShipScout Intelligence
        </div>
        <div style={{ fontSize: "clamp(44px, 7vw, 68px)", fontWeight: 800, color: NAVY,
          letterSpacing: "-0.035em", lineHeight: 0.92,
          fontFamily: "var(--font-serif, 'Georgia', serif)", marginBottom: 16 }}>
          SHIPSCOUT<br />WEEKLY
        </div>
        <div style={{ height: 2, background: GOLD, marginBottom: 16, maxWidth: 480 }} />
        <p style={{ fontSize: 14, color: "#6B7280", margin: 0, fontFamily: "Inter, sans-serif" }}>
          Weekly maritime intelligence — arrests, detentions, sanctions, and auctions.
        </p>
      </header>

      {loading ? (
        <div style={{ textAlign: "center", color: "#9CA3AF", padding: 64, fontFamily: "Inter, sans-serif" }}>
          Loading issues…
        </div>
      ) : digests.length === 0 ? (
        <div style={{ textAlign: "center", color: "#9CA3AF", padding: 64, fontFamily: "Inter, sans-serif" }}>
          No published issues yet.
        </div>
      ) : (
        <>
          {/* ── Latest issue (featured) ── */}
          {latest && (
            <div style={{ marginBottom: 52 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em",
                  textTransform: "uppercase", color: GOLD, fontFamily: "Inter, sans-serif" }}>
                  Latest Issue
                </span>
                <div style={{ flex: 1, height: 1, background: GOLD, opacity: 0.25 }} />
              </div>
              <IssueCard d={latest} isCurrent />
            </div>
          )}

          {/* ── Archive grid ── */}
          {archive.length > 0 && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20,
                borderTop: "1px solid #E5E7EB", paddingTop: 32 }}>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em",
                  textTransform: "uppercase", color: "#9CA3AF", fontFamily: "Inter, sans-serif",
                  whiteSpace: "nowrap" }}>
                  Previous Issues
                </span>
                <span style={{ fontSize: 11, color: "#C4C9D4", fontFamily: "Inter, sans-serif" }}>
                  {archive.length}
                </span>
                <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
              </div>
              <div style={{ display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 24 }}>
                {archive.map(d => <IssueCard key={d.week_start} d={d} />)}
              </div>
            </>
          )}
        </>
      )}
    </div>
    </div>
  );
}
