"use strict";
/**
 * outreachScan.js — Yüksek scrap skorlu gemilerin owner'larına otomatik mail atar.
 *
 * Gereksinimler:
 *   .env.local → RESEND_API_KEY   (resend.com ücretsiz 3000 mail/ay)
 *                DATABASE_URL
 *
 * Çalıştırma:
 *   node scraper/outreachScan.js --dry-run   # mail atmadan listeler
 *   node scraper/outreachScan.js             # gerçek gönderim
 */

const path = require("path");
const { Pool } = require("pg");
require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

const RESEND_API_KEY        = process.env.RESEND_API_KEY;
const FROM_EMAIL            = "ShipScout <hello@shipscout.io>";
const SITE_URL              = "https://shipscout.io";
const DAILY_LIMIT           = 50;
const OUTREACH_COOLDOWN_DAYS = 30;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── DB ──────────────────────────────────────────────────────────────────────

async function ensureColumn() {
  await pool.query(`
    ALTER TABLE owners
    ADD COLUMN IF NOT EXISTS last_outreach_at TIMESTAMPTZ
  `);
}

async function getTargets(limit) {
  const { rows } = await pool.query(`
    SELECT imo, name, type, type_specific, age, built_year, ldt, deadweight,
           scrap_score, scrap_category, detention_count, special_survey_date, best_email,
           owner_name, manager_name
    FROM (
      SELECT DISTINCT ON (o.imo)
        v.imo::text, v.name, v.type, v.type_specific,
        v.age, v.built_year, v.ldt, v.deadweight,
        v.scrap_score, v.scrap_category,
        v.detention_count, v.special_survey_date::text,
        o.best_email, o.owner_name, o.manager_name
      FROM vessels v
      JOIN owners o ON o.imo = v.imo::bigint
      WHERE v.scrap_category IN ('critical', 'high')
        AND o.best_email IS NOT NULL AND o.best_email != ''
        AND o.best_email NOT ILIKE '%test%'
        AND o.best_email NOT ILIKE '%example%'
        AND o.best_email NOT ILIKE '%john@doe%'
        AND o.best_email ~ '^[^@]+@[^@]+\\.[^@]{2,}$'
        AND v.imo BETWEEN 8000000 AND 9999999
        AND v.imo::text !~ '^(\\d)\\1{6}$'
        AND v.type_specific ~* 'cargo|tanker|container|bulk|reefer|ro-ro|vehicles|cement|heavy lift'
        AND COALESCE(v.ldt, v.deadweight * 0.2, 0) >= 1000
        AND (
          o.last_outreach_at IS NULL
          OR o.last_outreach_at < now() - interval '${OUTREACH_COOLDOWN_DAYS} days'
        )
      ORDER BY o.imo, v.scrap_score DESC NULLS LAST
    ) d
    ORDER BY scrap_score DESC NULLS LAST
    LIMIT $1
  `, [limit]);
  return rows;
}

async function markSent(imo) {
  await pool.query(
    `UPDATE owners SET last_outreach_at = now() WHERE imo = $1::bigint`,
    [imo]
  );
}

// ─── Email ───────────────────────────────────────────────────────────────────

