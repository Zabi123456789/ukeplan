import { toMinutes, type Rule } from "@/lib/rules";
import { addDays, localDateTime, weekdayOf } from "@/lib/week";

// Ledig tid: våkentid minus opptatte blokker og det som allerede har vært. Rene funksjoner.

export type Interval = { start: Date; end: Date };

export const DEFAULT_AWAKE = { wake: "07:00", sleep: "23:00" };
const QUARTER = 15 * 60_000;

export function ceilToQuarter(d: Date) {
  return new Date(Math.ceil(d.getTime() / QUARTER) * QUARTER);
}

/** Våkentiden for en dato fra den første aktive våkentidsregelen som gjelder ukedagen. */
export function awakeFor(date: string, rules: Rule[]) {
  const weekday = weekdayOf(date);
  for (const r of rules) {
    if (r.enabled && r.params.kind === "AWAKE_HOURS" && r.params.days.includes(weekday)) {
      return { wake: r.params.wake, sleep: r.params.sleep };
    }
  }
  return DEFAULT_AWAKE;
}

/** Våkentiden som tidsrom. Leggetid ved eller før oppvåkning betyr etter midnatt, men kuttes ved midnatt. */
export function awakeInterval(date: string, awake: { wake: string; sleep: string }): Interval {
  const sleepAfterMidnight = toMinutes(awake.sleep) <= toMinutes(awake.wake);
  return {
    start: localDateTime(date, awake.wake),
    end: sleepAfterMidnight ? localDateTime(addDays(date, 1), "00:00") : localDateTime(date, awake.sleep),
  };
}

/** Trekker `busy` fra `free`. Rester under 15 minutter forsvinner. */
export function subtract(free: Interval[], busy: Interval[]): Interval[] {
  let out = free;
  for (const b of busy) {
    out = out.flatMap((f) => {
      if (b.end <= f.start || b.start >= f.end) return [f];
      const parts: Interval[] = [];
      if (b.start > f.start) parts.push({ start: f.start, end: b.start });
      if (b.end < f.end) parts.push({ start: b.end, end: f.end });
      return parts;
    });
  }
  return out.filter((f) => f.end.getTime() - f.start.getTime() >= QUARTER);
}

/** Ledige tidsrom en dag, fra og med `notBefore`. */
export function freeIntervals(date: string, awake: { wake: string; sleep: string }, busy: Interval[], notBefore: Date): Interval[] {
  const a = awakeInterval(date, awake);
  const start = new Date(Math.max(a.start.getTime(), ceilToQuarter(notBefore).getTime()));
  if (start >= a.end) return [];
  return subtract([{ start, end: a.end }], busy);
}
