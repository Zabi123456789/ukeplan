import { CATEGORIES, CATEGORY_INFO, type Category } from "@/lib/events";
import { awakeFor, ceilToQuarter, freeIntervals, subtract, type Interval } from "@/lib/free-time";
import { plannableDates, validatePlan, type Finding, type FixedBlock, type ProposedBlock } from "@/lib/plan-validate";
import { toMinutes, type Rule, type Strength } from "@/lib/rules";
import { addDays, localDateTime, localParts, weekDates, weekdayOf, weekRange } from "@/lib/week";

// Planleggeren: fyller uka med blokker ut fra reglene. Ren funksjon, ingen lagring.
//
// 1. Finn ledig tid per dag: våkentid minus faste blokker (bønner, låste, manuelle),
//    sperret tid og det som allerede har vært.
// 2. Regn ut hvor mye tid hver kategori trenger per dag (tid per dag) og i uka (tid per uke,
//    fordelt jevnt på dagene som er igjen).
// 3. Legg økter dag for dag: harde regler først, så skole, religion, familie/venner, alenetid.
//    Hver økt får det ledige tidspunktet som passer kategorien best, med 15 min pause mellom økter.
// 4. Sjekk resultatet med den samme valideringen som alle planer går gjennom.

const MINUTE = 60_000;
const GAP = 15;
const MIN_SESSION = 30;

const SESSION: Record<Category, { max: number; title: string }> = {
  SCHOOL: { max: 90, title: "Studietid" },
  RELIGION: { max: 45, title: "Religiøs tid" },
  SOCIAL: { max: 90, title: "Familie og venner" },
  ALONE: { max: 60, title: "Alenetid" },
  OTHER: { max: 60, title: "Annet" },
};

type Task = { date: string; category: Category; minutes: number; strength: Strength; weekly: boolean };

export type ScheduleInput = {
  monday: string;
  now: Date;
  rules: Rule[];
  /** Alt som blir stående: bønner, låste og manuelle blokker, tidligere AI-blokker. */
  fixed: FixedBlock[];
};

export type ScheduleResult = {
  blocks: ProposedBlock[];
  window: { from: Date; to: Date };
  errors: Finding[];
  warnings: Finding[];
  summary: string;
};

export function scheduleWeek(input: ScheduleInput): ScheduleResult {
  const range = weekRange(input.monday);
  const window = { from: new Date(Math.max(range.from.getTime(), ceilToQuarter(input.now).getTime())), to: range.to };
  const rules = input.rules.filter((r) => r.enabled);
  const fromDate = localParts(window.from).date;
  const dates = weekDates(input.monday).filter((d) => d >= fromDate);

  // 1. Ledig tid per dag
  const free = new Map<string, Interval[]>();
  for (const date of dates) {
    const busy = [...input.fixed, ...blockedSpans(date, rules)];
    free.set(date, freeIntervals(date, awakeFor(date, rules), busy, window.from));
  }

  // 2. Behov
  const tasks = buildTasks(input, rules, plannableDates(input.monday, window.from));

  // 3. Legg økter dag for dag. Ukesmål som ikke får plass en dag, flyttes til neste dag.
  const blocks: ProposedBlock[] = [];
  let carry: Task[] = [];
  for (const date of dates) {
    const today = [...tasks.filter((t) => t.date === date), ...carry.map((t) => ({ ...t, date }))];
    carry = [];
    today.sort((a, b) => rank(a) - rank(b));
    for (const task of today) {
      const left = placeTask(task, free, blocks, rules, input.fixed);
      if (left > 0 && task.weekly) carry.push({ ...task, minutes: left });
    }
  }

  // 4. Sjekk
  const { errors, warnings } = validatePlan({ blocks, fixed: input.fixed, rules, window, monday: input.monday });
  return { blocks, window, errors, warnings, summary: summarize(blocks, warnings.length + errors.length) };
}

/** Harde regler først, så kategoriene i fast rekkefølge. */
function rank(t: Task) {
  return (t.strength === "HARD" ? 0 : 10) + CATEGORIES.indexOf(t.category);
}

