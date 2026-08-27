export type SignalType = "layup" | "survey_pressure" | "detention_age" | "detention_trend" | "scrap_proximity" | "age_threshold";

export interface VesselSignal {
  type: SignalType;
  label: string;
  explanation: string;
  weight: number;
}

const IDLE_STATUSES = new Set([1, 5, 6]); // anchored, moored, aground

export interface SignalInput {
  age: number;
  speed: number | null;
  nav_status: number | null;
  special_survey_date: string | null;
  detention_count: number;
  min_dist_scrapyard_nm?: number | null;
  nearest_yard?: string | null;
}

export function computeSignals(v: SignalInput): VesselSignal[] {
  const signals: VesselSignal[] = [];
  const now = new Date();

  // 1. LAY-UP
  if ((v.speed ?? 99) < 1 && v.age > 20 && IDLE_STATUSES.has(v.nav_status ?? -1)) {
    const statusLabel = v.nav_status === 1 ? "anchored" : v.nav_status === 5 ? "moored" : "aground";
    signals.push({
      type: "layup",
      label: "Lay-up",
      weight: 3,
      explanation: `Speed < 1 kt and ${statusLabel} at ${v.age} years old — likely idle or laid up, owner may be evaluating exit options.`,
    });
  }

  // 2. SURVEY PRESSURE
  if (v.special_survey_date && v.age > 20) {
    const surveyDate = new Date(v.special_survey_date);
    const monthsUntil = (surveyDate.getTime() - now.getTime()) / (30 * 24 * 3600 * 1000);
    if (monthsUntil >= 0 && monthsUntil <= 6) {
      const m = Math.round(monthsUntil);
      signals.push({
        type: "survey_pressure",
        label: "Survey Due",
        weight: 4,
        explanation: `Special survey due in ${m} month${m !== 1 ? "s" : ""} — at ${v.age} years old, the survey cost often exceeds vessel value, making sale or recycling more attractive.`,
      });
    }
  }

  // 3. DETENTION — chronic offenders (3+) get a stronger signal than one-timers
  if (v.detention_count >= 3 && v.age > 20) {
    signals.push({
      type: "detention_trend",
      label: "Chronic Detentions",
      weight: 5,
      explanation: `${v.detention_count} PSC detentions recorded on a ${v.age}-year-old vessel — a pattern of repeat non-compliance signals the owner is no longer investing in the hull, making recycling imminent.`,
    });
  } else if (v.detention_count > 0 && v.age > 20) {
    signals.push({
      type: "detention_age",
      label: "PSC Detained",
      weight: 3,
      explanation: `${v.detention_count} PSC detention${v.detention_count > 1 ? "s" : ""} recorded on a ${v.age}-year-old vessel — combined with age, this signals end of commercial life and difficulty securing employment.`,
    });
  }

  // 4. SCRAP YARD PROXIMITY — vessel is already close to a breaking yard
  if (v.min_dist_scrapyard_nm != null && v.min_dist_scrapyard_nm <= 300 && v.age > 20) {
    const yard = v.nearest_yard ?? "a major scrap yard";
    signals.push({
      type: "scrap_proximity",
      label: "Near Scrap Yard",
      weight: 2,
      explanation: `${Math.round(v.min_dist_scrapyard_nm)} nm from ${yard} — vessels this close to a breaking yard are often already in final transit or anchored awaiting beach.`,
    });
  }

  // 5. AGE THRESHOLD
  if (v.age >= 25) {
    signals.push({
      type: "age_threshold",
      label: "25+ Years",
      weight: 1,
      explanation: `At ${v.age} years old this vessel is at or beyond the typical recycling age threshold, making near-term sale or scrapping statistically likely.`,
    });
  }

  return signals;
}

export function opportunityScore(signals: VesselSignal[], scrap_score: number): number {
  const w = signals.reduce((s, sig) => s + sig.weight, 0);
  return w * 10 + (scrap_score ?? 0);
}

export const SIGNAL_META: Record<SignalType, { color: string; bg: string; border: string }> = {
  survey_pressure:  { color: "#B42318", bg: "#FEF3F2", border: "#FECDCA" },
  detention_age:    { color: "#92400E", bg: "#FFFBEB", border: "#FDE68A" },
  detention_trend:  { color: "#7C2D12", bg: "#FFF7ED", border: "#FDBA74" },
  scrap_proximity:  { color: "#065F46", bg: "#ECFDF5", border: "#6EE7B7" },
  layup:            { color: "#1D4ED8", bg: "#EFF6FF", border: "#BFDBFE" },
  age_threshold:    { color: "#374151", bg: "#F3F4F6", border: "#D1D5DB" },
};
