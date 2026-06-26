// Canonical scrap scoring — single source of truth for all routes

export function scoreFromAge(age: number): number {
  if (age >= 32) return 90 + Math.min(9, age - 32);
  if (age >= 28) return 82 + (age - 28);
  if (age >= 24) return 72 + (age - 24) * 2;
  if (age >= 20) return 60 + (age - 20) * 3;
  return Math.max(30, 40 + age);
}

export function computeScrapScore(
  age: number | null,
  inspectionCount = 0,
  nextDryDock: string | null = null,
  detentionCount = 0,
  specialSurveyDate: string | null = null,
): number {
  let score = age != null ? Math.min(99, scoreFromAge(age)) : 30;
  if (inspectionCount >= 3) score = Math.min(99, score + 5);
  if (nextDryDock) {
    const monthsLeft = (new Date(nextDryDock).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30);
    if (monthsLeft < 6) score = Math.min(99, score + 5);
  }
  if (specialSurveyDate) {
    const monthsLeft = (new Date(specialSurveyDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30);
    if (monthsLeft >= 0 && monthsLeft < 6) score = Math.min(99, score + 15);
  }
  if (detentionCount > 0) score = Math.min(99, score + 10);
  return score;
}