function existingMinutes(fixed: FixedBlock[], category: Category, date: string | null) {
  return fixed
    .filter((f) => f.source !== "PRAYER" && f.category === category && (date === null || localParts(f.start).date === date))
    .reduce((sum, f) => sum + (f.end.getTime() - f.start.getTime()) / MINUTE, 0);
}

function buildTasks(input: ScheduleInput, rules: Rule[], plannable: string[]): Task[] {
  // Tid per dag: høyeste krav per dag og kategori, minus det som allerede ligger der
  const daily = new Map<string, Task>();
  for (const r of rules) {
    if (r.params.kind !== "DAILY_TIME") continue;
    for (const date of plannable) {
      if (!r.params.days.includes(weekdayOf(date))) continue;
      const key = `${date}|${r.params.category}`;
      const prev = daily.get(key);
      const minutes = Math.max(prev?.minutes ?? 0, r.params.minutes);
      const strength = prev?.strength === "HARD" || r.strength === "HARD" ? "HARD" : "SOFT";
      daily.set(key, { date, category: r.params.category, minutes, strength, weekly: false });
    }
  }
  const tasks = [...daily.values()]
    .map((t) => ({ ...t, minutes: t.minutes - existingMinutes(input.fixed, t.category, t.date) }))
    .filter((t) => t.minutes >= GAP);

  // Tid per uke: det som mangler, etter det som finnes og det som er planlagt per dag
  for (const r of rules) {
    if (r.params.kind !== "WEEKLY_TIME" || plannable.length === 0) continue;
    const { category, minMinutes } = r.params;
    const planned = tasks.filter((t) => t.category === category).reduce((s, t) => s + t.minutes, 0);
    const remaining = minMinutes - existingMinutes(input.fixed, category, null) - planned;
    if (remaining < GAP) continue;
    // Fordel på så mange dager at hver dag får minst en halvtime, spredt jevnt utover uka
    const n = Math.min(plannable.length, Math.max(1, Math.floor(remaining / MIN_SESSION)));
    let left = remaining;
    for (let i = 0; i < n; i++) {
      const date = plannable[Math.floor((i * plannable.length) / n)];
      const share = i === n - 1 ? left : Math.min(left, roundTo15(remaining / n));
      left -= share;
      tasks.push({ date, category, minutes: share, strength: r.strength, weekly: true });
    }
  }
  return tasks;
}

/** Legger ut en oppgave som én eller flere økter. Gir tilbake minutter som ikke fikk plass. */
function placeTask(task: Task, free: Map<string, Interval[]>, blocks: ProposedBlock[], rules: Rule[], fixed: FixedBlock[]) {
  let left = task.minutes;
  while (left >= GAP) {
    const max = SESSION[task.category].max;
    // Unngå en liten rest til slutt: 100 min blir 50 + 50, ikke 90 + 10
    let length = left <= max ? left : left - max < MIN_SESSION ? roundTo15(left / 2) : max;
    let placed = false;
    while (!placed && length >= Math.min(MIN_SESSION, left)) {
      const slot = bestSlot(task, length, free.get(task.date) ?? [], rules, fixed);
      if (slot) {
        const end = new Date(slot.getTime() + length * MINUTE);
        blocks.push({
          title: SESSION[task.category].title,
          category: task.category,
          start: slot,
          end,
          location: locationFor(task.date, end, rules),
        });
        const padded = { start: new Date(slot.getTime() - GAP * MINUTE), end: new Date(end.getTime() + GAP * MINUTE) };
        free.set(task.date, subtract(free.get(task.date) ?? [], [padded]));
        left -= length;
        placed = true;
      } else {
        length -= GAP; // prøv en kortere økt
      }
    }
    if (!placed) break;
  }
  return left;
}

function bestSlot(task: Task, length: number, intervals: Interval[], rules: Rule[], fixed: FixedBlock[]): Date | null {
  const deadline = deadlineFor(task.date, task.category, rules);
  let best: { start: Date; score: number } | null = null;
  for (const iv of intervals) {
    for (let t = ceilToQuarter(iv.start).getTime(); t + length * MINUTE <= iv.end.getTime(); t += GAP * MINUTE) {
      const start = new Date(t);
      const end = t + length * MINUTE;
      let score = preference(task.category, start, task.date, fixed);
      if (deadline && end > deadline.time.getTime()) {
        if (deadline.strength === "HARD") continue;
        score += 10_000; // myk frist: bare hvis ingenting annet passer
      }
      if (!best || score < best.score) best = { start, score };
    }
  }
  return best?.start ?? null;
}

