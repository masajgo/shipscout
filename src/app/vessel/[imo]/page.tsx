import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import pool from "@/lib/db";
import { computeSignals, SIGNAL_META } from "@/lib/signals";
import { priceCategory, estimateCheque, formatUsd, type YardPrices } from "@/lib/scrapValue";

export const dynamic = "force-dynamic";

async function fetchVessel(imo: string) {
  const [vRes, pRes] = await Promise.all([
    pool.query(`
      SELECT v.imo::text, v.name, v.type, v.type_specific, v.flag,
             v.age, v.built_year, v.ldt, v.deadweight, v.gross_tonnage,
             COALESCE(v.scrap_score, 0)      AS scrap_score,
             v.scrap_category,
             COALESCE(v.detention_count, 0)  AS detention_count,
             v.special_survey_date::text,
             v.speed, v.nav_status, v.photo_url,
             o.owner_name, o.manager_name
      FROM vessels v
      LEFT JOIN owners o ON o.imo = v.imo
      WHERE v.imo = $1::bigint
      LIMIT 1
    `, [imo]),
    pool.query(`SELECT yard, country, vessel_type, price_usd_ldt FROM scrap_prices`),
  ]);

  if (!vRes.rows.length) return null;

  const v = vRes.rows[0];
  const yards: YardPrices = {};
  for (const p of pRes.rows) {
    yards[p.yard] ??= { country: p.country, prices: {} };
    yards[p.yard].prices[p.vessel_type] = Number(p.price_usd_ldt);
  }

  const signals = computeSignals({
    age:                 v.age,
    speed:               v.speed,
    nav_status:          v.nav_status,
    special_survey_date: v.special_survey_date,
    detention_count:     v.detention_count,
  });

  const category = priceCategory(v.type, v.type_specific);
  const cheque   = estimateCheque(v.ldt, category, "Aliaga", yards);
  const unitPrice = yards["Aliaga"]?.prices[category] ?? null;

  return { ...v, signals, category, cheque, unitPrice, yards };
}

export async function generateMetadata(
  { params }: { params: Promise<{ imo: string }> }
): Promise<Metadata> {
  const { imo } = await params;
  const v = await fetchVessel(imo);
  if (!v) return { title: "Vessel Not Found | ShipScout" };
  const chequeStr = v.cheque ? ` · Est. scrap value ${formatUsd(v.cheque)}` : "";
  return {
    title: `${v.name} — Ship Recycling Report | ShipScout`,
    description: `${v.type_specific ?? v.type ?? "Vessel"} built ${v.built_year ?? "unknown"}, ${v.age} years old${chequeStr}. View recycling signals and market valuation on ShipScout.`,
    openGraph: {
      title: `${v.name} — Recycling Intelligence`,
      description: `${v.signals.length} signal${v.signals.length !== 1 ? "s" : ""} detected${chequeStr}`,
      ...(v.photo_url ? { images: [{ url: v.photo_url }] } : {}),
    },
  };
}

