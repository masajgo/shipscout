"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { use } from "react";
import VesselTypeSVG from "@/components/VesselTypeSVG";
import type { WeeklyDigestDetail, WeeklyDigestEvent, OngoingCase } from "@/app/api/weekly/[week]/route";

// ─── Tokens ────────────────────────────────────────────────────────────────────
const NAVY  = "#101828";
const GREEN = "#1D9E75";
const GOLD  = "#C9A84C";
const BG    = "#FAFAF8";

// ─── Event type config ──────────────────────────────────────────────────────────
const TYPE_CFG: Record<string, { label: string; color: string; bar: string }> = {
  arrest:           { label: "Arrest",          color: "#991B1B", bar: "#EF4444" },
  bank_seizure:     { label: "Bank Seizure",     color: "#7F1D1D", bar: "#DC2626" },
  judicial_auction: { label: "Judicial Auction", color: "#92400E", bar: "#F59E0B" },
  auction:          { label: "Judicial Auction", color: "#92400E", bar: "#F59E0B" },
  bankruptcy:       { label: "Bankruptcy",       color: "#4C1D95", bar: "#8B5CF6" },
  detention:        { label: "PSC Detention",    color: "#7C3D12", bar: "#EA580C" },
  sanction:         { label: "Sanction",         color: "#374151", bar: "#6B7280" },
  scrap_sale:       { label: "Scrap Sale",       color: "#064E3B", bar: "#10B981" },
  layup:            { label: "Layup",            color: "#1E40AF", bar: "#3B82F6" },
};

const CATEGORY_META = [
  { key: "arrest_seizure",   label: "Arrests & Seizures",  types: ["arrest", "bank_seizure"],
    color: "#991B1B", bar: "#EF4444" },
  { key: "judicial_auction", label: "Judicial Auctions",   types: ["auction", "judicial_auction"],
    color: "#92400E", bar: "#F59E0B" },
  { key: "bankruptcy",       label: "Bankruptcy",           types: ["bankruptcy"],
    color: "#4C1D95", bar: "#8B5CF6" },
  { key: "detention",        label: "PSC Detentions",       types: ["detention"],
    color: "#7C3D12", bar: "#EA580C" },
  { key: "sanction_cat",     label: "Sanctions",            types: ["sanction"],
    color: "#374151", bar: "#6B7280" },
  { key: "scrap_sale",       label: "Scrap Candidates",    types: ["scrap_sale"],
    color: "#064E3B", bar: "#10B981" },
  { key: "layup",            label: "Laid-Up Vessels",      types: ["layup"],
    color: "#1E40AF", bar: "#3B82F6" },
];

const DFW_PRIORITY: Record<string, number> = {
  judicial_auction: 1, auction: 1,
  bank_seizure: 2, bankruptcy: 3, arrest: 4,
  detention: 5, sanction: 6, scrap_sale: 7, layup: 8,
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
function stripMarkdown(t: string) {
  return t.replace(/^#+\s+.*$/gm, "").replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1").replace(/\n{3,}/g, "\n\n").trim();
}
function formatDateShort(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
function formatDateLong(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
function cfg(type: string) {
  return TYPE_CFG[type] ?? { label: type.replace(/_/g, " "), color: "#374151", bar: "#6B7280" };
}
function vesselSpecs(ev: WeeklyDigestEvent) {
  return [
    ev.vessel_type ?? null,
    ev.vessel_dwt  ? `${Number(ev.vessel_dwt).toLocaleString()} DWT` : null,
    ev.vessel_flag ?? null,
  ].filter(Boolean).join(" · ");
}

// ─── Photo helpers ──────────────────────────────────────────────────────────────
function CardPhoto({ ev, heightPct = 75 }: { ev: WeeklyDigestEvent; heightPct?: number }) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <div style={{ position: "relative", width: "100%", paddingTop: `${heightPct}%`, overflow: "hidden", flexShrink: 0 }}>
      {(ev.photo_url && !imgErr) ? (
        <>
          <img
            src={ev.photo_thumb || ev.photo_url}
            alt={ev.vessel_name ?? ""}
            onError={() => setImgErr(true)}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            loading="lazy"
          />
          {ev.photo_attribution && (
            <div style={{ position: "absolute", bottom: 0, right: 0,
              fontSize: 9, color: "rgba(255,255,255,0.7)", background: "rgba(0,0,0,0.4)",
              padding: "2px 6px", fontFamily: "Inter, sans-serif" }}>
              {ev.photo_attribution}
            </div>
          )}
        </>
      ) : (
        <div style={{ position: "absolute", inset: 0 }}>
          <VesselTypeSVG vesselType={ev.vessel_type} imo={ev.imo} width="100%" height="100%" theme="light" size="cover" />
        </div>
      )}
    </div>
  );
}

// ─── Category label (bar style, no pill) ────────────────────────────────────────
function TypeBar({ type }: { type: string }) {
  const c = cfg(type);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 3, height: 14, background: c.bar, borderRadius: 2, flexShrink: 0, display: "inline-block" }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: c.color, textTransform: "uppercase",
        letterSpacing: "0.1em", fontFamily: "Inter, sans-serif" }}>
        {c.label}
      </span>
    </span>
  );
}

