"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { WeeklyDigestSummary } from "@/app/api/weekly/route";

const EVENT_TYPE_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  arrest_seizure: { color: "#991B1B", bg: "#FEF2F2", border: "#FECACA" },
  detention:      { color: "#92400E", bg: "#FFF7ED", border: "#FED7AA" },
  auction:        { color: "#C9A84C", bg: "#FEFCE8", border: "#FDE68A" },
  sanction:       { color: "#6B21A8", bg: "#FAF5FF", border: "#E9D5FF" },
  scrap_sale:     { color: "#065F46", bg: "#ECFDF5", border: "#A7F3D0" },
};

function CategoryPill({ label, count, style }: { label: string; count: number; style: typeof EVENT_TYPE_STYLE[string] }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
      color: style.color, background: style.bg, border: `1px solid ${style.border}`,
      whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 5 }}>
      {label}
      <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.8 }}>{count}</span>
    </span>
  );
}

export default function WeeklyArchivePage() {
  const [digests, setDigests] = useState<WeeklyDigestSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/weekly")
      .then(r => r.json())
      .then(d => setDigests(d.digests ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px 80px",
      fontFamily: "'Georgia', 'Times New Roman', serif" }}>

      {/* Masthead */}
      <div style={{ borderBottom: "2px solid #101828", paddingBottom: 20, marginBottom: 36 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
          color: "#1D9E75", marginBottom: 8 }}>
          ShipScout Intelligence
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: "#101828", margin: "0 0 8px",
          fontFamily: "'Georgia', serif", letterSpacing: "-0.02em" }}>
          Weekly Digest
        </h1>
        <p style={{ fontSize: 14, color: "#6B7280", margin: 0, fontFamily: "Inter, sans-serif" }}>
          Weekly maritime intelligence summaries — arrests, detentions, auctions, and sanctions.
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", color: "#9CA3AF", fontSize: 14, padding: 48 }}>
          Loading digests…
        </div>
      ) : digests.length === 0 ? (
        <div style={{ textAlign: "center", color: "#9CA3AF", fontSize: 14, padding: 48 }}>
          No published digests yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {digests.map(d => (
            <Link key={d.week_start} href={`/weekly/${d.week_start}`}
              style={{ textDecoration: "none", display: "block" }}>
              <div style={{ border: "1px solid #E5E7EB", borderRadius: 10, padding: "20px 24px",
                background: "#fff", transition: "border-color 0.15s",
                cursor: "pointer" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "#1D9E75")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "#E5E7EB")}>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                  gap: 16, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#101828",
                      fontFamily: "'Georgia', serif", marginBottom: 6 }}>
                      {d.week_label}
                    </div>
                    {d.intro_text && (
                      <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 12px",
                        lineHeight: 1.6, fontFamily: "Inter, sans-serif",
                        display: "-webkit-box", WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {d.intro_text}
                      </p>
                    )}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {d.arrests     > 0 && <CategoryPill label="Arrests & Seizures" count={d.arrests}     style={EVENT_TYPE_STYLE.arrest_seizure} />}
                      {d.detentions  > 0 && <CategoryPill label="Detentions"         count={d.detentions}  style={EVENT_TYPE_STYLE.detention} />}
                      {d.auctions    > 0 && <CategoryPill label="Auctions"           count={d.auctions}    style={EVENT_TYPE_STYLE.auction} />}
                      {d.sanctions   > 0 && <CategoryPill label="Sanctions"          count={d.sanctions}   style={EVENT_TYPE_STYLE.sanction} />}
                      {d.scrap_sales > 0 && <CategoryPill label="Scrap"              count={d.scrap_sales} style={EVENT_TYPE_STYLE.scrap_sale} />}
                    </div>
                  </div>

                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#101828" }}>
                      {d.event_count}
                    </div>
                    <div style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "Inter, sans-serif" }}>
                      events
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, color: "#1D9E75",
                      fontWeight: 600, fontFamily: "Inter, sans-serif" }}>
                      Read →
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