export default async function VesselPublicPage(
  { params }: { params: Promise<{ imo: string }> }
) {
  const { imo } = await params;
  const v = await fetchVessel(imo);
  if (!v) notFound();

  const scoreColor =
    v.scrap_score >= 70 ? "#DC2626"
    : v.scrap_score >= 50 ? "#D97706"
    : "#6B7280";

  const specs: [string, string][] = [
    ["IMO",        v.imo],
    ["Age",        v.age ? `${v.age} years` : "—"],
    ["Type",       v.type_specific ?? v.type ?? "—"],
    ["Flag",       v.flag ?? "—"],
    ["DWT",        v.deadweight  ? `${Number(v.deadweight).toLocaleString()} t`  : "—"],
    ["GRT",        v.gross_tonnage ? Number(v.gross_tonnage).toLocaleString()    : "—"],
    ["LDT",        v.ldt         ? `${Number(v.ldt).toLocaleString()} t`         : "—"],
    ["Detentions", v.detention_count > 0 ? `${v.detention_count} PSC record(s)` : "None"],
  ];

  const contactSubject = encodeURIComponent(`Recycling inquiry — ${v.name} (IMO ${v.imo})`);
  const contactBody    = encodeURIComponent(
    `Hello,\n\nI am the owner/manager of M/V ${v.name} (IMO ${v.imo}) and I would like to explore recycling options.\n\nBest regards,`
  );
  const unsubSubject   = encodeURIComponent(`Unsubscribe — IMO ${v.imo}`);

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* Header */}
      <header style={{
        background: "#07122E",
        padding: "0 24px",
        height: 56,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <Link href="/" style={{ textDecoration: "none" }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: "#fff", letterSpacing: -0.5 }}>
            Ship<span style={{ color: "#C9A84C" }}>Scout</span>
          </span>
        </Link>
        <a
          href={`mailto:hello@shipscout.io?subject=${contactSubject}&body=${contactBody}`}
          style={{
            background: "#C9A84C", color: "#07122E", padding: "6px 16px",
            borderRadius: 6, fontSize: 13, fontWeight: 600, textDecoration: "none",
          }}
        >
          Contact us
        </a>
      </header>

      <main style={{ maxWidth: 700, margin: "0 auto", padding: "32px 16px 64px" }}>

        {/* Photo */}
        {v.photo_url ? (
          <div style={{ width: "100%", height: 220, borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
            <img src={v.photo_url} alt={v.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        ) : (
          <div style={{
            width: "100%", height: 160, borderRadius: 12, marginBottom: 24,
            background: "#E2E8F0", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="72" height="40" viewBox="0 0 72 40" fill="none">
              <rect x="4" y="18" width="64" height="14" rx="3" fill="#94A3B8"/>
              <rect x="16" y="8" width="28" height="12" rx="2" fill="#94A3B8"/>
              <rect x="22" y="2" width="4" height="8" rx="1" fill="#CBD5E1"/>
            </svg>
          </div>
        )}

        {/* Vessel title */}
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#0F172A", margin: "0 0 6px" }}>
          M/V {v.name}
        </h1>
        <p style={{ color: "#64748B", fontSize: 15, margin: "0 0 28px" }}>
          {v.type_specific ?? v.type ?? "Vessel"}
          {v.built_year ? ` · Built ${v.built_year}` : ""}
          {v.flag ? ` · ${v.flag}` : ""}
          {v.deadweight ? ` · ${Number(v.deadweight).toLocaleString()} DWT` : ""}
        </p>

        {/* Scrap value card */}
        <div style={{
          background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12,
          padding: "20px 24px", marginBottom: 20,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            Estimated Scrap Value · Aliağa, Turkey
          </div>
          {v.cheque ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <span style={{ fontSize: 40, fontWeight: 700, color: "#0F172A", lineHeight: 1 }}>
                {formatUsd(v.cheque)}
              </span>
              <span style={{ fontSize: 13, color: "#94A3B8" }}>
                {Number(v.ldt).toLocaleString()} LDT × ${v.unitPrice}/LDT
              </span>
            </div>
          ) : (
            <p style={{ fontSize: 16, color: "#94A3B8", margin: 0 }}>
              LDT data unavailable — contact us for a manual valuation
            </p>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
            <div style={{
              background: scoreColor + "15", border: `1px solid ${scoreColor}40`,
              borderRadius: 6, padding: "3px 10px",
              fontSize: 12, fontWeight: 600, color: scoreColor,
            }}>
              Scrap score {v.scrap_score}
            </div>
            {v.scrap_category && (
              <span style={{ fontSize: 12, color: "#94A3B8", textTransform: "capitalize" }}>
                {v.scrap_category} risk
              </span>
            )}
          </div>
        </div>

        {/* Signals */}
        {v.signals.length > 0 && (
          <div style={{
            background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12,
            padding: "20px 24px", marginBottom: 20,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
              Recycling Signals Detected
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
              {v.signals.map((s: VesselSignal) => {
                const m = SIGNAL_META[s.type];
                return (
                  <span key={s.type} style={{
                    background: m.bg, color: m.color, border: `1px solid ${m.border}`,
                    borderRadius: 6, padding: "4px 10px", fontSize: 13, fontWeight: 500,
                  }}>
                    {s.label}
                  </span>
                );
              })}
            </div>
            {v.signals.map(s => (
              <p key={s.type} style={{ fontSize: 13, color: "#475569", margin: "0 0 6px", lineHeight: 1.5 }}>
                · {s.explanation}
              </p>
            ))}
          </div>
        )}

        {/* Specs grid */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 28,
        }}>
          {specs.map(([label, value]) => (
            <div key={label} style={{
              background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8,
              padding: "10px 14px",
            }}>
              <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {label}
              </div>
              <div style={{ fontSize: 14, color: "#0F172A", fontWeight: 500, marginTop: 3 }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{
          background: "#07122E", borderRadius: 12, padding: "28px 24px", textAlign: "center",
        }}>
          <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>
            Considering recycling options?
          </h2>
          <p style={{ color: "#94A3B8", fontSize: 14, margin: "0 0 20px", lineHeight: 1.6 }}>
            ShipScout connects vessel owners directly with verified recycling yards
            in Aliağa, Bangladesh, and India — no intermediary fees.
          </p>
          <a
            href={`mailto:hello@shipscout.io?subject=${contactSubject}&body=${contactBody}`}
            style={{
              background: "#C9A84C", color: "#07122E", padding: "13px 28px",
              borderRadius: 8, fontWeight: 700, fontSize: 15, textDecoration: "none",
              display: "inline-block",
            }}
          >
            Get in touch →
          </a>
        </div>

        {/* Footer */}
        <p style={{ textAlign: "center", color: "#CBD5E1", fontSize: 12, marginTop: 32 }}>
          <a href="https://shipscout.io" style={{ color: "#CBD5E1", textDecoration: "none" }}>
            shipscout.io
          </a>
          {" · "}
          Data sourced from AIS, Equasis, and port state control records.
          {" · "}
          <a
            href={`mailto:hello@shipscout.io?subject=${unsubSubject}`}
            style={{ color: "#CBD5E1" }}
          >
            Unsubscribe
          </a>
        </p>

      </main>
    </div>
  );
}
