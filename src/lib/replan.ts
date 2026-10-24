import { calendarBetween, type AppData } from "@/lib/calendar";
import { overlapsWith, type CalendarEvent, type Category } from "@/lib/events";
import { awakeFor, ceilToQuarter, freeIntervals, type Interval } from "@/lib/free-time";
import { dailyRuleApplies, validatePlan, type FixedBlock } from "@/lib/plan-validate";
import { percentFor, scaleRules } from "@/lib/progression";
import type { Rule } from "@/lib/rules";
import { blockedSpans, deadlineFor, locationFor } from "@/lib/scheduler";
import { addDays, localParts, mondayOf, weekdayOf, weekRange } from "@/lib/week";

// Omplanlegging: når du legger inn eller flytter en blokk, flyttes bare de planlagte blokkene
// som kolliderer med den. Alt annet blir liggende. Ren funksjon.

export type Change =
  | { kind: "moved"; id: string; title: string; from: Interval; to: Interval }
  | { kind: "removed"; id: string; title: string; from: Interval; reason: "covered" | "no-room" | "workday" };

type Victim = Omit<CalendarEvent, "start" | "end"> & Interval;

const MINUTE = 60_000;
const GAP = 15;
const MIN_SESSION = 30;

const minutesOf = (b: Interval) => (b.end.getTime() - b.start.getTime()) / MINUTE;

export function adjustAround(data: AppData, anchorId: string, now = new Date()): { data: AppData; changes: Change[] } {
  const anchor = data.events.find((e) => e.id === anchorId);
  if (!anchor) return { data, changes: [] };
  const anchorSpan = { id: anchor.id, start: new Date(anchor.start), end: new Date(anchor.end) };

  // Planlagte, ulåste blokker som ikke allerede er over
  const planned = data.events
    .filter((e) => e.source === "AI" && !e.locked && new Date(e.end) > now)
    .map((e) => ({ ...e, start: new Date(e.start), end: new Date(e.end) }));
  const anchorDate = localParts(anchorSpan.start).date;
  const dayRules = data.rules.filter((r) => r.enabled);
  const blocksThatDay = data.events.map((e) => ({ ...e, start: new Date(e.start), end: new Date(e.end) }));
  // De som kolliderer, pluss økter samme dag som ikke lenger skal være der (f.eks. studietid når dagen er blitt en jobbdag)
  const noLongerWanted = planned.filter(
    (e) =>
      localParts(e.start).date === anchorDate &&
      dayRules.some(
        (r) =>
          r.params.kind === "DAILY_TIME" &&
          r.params.category === e.category &&
          r.params.days.includes(weekdayOf(anchorDate)) &&
          !dailyRuleApplies(r.params, anchorDate, blocksThatDay),
      ),
  );
  const victims = [...new Map([...overlapsWith(anchorSpan, planned), ...noLongerWanted].map((v) => [v.id, v])).values()].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
  if (victims.length === 0) return { data, changes: [] };

  const victimIds = new Set(victims.map((v) => v.id));
  const monday = mondayOf(localParts(anchorSpan.start).date);
  const range = weekRange(monday);
  const rules = scaleRules(data.rules.filter((r) => r.enabled), percentFor(data.progression, monday));

  let events = data.events.filter((e) => !victimIds.has(e.id));
  const changes: Change[] = [];
  const notBefore = new Date(Math.max(ceilToQuarter(now).getTime(), range.from.getTime()));

  for (const v of victims) {
    const from = { start: v.start, end: v.end };
    const current = { ...data, events };
    const fixed = calendarBetween(current, range.from, range.to).map(toFixed);
    const date = localParts(v.start).date;

    // Hvor mye trengs fortsatt? Det du la inn kan allerede dekke behovet.
    const need = Math.min(minutesOf(v), stillNeeded(v.category, date, rules, fixed));
    if (need < GAP) {
      const workday = rules.some(
        (r) => r.params.kind === "DAILY_TIME" && r.params.category === v.category && r.params.days.includes(weekdayOf(date)) && !dailyRuleApplies(r.params, date, fixed),
      );
      changes.push({ kind: "removed", id: v.id, title: v.title, from, reason: workday ? "workday" : "covered" });
      continue;
    }

    // Først samme dag så nær det opprinnelige tidspunktet som mulig, så resten av uka
    const hasDailyRule = rules.some((r) => r.params.kind === "DAILY_TIME" && r.params.category === v.category && r.params.days.includes(weekdayOf(date)));
    const dates = [date];
    if (!hasDailyRule) for (let d = addDays(date, 1); d < addDays(monday, 7); d = addDays(d, 1)) dates.push(d);

    const placed = place(v, need, dates, rules, fixed, notBefore);
    if (!placed) {
      changes.push({ kind: "removed", id: v.id, title: v.title, from, reason: "no-room" });
      continue;
    }
    const moved: CalendarEvent = {
      ...v,
      start: placed.start.toISOString(),
      end: placed.end.toISOString(),
      location: locationFor(localParts(placed.start).date, placed.end, rules, v.category),
    };
    events = [...events, moved];
    changes.push({ kind: "moved", id: v.id, title: v.title, from, to: placed });
  }

  // Sikkerhetsnett: de flyttede blokkene skal ikke overlappe noe
  const movedIds = new Set(changes.filter((c) => c.kind === "moved").map((c) => c.id));
  const result = { ...data, events };
  const all = calendarBetween(result, range.from, range.to).map(toFixed);
  const check = validatePlan({
    blocks: all.filter((b) => movedIds.has(b.id)).map((b) => ({ ...b, location: null })),
    fixed: all.filter((b) => !movedIds.has(b.id)),
    rules: [],
    window: { from: notBefore, to: range.to },
    monday,
  });
  if (check.errors.length) throw new Error(`Omplanleggingen ga en ugyldig plan: ${check.errors[0].message}`);

  return { data: result, changes };
}

