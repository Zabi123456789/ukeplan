import { z } from "zod";
import type { Rule } from "@/lib/rules";
import { addDays, localParts, mondayOf } from "@/lib/week";

// Opptrapping: for å bygge disiplin over tid starter tidsmålene lavere og øker litt hver uke.
// Gjelder bare tid per dag og tid per uke, ikke våkentid, frister eller sperret tid.

export const progressionSchema = z.object({
  enabled: z.boolean(),
  /** Mandagen i første uke */
  startMonday: z.iso.date(),
  /** Prosent av målene i første uke */
  startPercent: z.number().int().min(10).max(100),
  /** Prosentpoeng mer for hver uke, til 100 % */
  stepPercent: z.number().int().min(0).max(50),
});
export type Progression = z.infer<typeof progressionSchema>;

/** Starter du i helgen, blir første uke den kommende uka. */
export function defaultProgression(today = new Date()): Progression {
  const { date, weekday } = localParts(today);
  const monday = mondayOf(date);
  const startMonday = weekday === "SAT" || weekday === "SUN" ? addDays(monday, 7) : monday;
  return { enabled: true, startMonday, startPercent: 50, stepPercent: 10 };
}

/** Uke nummer i opptrappingen (1 = første uke). Uker før start regnes som uke 1. */
export function progressionWeek(p: Progression, monday: string) {
  const days = (Date.parse(`${mondayOf(monday)}T00:00:00Z`) - Date.parse(`${mondayOf(p.startMonday)}T00:00:00Z`)) / 86_400_000;
  return Math.max(1, Math.round(days / 7) + 1);
}

/** Prosent av tidsmålene som gjelder uka. */
export function percentFor(p: Progression, monday: string) {
  if (!p.enabled) return 100;
  return Math.min(100, p.startPercent + p.stepPercent * (progressionWeek(p, monday) - 1));
}

/** Hvor mange uker til 100 % (null hvis det aldri skjer). */
export function weeksToFull(p: Progression) {
  if (p.startPercent >= 100) return 1;
  if (p.stepPercent === 0) return null;
  return Math.ceil((100 - p.startPercent) / p.stepPercent) + 1;
}

const scale = (minutes: number, percent: number) => (minutes === 0 ? 0 : Math.max(15, Math.round((minutes * percent) / 100 / 15) * 15));

/** Reglene med tidsmålene skalert til prosenten, rundet til nærmeste kvarter. */
export function scaleRules(rules: Rule[], percent: number): Rule[] {
  if (percent >= 100) return rules;
  return rules.map((r) => {
    const p = r.params;
    if (p.kind === "DAILY_TIME") return { ...r, params: { ...p, minutes: scale(p.minutes, percent) } };
    if (p.kind === "WEEKLY_TIME") {
      return { ...r, params: { ...p, minMinutes: scale(p.minMinutes, percent), maxMinutes: p.maxMinutes === null ? null : scale(p.maxMinutes, percent) } };
    }
    return r;
  });
}
