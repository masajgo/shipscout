// Typed wrapper over scraper/scrapScore.js, which the AIS worker also uses so the
// score the API returns matches the one stored in vessels.scrap_score.
import {
  scoreFromAge as ageScore,
  computeScrapScore as compute,
  scrapCategory as category,
} from "../../scraper/scrapScore";

export type ScrapCategory = "low" | "medium" | "high" | "critical";

export function scoreFromAge(age: number): number {
  return ageScore(age);
}

export function computeScrapScore(
  age: number | null,
  inspectionCount = 0,
  nextDryDock: string | null = null,
  detentionCount = 0,
  specialSurveyDate: string | null = null,
): number {
  return compute({ age, inspectionCount, nextDryDock, detentionCount, specialSurveyDate }).score;
}

export function scrapCategory(score: number): ScrapCategory {
  return category(score);
}