function toFixed(e: CalendarEvent): FixedBlock {
  return { ...e, start: new Date(e.start), end: new Date(e.end) };
}

/** Minutter som mangler for å nå målet i kategorien (per dag hvis det finnes en dagsregel, ellers per uke). */
function stillNeeded(category: Category, date: string, rules: Rule[], fixed: FixedBlock[]) {
  const sum = (filter: (b: FixedBlock) => boolean) =>
    fixed.filter((b) => b.source !== "PRAYER" && b.category === category && filter(b)).reduce((s, b) => s + minutesOf(b), 0);

  const daily = rules.flatMap((r) =>
    r.params.kind === "DAILY_TIME" && r.params.category === category && r.params.days.includes(weekdayOf(date))
      ? [dailyRuleApplies(r.params, date, fixed) ? r.params.minutes : 0]
      : [],
  );
  // På en jobbdag der regelen ikke gjelder, er behovet 0: blokken fjernes i stedet for å flyttes
  if (daily.length) return Math.max(...daily) - sum((b) => localParts(b.start).date === date);

  const weekly = rules.flatMap((r) => (r.params.kind === "WEEKLY_TIME" && r.params.category === category ? [r.params.minMinutes] : []));
  if (weekly.length) return Math.max(...weekly) - sum(() => true);

  return Infinity; // ingen regel: behold blokken som den var
}

function place(v: Victim, need: number, dates: string[], rules: Rule[], fixed: FixedBlock[], notBefore: Date): Interval | null {
  const originalMinute = localParts(v.start).minutes;
  // Hold avstand til andre planlagte blokker, så det blir pauser mellom øktene
  const busy = fixed.map((b) =>
    b.source === "AI" ? { start: new Date(b.start.getTime() - GAP * MINUTE), end: new Date(b.end.getTime() + GAP * MINUTE) } : b,
  );

  for (let length = need; length >= Math.min(MIN_SESSION, need); length -= GAP) {
    for (const date of dates) {
      const deadline = deadlineFor(date, v.category, rules);
      const free = freeIntervals(date, awakeFor(date, rules), [...busy, ...blockedSpans(date, rules)], notBefore);
      let best: { start: Date; score: number } | null = null;
      for (const iv of free) {
        for (let t = ceilToQuarter(iv.start).getTime(); t + length * MINUTE <= iv.end.getTime(); t += GAP * MINUTE) {
          const start = new Date(t);
          if (deadline?.strength === "HARD" && t + length * MINUTE > deadline.time.getTime()) continue;
          let score = Math.abs(localParts(start).minutes - originalMinute);
          if (deadline && t + length * MINUTE > deadline.time.getTime()) score += 10_000;
          if (!best || score < best.score) best = { start, score };
        }
      }
      if (best) return { start: best.start, end: new Date(best.start.getTime() + length * MINUTE) };
    }
  }
  return null;
}
