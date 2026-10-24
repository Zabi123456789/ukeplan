import { CATEGORY_INFO, findOverlaps, overlapsWith, type Category, type Location, type Source } from "@/lib/events";
import { describeRule, toMinutes, type Rule, type RuleParams } from "@/lib/rules";
import { addDays, localDateTime, localParts, TIME_ZONE, weekDates, weekdayOf } from "@/lib/week";

// Sjekker en plan fra planleggeren før den lagres, uavhengig av hvordan den ble laget. Ren funksjon.

export type ProposedBlock = {
  title: string;
  category: Category;
  start: Date;
  end: Date;
  location: Location | null;
};

export type FixedBlock = {
  id: string;
  title: string;
  category: Category;
  start: Date;
  end: Date;
  source: Source;
  locked: boolean;
};

export type Finding = { level: "error" | "warning"; ruleId: string | null; message: string };

export type ValidationInput = {
  blocks: ProposedBlock[];
  /** Alt i uka som blir stående: bønner, manuelle og låste blokker, tidligere AI-blokker. */
  fixed: FixedBlock[];
  /** Bare aktive regler. */
  rules: Rule[];
  /** Hvor nye blokker kan ligge (fra nå til slutten av uka). */
  window: { from: Date; to: Date };
  monday: string;
  timeZone?: string;
};

const MINUTE = 60_000;
/** Slingringsmonn for tidsregler, så 4 t 50 min ikke regnes som brudd på «5 timer». */
const TOLERANCE_MIN = 15;

const fmt = (d: Date, tz: string) => localParts(d, tz).time;
const minutesOf = (b: { start: Date; end: Date }) => (b.end.getTime() - b.start.getTime()) / MINUTE;
const hoursText = (m: number) => `${(Math.round((m / 60) * 10) / 10).toString().replace(".", ",")} t`;

export function validatePlan(input: ValidationInput): { errors: Finding[]; warnings: Finding[] } {
  const tz = input.timeZone ?? TIME_ZONE;
  const findings: Finding[] = [];
  const label = (b: ProposedBlock) => {
    const p = localParts(b.start, tz);
    return `«${b.title}» (${p.date} ${p.time}–${fmt(b.end, tz)})`;
  };
  const system = (message: string) => findings.push({ level: "error", ruleId: null, message });

  // 1. Grunnleggende: gyldige tider, innenfor vinduet, ingen overlapp
  const valid: (ProposedBlock & { id: string })[] = [];
  input.blocks.forEach((b, i) => {
    if (isNaN(b.start.getTime()) || isNaN(b.end.getTime())) return system(`Blokk ${i + 1} har ugyldig tid.`);
    if (b.end <= b.start) return system(`${label(b)}: slutt må være etter start.`);
    if (b.start < input.window.from || b.end > input.window.to) {
      return system(`${label(b)} ligger utenfor tidsrommet som skal planlegges.`);
    }
    valid.push({ ...b, id: `ny-${i}` });
  });

  for (const [a, b] of findOverlaps(valid)) system(`${label(a)} overlapper med ${label(b)}.`);
  for (const b of valid) {
    for (const f of overlapsWith(b, input.fixed)) {
      const what = f.source === "PRAYER" ? "bønnen" : f.locked ? "den låste blokken" : "blokken";
      system(`${label(b)} overlapper med ${what} «${f.title}» kl. ${fmt(f.start, tz)}.`);
    }
  }

  // 2. Regler
  for (const rule of input.rules) {
    const level = rule.strength === "HARD" ? "error" : "warning";
    for (const message of checkRule(rule.params, valid, input, tz)) {
      findings.push({ level, ruleId: rule.id, message: `${message} Regel: ${describeRule(rule.params)}.` });
    }
  }

  return {
    errors: findings.filter((f) => f.level === "error"),
    warnings: findings.filter((f) => f.level === "warning"),
  };
}