// ─── Section header ─────────────────────────────────────────────────────────────
function SectionHeader({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
      <span style={{ fontSize: 11, fontWeight: 800, color, textTransform: "uppercase",
        letterSpacing: "0.12em", fontFamily: "Inter, sans-serif", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF",
        fontFamily: "Inter, sans-serif" }}>
        {count}
      </span>
      <div style={{ flex: 1, height: 1, background: color, opacity: 0.25 }} />
    </div>
  );
}

// ─── Lead Story ─────────────────────────────────────────────────────────────────
function LeadStory({ ev, weekSlug }: { ev: WeeklyDigestEvent; weekSlug: string }) {
  const name = ev.vessel_name || (ev.imo ? `IMO ${ev.imo}` : null);
  const text = ev.editorial_summary ? stripMarkdown(ev.editorial_summary) : ev.summary;
  const specs = vesselSpecs(ev);
  const c = cfg(ev.event_type);

  return (
    <section style={{ marginBottom: 64 }}>
      <Link href={`/weekly/${weekSlug}/${ev.id}`} style={{ textDecoration: "none", display: "block" }}>
        {/* 16:9 hero with gradient overlay */}
        <div style={{ position: "relative", width: "100%", paddingTop: "56.25%", overflow: "hidden", borderRadius: 4 }}>
          {ev.photo_url ? (
            <img
              src={ev.photo_thumb || ev.photo_url}
              alt={name ?? ""}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div style={{ position: "absolute", inset: 0 }}>
              <VesselTypeSVG vesselType={ev.vessel_type} imo={ev.imo} width="100%" height="100%" theme="light" size="cover" />
            </div>
          )}

          {/* Bottom gradient overlay */}
          <div style={{ position: "absolute", inset: 0,
            background: "linear-gradient(to top, rgba(16,24,40,0.92) 0%, rgba(16,24,40,0.55) 38%, transparent 72%)" }} />

          {/* Content on overlay */}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "28px 32px" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 3, height: 12, background: GOLD, borderRadius: 2, display: "inline-block" }} />
                <span style={{ fontSize: 10, fontWeight: 800, color: GOLD, textTransform: "uppercase",
                  letterSpacing: "0.12em", fontFamily: "Inter, sans-serif" }}>
                  Lead Story
                </span>
              </span>
              <span style={{ width: 1, height: 10, background: "rgba(255,255,255,0.3)", display: "inline-block" }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.75)",
                textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "Inter, sans-serif" }}>
                {c.label}
              </span>
              {ev.location && (
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontFamily: "Inter, sans-serif" }}>
                  · {ev.location}
                </span>
              )}
            </div>
            {name && (
              <h2 style={{ fontSize: "clamp(24px, 3.5vw, 38px)", fontWeight: 700, color: "#fff",
                margin: "0 0 6px", fontFamily: "var(--font-serif, Georgia, serif)",
                lineHeight: 1.1, letterSpacing: "-0.01em" }}>
                {name}
              </h2>
            )}
            {ev.event_date && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", fontFamily: "Inter, sans-serif" }}>
                {formatDateLong(ev.event_date)}
              </div>
            )}
            {ev.photo_attribution && (
              <div style={{ position: "absolute", bottom: 8, right: 12,
                fontSize: 9, color: "rgba(255,255,255,0.4)", fontFamily: "Inter, sans-serif" }}>
                {ev.photo_attribution}
              </div>
            )}
          </div>
        </div>
      </Link>

      {/* Editorial text below photo */}
      {text && (
        <div style={{ marginTop: 20, maxWidth: 760 }}>
          <p style={{ fontSize: 16, color: "#374151", lineHeight: 1.75, margin: "0 0 12px",
            fontFamily: "var(--font-serif, Georgia, serif)" }}>
            {text}
          </p>
          {specs && (
            <div style={{ fontSize: 12, color: "#9CA3AF", fontFamily: "Inter, sans-serif",
              borderTop: "1px solid #E5E7EB", paddingTop: 10, marginTop: 14 }}>
              {specs}
              {ev.source_name && <span style={{ color: "#D1D5DB" }}> · {ev.source_name}</span>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Grid Card ──────────────────────────────────────────────────────────────────
function GridCard({ ev, weekSlug }: { ev: WeeklyDigestEvent; weekSlug: string }) {
  const name = ev.vessel_name || (ev.imo ? `IMO ${ev.imo}` : null);
  const specs = vesselSpecs(ev);
  const [hover, setHover] = useState(false);

  return (
    <Link href={`/weekly/${weekSlug}/${ev.id}`} style={{ textDecoration: "none", display: "block" }}>
      <article
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ background: "#fff", border: `1px solid ${hover ? "#D1D5DB" : "#E5E7EB"}`,
          borderRadius: 6, overflow: "hidden", display: "flex", flexDirection: "column",
          transition: "border-color 0.15s, box-shadow 0.15s",
          boxShadow: hover ? "0 4px 20px rgba(16,24,40,0.07)" : "none", height: "100%" }}>

        {/* 4:3 photo */}
        <CardPhoto ev={ev} heightPct={75} />

        {/* Content */}
        <div style={{ padding: "16px 18px 18px", flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          <TypeBar type={ev.event_type} />

          {name && (
            <h3 style={{ fontSize: 18, fontWeight: 700, color: NAVY, margin: 0,
              fontFamily: "var(--font-serif, Georgia, serif)", lineHeight: 1.25,
              letterSpacing: "-0.01em" }}>
              {name}
            </h3>
          )}

          <p style={{ fontSize: 13, color: "#4B5563", lineHeight: 1.65, margin: 0,
            fontFamily: "Inter, sans-serif",
            display: "-webkit-box", WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties}>
            {ev.summary}
          </p>

          <div style={{ flex: 1 }} />

          {/* Meta footer */}
          <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 10, marginTop: 4,
            display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {ev.event_date && (
              <span style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "Inter, sans-serif" }}>
                {formatDateShort(ev.event_date)}
              </span>
            )}
            {ev.location && (
              <span style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "Inter, sans-serif" }}>
                · {ev.location}
              </span>
            )}
            {specs && (
              <span style={{ fontSize: 11, color: "#C4C9D4", fontFamily: "Inter, sans-serif" }}>
                · {specs}
              </span>
            )}
            {ev.has_contact && (
              <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 600, color: GREEN,
                fontFamily: "Inter, sans-serif" }}>
                Contact ✓
              </span>
            )}
          </div>
        </div>
      </article>
    </Link>
  );
}