function buildEmail(vessel) {
  const { name, imo, type_specific, type, built_year, age } = vessel;
  const vesselUrl = `${SITE_URL}/vessel/${imo}`;
  const typeLabel = type_specific ?? type ?? "Vessel";
  const ageLabel  = age ? `${age} years old` : "";

  const subject = `M/V ${name} — Scrap value report`;

  const html = `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#F8FAFC;font-family:system-ui,-apple-system,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;">
  <tr><td style="padding:32px 24px 0;">

    <p style="margin:0 0 24px;font-size:12px;color:#94A3B8;letter-spacing:0.05em;text-transform:uppercase;">
      ShipScout Intelligence
    </p>

    <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#0F172A;">
      M/V ${name}
    </h1>
    <p style="margin:0 0 24px;font-size:14px;color:#64748B;">
      ${typeLabel}${built_year ? ` · Built ${built_year}` : ""}${ageLabel ? ` · ${ageLabel}` : ""}
    </p>

    <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.65;">
      Our monitoring system has flagged <strong>M/V ${name}</strong> as a vessel
      approaching end of commercial life. We have prepared a recycling value estimate
      based on current Aliağa market prices.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td style="background:#F1F5F9;border-radius:8px;padding:16px 20px;">
          <p style="margin:0 0 4px;font-size:11px;color:#94A3B8;text-transform:uppercase;letter-spacing:0.08em;">
            What's included in your report
          </p>
          <ul style="margin:8px 0 0;padding:0 0 0 16px;color:#334155;font-size:14px;line-height:1.8;">
            <li>Estimated scrap value at current Aliağa prices</li>
            <li>Active distress signals and risk factors</li>
            <li>Vessel specifications (LDT, DWT, GRT)</li>
          </ul>
        </td>
      </tr>
    </table>

    <div style="text-align:center;margin:0 0 32px;">
      <a href="${vesselUrl}"
         style="background:#07122E;color:#fff;padding:14px 32px;border-radius:8px;
                text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">
        View vessel report →
      </a>
    </div>

    <hr style="border:none;border-top:1px solid #E2E8F0;margin:0 0 20px;">

    <p style="margin:0 0 20px;font-size:13px;color:#64748B;line-height:1.6;">
      ShipScout connects vessel owners with verified recycling yards in
      <strong>Aliağa (Turkey)</strong>, Bangladesh, and India.
      No intermediary fees — direct contact with yards.
    </p>

    <p style="margin:0;font-size:12px;color:#CBD5E1;line-height:1.6;">
      This message was sent to the registered operator of IMO ${imo}.
      If this vessel has already been recycled or this message is not relevant,
      <a href="mailto:hello@shipscout.io?subject=Unsubscribe%20${imo}"
         style="color:#CBD5E1;">unsubscribe here</a>.
      &nbsp;·&nbsp;
      <a href="https://shipscout.io" style="color:#CBD5E1;">shipscout.io</a>
    </p>

  </td></tr>
</table>
</body>
</html>`;

  const text = [
    `M/V ${name} — Scrap value report`,
    `${typeLabel}${built_year ? ` · Built ${built_year}` : ""}${ageLabel ? ` · ${ageLabel}` : ""}`,
    "",
    `Our monitoring system has flagged M/V ${name} as a vessel approaching end of commercial life.`,
    `We have prepared a recycling value estimate based on current Aliağa market prices.`,
    "",
    `View your vessel report: ${vesselUrl}`,
    "",
    `ShipScout connects vessel owners with verified recycling yards in Aliağa, Bangladesh, and India.`,
    `No intermediary fees — direct contact with yards.`,
    "",
    `To unsubscribe: mailto:hello@shipscout.io?subject=Unsubscribe%20${imo}`,
    `shipscout.io`,
  ].join("\n");

  return { subject, html, text };
}

async function sendViaResend(to, subject, html, text) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html, text }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Resend ${res.status}: ${JSON.stringify(err)}`);
  }
  return res.json();
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const isDryRun = process.argv.includes("--dry-run");

  if (!RESEND_API_KEY && !isDryRun) {
    console.error("[outreach] RESEND_API_KEY eksik — .env.local'a ekle.");
    console.error("[outreach] Ücretsiz anahtar: https://resend.com (3000 mail/ay)");
    process.exit(1);
  }

  console.log(`[outreach] ${isDryRun ? "[DRY-RUN] " : ""}başlatıldı`);

  await ensureColumn();
  const targets = await getTargets(DAILY_LIMIT);
  console.log(`[outreach] ${targets.length} hedef owner bulundu`);

  let sent = 0;
  let errors = 0;

  for (const vessel of targets) {
    const { subject, html, text } = buildEmail(vessel);

    if (isDryRun) {
      console.log(`[outreach] [DRY-RUN] → ${vessel.best_email}  |  ${vessel.name} (IMO ${vessel.imo}, score ${vessel.scrap_score})`);
      continue;
    }

    try {
      await sendViaResend(vessel.best_email, subject, html, text);
      await markSent(vessel.imo);
      sent++;
      console.log(`[outreach] ✓ ${vessel.name} (${vessel.imo}) → ${vessel.best_email}`);
      await new Promise(r => setTimeout(r, 1200)); // rate limit
    } catch (err) {
      errors++;
      console.error(`[outreach] ✗ ${vessel.name} (${vessel.imo}): ${err.message}`);
    }
  }

  console.log(`[outreach] tamamlandı — ${sent} gönderildi, ${errors} hata`);
  await pool.end();
}

main().catch(err => {
  console.error("[outreach] Fatal:", err);
  process.exit(1);
});