function checkRule(p: RuleParams, blocks: ProposedBlock[], input: ValidationInput, tz: string): string[] {
  const out: string[] = [];
  const dayOf = (b: ProposedBlock) => localParts(b.start, tz);
  const describe = (b: ProposedBlock) => `«${b.title}» ${dayOf(b).date} ${dayOf(b).time}–${fmt(b.end, tz)}`;

  switch (p.kind) {
    case "AWAKE_HOURS": {
      // En blokk må ligge i våkentiden for sin dag, eller i gårsdagens hvis den går over midnatt.
      const awake = (date: string) => {
        const end = toMinutes(p.sleep) <= toMinutes(p.wake) ? addDays(date, 1) : date;
        return { from: localDateTime(date, p.wake, tz), to: localDateTime(end, p.sleep, tz) };
      };
      for (const b of blocks) {
        const { date, weekday } = dayOf(b);
        if (!p.days.includes(weekday)) continue;
        const candidates = [date, addDays(date, -1)].map(awake);
        if (!candidates.some((w) => b.start >= w.from && b.end <= w.to)) {
          out.push(`${describe(b)} er utenfor våkentiden ${p.wake}–${p.sleep}.`);
        }
      }
      break;
    }
    case "LATEST_END":
      for (const b of blocks) {
        const { date, weekday } = dayOf(b);
        if (!p.days.includes(weekday)) continue;
        if (p.location && b.location !== p.location) continue;
        if (p.category && b.category !== p.category) continue;
        if (b.end > localDateTime(date, p.time, tz)) out.push(`${describe(b)} slutter etter ${p.time}.`);
      }
      break;
    case "BLOCKED_TIME":
      for (const date of weekDates(input.monday)) {
        if (!p.days.includes(weekdayOf(date))) continue;
        const endDate = toMinutes(p.end) <= toMinutes(p.start) ? addDays(date, 1) : date;
        const span = { id: "sperret", start: localDateTime(date, p.start, tz), end: localDateTime(endDate, p.end, tz) };
        for (const b of overlapsWith(span, blocks.map((x, i) => ({ ...x, id: String(i) })))) {
          out.push(`${describe(b)} ligger i sperret tid (${p.title}).`);
        }
      }
      break;
    case "DAILY_TIME":
      for (const date of plannableDates(input.monday, input.window.from, tz)) {
        if (!p.days.includes(weekdayOf(date))) continue;
        const total = minutesInCategory(p.category, blocks, input.fixed, tz, (d) => d === date);
        if (total < p.minutes - TOLERANCE_MIN) {
          out.push(`${CATEGORY_INFO[p.category].label} ${date}: ${hoursText(total)} av ${hoursText(p.minutes)}.`);
        }
      }
      break;
    case "WEEKLY_TIME": {
      const total = minutesInCategory(p.category, blocks, input.fixed, tz, () => true);
      const name = CATEGORY_INFO[p.category].label;
      if (total < p.minMinutes - TOLERANCE_MIN) out.push(`${name}: ${hoursText(total)} i uka, ønsket minst ${hoursText(p.minMinutes)}.`);
      if (p.maxMinutes !== null && total > p.maxMinutes + TOLERANCE_MIN) {
        out.push(`${name}: ${hoursText(total)} i uka, ønsket høyst ${hoursText(p.maxMinutes)}.`);
      }
      break;
    }
    case "NOTE":
      break; // fri tekst: modellen får den, men den kan ikke sjekkes i kode
  }
  return out;
}

/** Minutter i kategorien (bønneblokker teller ikke), for blokker som starter på datoene som slipper gjennom. */
function minutesInCategory(
  category: Category,
  blocks: ProposedBlock[],
  fixed: FixedBlock[],
  tz: string,
  includeDate: (date: string) => boolean,
) {
  return [...blocks, ...fixed.filter((f) => f.source !== "PRAYER")]
    .filter((b) => b.category === category && includeDate(localParts(b.start, tz).date))
    .reduce((sum, b) => sum + minutesOf(b), 0);
}

/**
 * Dager som kan planlegges fullt ut: dager som starter etter at vinduet åpner, pluss i dag
 * hvis planleggingen starter før kl. 08. En dag som er halvveis over, kan ikke kreves fylt opp.
 */
export function plannableDates(monday: string, windowFrom: Date, tz = TIME_ZONE) {
  const from = localParts(windowFrom, tz);
  return weekDates(monday).filter((d) => d > from.date || (d === from.date && from.minutes <= 8 * 60));
}