/** Lavere er bedre. Skole tidlig på dagen, religion rett etter en bønn, familie rundt middag, alenetid om kvelden. */
function preference(category: Category, start: Date, date: string, fixed: FixedBlock[]) {
  const m = localParts(start).minutes;
  switch (category) {
    case "SCHOOL":
      return m < 8 * 60 ? 600 + m : m;
    case "RELIGION": {
      const after = fixed
        .filter((f) => f.source === "PRAYER" && localParts(f.end).date === date && f.end <= start)
        .map((f) => (start.getTime() - f.end.getTime()) / MINUTE)
        .filter((d) => d <= 60);
      return after.length ? Math.min(...after) : 200 + Math.abs(m - 20 * 60);
    }
    case "SOCIAL":
      return Math.abs(m - 17.5 * 60);
    case "ALONE":
      return Math.abs(m - 21 * 60);
    default:
      return m;
  }
}

/** Strengeste «ferdig innen» for kategorien denne dagen (regler uten sted gjelder kategorien direkte). */
function deadlineFor(date: string, category: Category, rules: Rule[]) {
  let best: { time: Date; strength: Strength } | null = null;
  for (const r of rules) {
    const p = r.params;
    if (p.kind !== "LATEST_END" || p.location !== null || !p.days.includes(weekdayOf(date))) continue;
    if (p.category !== null && p.category !== category) continue;
    const time = localDateTime(date, p.time);
    if (!best || time < best.time || (time.getTime() === best.time.getTime() && r.strength === "HARD")) {
      best = { time, strength: r.strength };
    }
  }
  return best;
}

/** «Hjemme innen 19»: blokker som slutter etter fristen ligger hjemme. Ellers lar vi stedet stå åpent. */
function locationFor(date: string, end: Date, rules: Rule[]): ProposedBlock["location"] {
  const homeBy = rules.some(
    (r) => r.params.kind === "LATEST_END" && r.params.location === "OUT" && r.params.days.includes(weekdayOf(date)) && end > localDateTime(date, r.params.time),
  );
  return homeBy ? "HOME" : null;
}

/** Sperret tid som berører datoen (også fra kvelden før hvis den går over midnatt). */
function blockedSpans(date: string, rules: Rule[]): Interval[] {
  const spans: Interval[] = [];
  for (const r of rules) {
    const p = r.params;
    if (p.kind !== "BLOCKED_TIME") continue;
    for (const d of [addDays(date, -1), date]) {
      if (!p.days.includes(weekdayOf(d))) continue;
      const endDate = toMinutes(p.end) <= toMinutes(p.start) ? addDays(d, 1) : d;
      spans.push({ start: localDateTime(d, p.start), end: localDateTime(endDate, p.end) });
    }
  }
  return spans;
}

function roundTo15(m: number) {
  return Math.max(GAP, Math.round(m / GAP) * GAP);
}

function summarize(blocks: ProposedBlock[], problems: number) {
  if (blocks.length === 0) {
    return problems ? "Fant ikke plass til noe nytt denne uka." : "Ingenting å planlegge: reglene er allerede oppfylt, eller det finnes ingen regler med tid per dag eller uke.";
  }
  const totals = CATEGORIES.map((c) => ({
    c,
    m: blocks.filter((b) => b.category === c).reduce((s, b) => s + (b.end.getTime() - b.start.getTime()) / MINUTE, 0),
  })).filter((x) => x.m > 0);
  const parts = totals.map(({ c, m }) => `${(Math.round(m / 6) / 10).toString().replace(".", ",")} t ${CATEGORY_INFO[c].label.toLowerCase()}`);
  return `Planla ${blocks.length} blokker: ${parts.join(", ")}.${problems ? " Se under for ønsker som ikke ble helt oppfylt." : ""}`;
}