// ─── Category Section ────────────────────────────────────────────────────────────
function CategorySection({
  label, events, leadId, color, bar, weekSlug,
}: {
  label: string; events: WeeklyDigestEvent[];
  leadId: number | null; color: string; bar: string; weekSlug: string;
}) {
  const sectionEvents = events.filter(e => e.id !== leadId);
  if (sectionEvents.length === 0) return null;

  return (
    <section style={{ marginBottom: 56 }}>
      <SectionHeader label={label} count={sectionEvents.length} color={bar} />
      <div className="grid-2col" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 32 }}>
        {sectionEvents.map(ev => <GridCard key={ev.id} ev={ev} weekSlug={weekSlug} />)}
      </div>
    </section>
  );
}

// ─── Ongoing Cases ───────────────────────────────────────────────────────────────
function OngoingCases({ cases, weekSlug }: { cases: OngoingCase[]; weekSlug: string }) {
  if (cases.length === 0) return null;

  return (
    <section style={{ marginBottom: 64 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24,
        paddingBottom: 14, borderBottom: `2px solid #DC2626` }}>
        <h2 style={{ fontSize: 11, fontWeight: 900, color: NAVY, margin: 0,
          textTransform: "uppercase", letterSpacing: "0.16em", fontFamily: "Inter, sans-serif" }}>
          Ongoing Cases
        </h2>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", fontFamily: "Inter, sans-serif" }}>
          {cases.length}
        </span>
        <div style={{ flex: 1, height: 1, background: "#DC2626", opacity: 0.2 }} />
        <span style={{ fontSize: 10, color: "#9CA3AF", fontFamily: "Inter, sans-serif",
          fontStyle: "italic", whiteSpace: "nowrap" }}>
          Active cases from prior weeks
        </span>
      </div>

      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" as any }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
          <thead>
            <tr>
              {["Event", "Vessel", "Type / DWT", "Location", "Since", "Days Open"].map(h => (
                <th key={h} style={{ padding: "0 16px 12px 0", textAlign: "left",
                  fontSize: 10, fontWeight: 700, color: "#9CA3AF",
                  textTransform: "uppercase", letterSpacing: "0.1em",
                  fontFamily: "Inter, sans-serif", whiteSpace: "nowrap",
                  borderBottom: "1px solid #E5E7EB" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cases.map(c => {
              const c2 = cfg(c.event_type);
              const name = c.vessel_name || (c.imo ? `IMO ${c.imo}` : "—");
              const dwt  = c.vessel_dwt ? `${Number(c.vessel_dwt).toLocaleString()} DWT` : null;
              const typeSpec = [c.vessel_type, dwt].filter(Boolean).join(" · ") || "—";
              const urgency = c.days_open >= 180
                ? { color: "#DC2626", weight: 800 }
                : c.days_open >= 90
                ? { color: "#D97706", weight: 700 }
                : { color: "#6B7280", weight: 600 };

              return (
                <tr key={c.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <td style={{ padding: "0 16px 0 0", height: 52, verticalAlign: "middle", whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 3, height: 14, background: c2.bar, borderRadius: 2, flexShrink: 0, display: "inline-block" }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: c2.color,
                        textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "Inter, sans-serif" }}>
                        {c2.label}
                      </span>
                    </span>
                  </td>
                  <td style={{ padding: "0 16px 0 0", verticalAlign: "middle" }}>
                    <div style={{ fontWeight: 700, color: NAVY, fontFamily: "var(--font-serif, Georgia, serif)", fontSize: 14 }}>
                      {name}
                    </div>
                    {c.imo && (
                      <div style={{ fontSize: 10, color: "#9CA3AF", fontFamily: "monospace", marginTop: 1 }}>
                        IMO {c.imo}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "0 16px 0 0", fontSize: 12, color: "#6B7280",
                    fontFamily: "Inter, sans-serif", verticalAlign: "middle", whiteSpace: "nowrap" }}>
                    {typeSpec}
                  </td>
                  <td style={{ padding: "0 16px 0 0", fontSize: 12, color: "#6B7280",
                    fontFamily: "Inter, sans-serif", verticalAlign: "middle", maxWidth: 140 }}>
                    {c.location || "—"}
                  </td>
                  <td style={{ padding: "0 16px 0 0", fontSize: 12, color: "#9CA3AF",
                    fontFamily: "Inter, sans-serif", whiteSpace: "nowrap", verticalAlign: "middle" }}>
                    {formatDateShort(c.event_date)}
                  </td>
                  <td style={{ padding: "0", verticalAlign: "middle" }}>
                    <span style={{ fontSize: 13, fontWeight: urgency.weight, color: urgency.color,
                      fontFamily: "Inter, sans-serif" }}>
                      {c.days_open}d
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Distressed Fleet Watch ───────────────────────────────────────────────────────
function DistressedFleetWatch({ events, weekSlug }: { events: WeeklyDigestEvent[]; weekSlug: string }) {
  const [expanded, setExpanded] = useState(false);
  const [hoverRow, setHoverRow] = useState<number | null>(null);
  const LIMIT = 15;
  const currentYear = new Date().getFullYear();

  const sorted = [...events].sort((a, b) => {
    const pa = DFW_PRIORITY[a.event_type] ?? 99;
    const pb = DFW_PRIORITY[b.event_type] ?? 99;
    if (pa !== pb) return pa - pb;
    return (Number(b.vessel_dwt) || 0) - (Number(a.vessel_dwt) || 0);
  });

  const shown = expanded ? sorted : sorted.slice(0, LIMIT);
  if (sorted.length === 0) return null;

  return (
    <section style={{ marginBottom: 64 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24,
        paddingBottom: 14, borderBottom: `2px solid ${GOLD}` }}>
        <h2 style={{ fontSize: 11, fontWeight: 900, color: NAVY, margin: 0,
          textTransform: "uppercase", letterSpacing: "0.16em", fontFamily: "Inter, sans-serif" }}>
          Distressed Fleet Watch
        </h2>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", fontFamily: "Inter, sans-serif" }}>
          {sorted.length}
        </span>
        <div style={{ flex: 1, height: 1, background: GOLD, opacity: 0.2 }} />
      </div>

      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" as any }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 580 }}>
          <thead>
            <tr>
              {["Event", "Vessel", "Type", "DWT", "Age", "Location", "Date"].map(h => (
                <th key={h} style={{ padding: "0 16px 12px 0", textAlign: h === "DWT" ? "right" : "left",
                  fontSize: 10, fontWeight: 700, color: "#9CA3AF",
                  textTransform: "uppercase", letterSpacing: "0.1em",
                  fontFamily: "Inter, sans-serif", whiteSpace: "nowrap",
                  borderBottom: "1px solid #E5E7EB" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map(ev => {
              const built = ev.vessel_built ? Number(ev.vessel_built) : null;
              const age   = built ? `${currentYear - built}y` : "—";
              const dwt   = ev.vessel_dwt ? Number(ev.vessel_dwt).toLocaleString() : "—";
              const dateStr = ev.event_date ? formatDateShort(ev.event_date) : "—";
              const name  = ev.vessel_name || (ev.imo ? `IMO ${ev.imo}` : "—");
              const c     = cfg(ev.event_type);

              return (
                <tr key={ev.id}
                  onMouseEnter={() => setHoverRow(ev.id)}
                  onMouseLeave={() => setHoverRow(null)}
                  style={{ borderBottom: "1px solid #F3F4F6",
                    background: hoverRow === ev.id ? "rgba(16,24,40,0.03)" : "transparent",
                    transition: "background 0.1s" }}>

                  {/* Event badge — bar style */}
                  <td style={{ padding: "0 16px 0 0", height: 56, verticalAlign: "middle", whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 3, height: 16, background: c.bar, borderRadius: 2, flexShrink: 0, display: "inline-block" }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: c.color,
                        textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "Inter, sans-serif" }}>
                        {c.label}
                      </span>
                    </span>
                  </td>

                  {/* Vessel name */}
                  <td style={{ padding: "0 16px 0 0", height: 56, verticalAlign: "middle" }}>
                    <Link href={`/weekly/${weekSlug}/${ev.id}`} style={{ textDecoration: "none" }}>
                      <div style={{ fontWeight: 700, color: NAVY, fontFamily: "var(--font-serif, Georgia, serif)",
                        fontSize: 14, lineHeight: 1.2 }}>
                        {name}
                      </div>
                      {ev.imo && (
                        <div style={{ fontSize: 10, color: "#9CA3AF", fontFamily: "monospace", marginTop: 2 }}>
                          IMO {ev.imo}
                        </div>
                      )}
                    </Link>
                  </td>

                  <td style={{ padding: "0 16px 0 0", fontSize: 12, color: "#6B7280",
                    fontFamily: "Inter, sans-serif", whiteSpace: "nowrap", verticalAlign: "middle" }}>
                    {ev.vessel_type || "—"}
                  </td>
                  <td style={{ padding: "0 16px 0 0", fontSize: 12, color: "#374151",
                    fontFamily: "Inter, sans-serif", whiteSpace: "nowrap", verticalAlign: "middle",
                    textAlign: "right" }}>
                    {dwt}
                  </td>
                  <td style={{ padding: "0 16px 0 0", fontSize: 12, color: "#6B7280",
                    fontFamily: "Inter, sans-serif", whiteSpace: "nowrap", verticalAlign: "middle" }}>
                    {age}
                  </td>
                  <td style={{ padding: "0 16px 0 0", fontSize: 12, color: "#6B7280",
                    fontFamily: "Inter, sans-serif", verticalAlign: "middle", maxWidth: 150 }}>
                    {ev.location || "—"}
                  </td>
                  <td style={{ padding: "0", fontSize: 12, color: "#9CA3AF",
                    fontFamily: "Inter, sans-serif", whiteSpace: "nowrap", verticalAlign: "middle" }}>
                    {dateStr}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sorted.length > LIMIT && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="no-print"
          style={{ marginTop: 16, fontSize: 12, fontWeight: 600, color: GREEN,
            background: "none", border: `1px solid ${GREEN}`, borderRadius: 4,
            padding: "7px 18px", cursor: "pointer", fontFamily: "Inter, sans-serif" }}>
          View all {sorted.length} vessels
        </button>
      )}
    </section>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────────
export default function WeeklyDigestPage({ params }: { params: Promise<{ week: string }> }) {
  const { week } = use(params);
  const [digest,   setDigest]   = useState<WeeklyDigestDetail | null>(null);
  const [loading,  setLoading]  = useState(true);
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
      <div style={{ textAlign: "center", color: "#9CA3AF", padding: 80, fontFamily: "Inter, sans-serif" }}>
        Loading…
      </div>
    );
  }

  if (notFound || !digest) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "60px 24px",
        fontFamily: "Inter, sans-serif", textAlign: "center" }}>
        <div style={{ fontSize: 16, color: "#6B7280" }}>Digest not found.</div>
        <Link href="/weekly" style={{ color: GREEN, fontSize: 14, marginTop: 16, display: "inline-block" }}>
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
        }
        @media (max-width: 640px) {
          .grid-2col { grid-template-columns: 1fr !important; gap: 20px !important; }
        }
      `}</style>

      <div style={{ background: BG, minHeight: "100vh" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 32px 100px" }}>

          {/* ── Back ── */}
          <div className="no-print" style={{ marginBottom: 32 }}>
            <Link href="/weekly"
              style={{ fontSize: 12, color: "#9CA3AF", textDecoration: "none",
                fontFamily: "Inter, sans-serif", letterSpacing: "0.04em" }}>
              ← All issues
            </Link>
          </div>

          {/* ── Masthead ── */}
          <header style={{ marginBottom: 48 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.2em",
              textTransform: "uppercase", color: GREEN,
              fontFamily: "Inter, sans-serif", marginBottom: 8 }}>
              ShipScout Intelligence
            </div>
            <div style={{ fontSize: "clamp(44px, 7vw, 68px)", fontWeight: 800, color: NAVY,
              letterSpacing: "-0.035em", lineHeight: 0.92,
              fontFamily: "var(--font-serif, Georgia, serif)", marginBottom: 16 }}>
              SHIPSCOUT<br />WEEKLY
            </div>
            <div style={{ height: 2, background: GOLD, marginBottom: 16, maxWidth: 560 }} />
            <div style={{ display: "flex", justifyContent: "space-between",
              alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 20, fontWeight: 600, color: "#374151",
                fontFamily: "var(--font-serif, Georgia, serif)" }}>
                {digest.week_label}
              </div>
              <div style={{ fontSize: 13, color: "#9CA3AF", fontFamily: "Inter, sans-serif" }}>
                {digest.event_count} event{digest.event_count !== 1 ? "s" : ""}
              </div>
            </div>
          </header>

          {/* ── Intro ── */}
          {digest.intro_text && (
            <p style={{ fontSize: 15, color: "#6B7280", lineHeight: 1.75,
              margin: "0 0 48px", fontStyle: "italic",
              borderLeft: `3px solid ${GOLD}`, paddingLeft: 18, maxWidth: 680,
              fontFamily: "var(--font-serif, Georgia, serif)" }}>
              {digest.intro_text}
            </p>
          )}

          {/* ── Lead Story ── */}
          {leadEvent && <LeadStory ev={leadEvent} weekSlug={week} />}

          {/* ── Ongoing Cases ── */}
          <OngoingCases cases={digest.ongoing_cases ?? []} weekSlug={week} />

          {/* ── Distressed Fleet Watch ── */}
          <DistressedFleetWatch events={digest.events} weekSlug={week} />

          {/* ── Category Sections ── */}
          {grouped.map(cat => (
            <CategorySection
              key={cat.key}
              label={cat.label}
              events={cat.events}
              leadId={leadEvent?.id ?? null}
              color={cat.color}
              bar={cat.bar}
              weekSlug={week}
            />
          ))}

          {/* ── Footer ── */}
          <footer style={{ borderTop: "1px solid #E5E7EB", paddingTop: 24, marginTop: 48,
            display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "Inter, sans-serif" }}>
              Compiled by ShipScout · shipscout.io
            </span>
            <span style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "Inter, sans-serif" }}>
              Contact details available to registered users only.
            </span>
          </footer>
        </div>
      </div>
    </>
  );
}
