/**
 * scrapScore.js — the one scrap scoring implementation.
 *
 * Lives under scraper/ because worker/Dockerfile only copies worker/ and scraper/,
 * while the Next app reaches it through src/lib/scoring.ts.
 */

const RISK_FLAGS = new Set(["KM", "TG", "PW", "KH", "BZ", "SL", "MN", "TZ", "VU", "CK"]);

// Age drives the score; everything else nudges it. The curve is steep past 30
// because a hull that old is a demolition candidate regardless of condition,
// and near-flat under 15 so a young ship can never be pushed into the top bands
// by AIS state alone.
function scoreFromAge(age) {
  if (age >= 45) return 90 + Math.min(9, age - 45);
  if (age >= 40) return 82 + Math.round((age - 40) * 1.5);
  if (age >= 35) return 72 + (age - 35) * 2;
  if (age >= 30) return 58 + Math.round((age - 30) * 2.8);
  if (age >= 25) return 42 + Math.round((age - 25) * 3.2);
  if (age >= 20) return 26 + Math.round((age - 20) * 3.2);
  if (age >= 15) return 10 + Math.round((age - 15) * 3.2);
  return Math.max(0, Math.min(10, age));
}

function monthsUntil(dateish) {
  const t = new Date(dateish).getTime();
  if (Number.isNaN(t)) return null;
  return (t - Date.now()) / (1000 * 60 * 60 * 24 * 30);
}

/**
 * @param {{
 *   builtYear?: number|null, age?: number|null,
 *   navStatus?: number|string|null, speed?: number|string|null, flag?: string|null,
 *   inspectionCount?: number, detentionCount?: number,
 *   nextDryDock?: string|null, specialSurveyDate?: string|null,
 * }} v
 * @returns {{ score: number, reasons: string[] }}
 */
function computeScrapScore(v) {
  const reasons = [];

  let age = v.age ?? null;
  if (age == null && v.builtYear) age = new Date().getFullYear() - v.builtYear;

  let score = 0;
  if (age != null && age >= 0 && age < 150) {
    score = scoreFromAge(age);
    if (score > 0) reasons.push(`age ${age}y`);
  }

  const ns = parseInt(v.navStatus) || 0;
  if (ns === 1 || ns === 5) { score += 8; reasons.push(ns === 1 ? "anchored" : "moored"); }

  if ((parseFloat(v.speed) || 0) === 0) { score += 4; reasons.push("stationary"); }

  if (v.flag && RISK_FLAGS.has(v.flag)) { score += 6; reasons.push(`risk flag (${v.flag})`); }

  if ((v.inspectionCount ?? 0) >= 3) { score += 5; reasons.push("3+ inspections"); }

  if ((v.detentionCount ?? 0) > 0) { score += 10; reasons.push("detained"); }

  if (v.nextDryDock) {
    const m = monthsUntil(v.nextDryDock);
    if (m !== null && m < 6) { score += 5; reasons.push("dry dock due"); }
  }

  if (v.specialSurveyDate) {
    const m = monthsUntil(v.specialSurveyDate);
    if (m !== null && m >= 0 && m < 6) { score += 15; reasons.push("special survey due"); }
  }

  return { score: Math.max(0, Math.min(99, Math.round(score))), reasons };
}

function scrapCategory(score) {
  if (score >= 70) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

module.exports = { RISK_FLAGS, scoreFromAge, computeScrapScore, scrapCategory };
