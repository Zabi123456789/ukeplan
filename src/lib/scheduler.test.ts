import { describe, expect, it } from "vitest";
import { calendarBetween, emptyData, createEvent, type AppData } from "./calendar";
import type { Category } from "./events";
import type { FixedBlock, ProposedBlock } from "./plan-validate";
import { planWeek } from "./planner";
import { DEFAULT_RULES, type Rule, type RuleParams } from "./rules";
import { scheduleWeek } from "./scheduler";
import { addDays, localDateTime, localParts, weekRange } from "./week";

const MONDAY = "2026-10-26";
const SUNDAY_BEFORE = localDateTime("2026-10-25", "10:00");

let n = 0;
const rule = (params: RuleParams, strength: Rule["strength"] = "SOFT"): Rule => ({ id: `r${++n}`, strength, enabled: true, sourceText: null, params });
const defaults = DEFAULT_RULES.map((r, i) => ({ ...r, id: `default-${i}` }));
const ALL = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

// Eksemplene fra beskrivelsen av appen
const school5 = rule({ kind: "DAILY_TIME", category: "SCHOOL", minutes: 300, days: [...ALL], sessions: null });
const religion = rule({ kind: "WEEKLY_TIME", category: "RELIGION", minMinutes: 180, maxMinutes: 240, sessions: null });
const home19 = rule({ kind: "LATEST_END", time: "19:00", days: ["MON", "TUE", "WED", "THU", "FRI"], location: "OUT", category: null });
const example = [...defaults, school5, religion, home19];

/** Bønneblokkene for uka med standardinnstillinger, som faste blokker. */
function prayers(): FixedBlock[] {
  const { from, to } = weekRange(MONDAY);
  return calendarBetween(emptyData(), from, to).map((e) => ({ ...e, start: new Date(e.start), end: new Date(e.end) }));
}

const minutes = (bs: ProposedBlock[], category: Category, date?: string) =>
  bs.filter((b) => b.category === category && (!date || localParts(b.start).date === date)).reduce((s, b) => s + (b.end.getTime() - b.start.getTime()) / 60_000, 0);

describe("scheduleWeek med eksempelreglene", () => {
  const result = scheduleWeek({ monday: MONDAY, now: SUNDAY_BEFORE, rules: example, fixed: prayers() });

  it("lager en gyldig plan uten feil eller brutte ønsker", () => {
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.blocks.length).toBeGreaterThan(20);
  });

  it("gir 5 timer skole hver dag og 3–4 timer religion i uka", () => {
    for (let i = 0; i < 7; i++) {
      const date = addDays(MONDAY, i);
      expect(minutes(result.blocks, "SCHOOL", date), date).toBe(300);
    }
    expect(minutes(result.blocks, "RELIGION")).toBeGreaterThanOrEqual(180);
    expect(minutes(result.blocks, "RELIGION")).toBeLessThanOrEqual(240);
  });

  it("har minst 15 minutter pause mellom øktene og maks 90 min skole i strekk", () => {
    const sorted = [...result.blocks].sort((a, b) => a.start.getTime() - b.start.getTime());
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].start.getTime() - sorted[i - 1].end.getTime()).toBeGreaterThanOrEqual(15 * 60_000);
    }
    for (const b of result.blocks.filter((b) => b.category === "SCHOOL")) {
      expect(b.end.getTime() - b.start.getTime()).toBeLessThanOrEqual(90 * 60_000);
    }
  });

  it("legger skole tidlig på dagen og religion rett etter en bønn", () => {
    const firstSchoolMonday = result.blocks.find((b) => b.category === "SCHOOL" && localParts(b.start).date === MONDAY)!;
    expect(localParts(firstSchoolMonday.start).time).toBe("08:00");
    const fixed = prayers();
    for (const b of result.blocks.filter((b) => b.category === "RELIGION")) {
      const gap = Math.min(...fixed.filter((p) => p.end <= b.start).map((p) => (b.start.getTime() - p.end.getTime()) / 60_000));
      expect(gap).toBeLessThanOrEqual(30);
    }
  });

  it("er deterministisk", () => {
    const again = scheduleWeek({ monday: MONDAY, now: SUNDAY_BEFORE, rules: example, fixed: prayers() });
    expect(again.blocks).toEqual(result.blocks);
  });
});

describe("scheduleWeek med faste blokker og regler", () => {
  it("teller med skole du har lagt inn selv", () => {
    const lecture: FixedBlock = {
      id: "f",
      title: "Forelesning",
      category: "SCHOOL",
      start: localDateTime(MONDAY, "10:00"),
      end: localDateTime(MONDAY, "12:00"),
      source: "MANUAL",
      locked: false,
    };
    const r = scheduleWeek({ monday: MONDAY, now: SUNDAY_BEFORE, rules: [...defaults, school5], fixed: [...prayers(), lecture] });
    expect(minutes(r.blocks, "SCHOOL", MONDAY)).toBe(180);
    expect(r.errors).toEqual([]);
  });

  it("holder harde frister og sperret tid", () => {
    const schoolBy17 = rule({ kind: "LATEST_END", time: "17:00", days: [...ALL], location: null, category: "SCHOOL" }, "HARD");
    const fridayOff = rule({ kind: "BLOCKED_TIME", days: ["FRI"], start: "16:00", end: "23:00", title: "Fredagskveld" }, "HARD");
    const social = rule({ kind: "DAILY_TIME", category: "SOCIAL", minutes: 90, days: [...ALL], sessions: null });
    const r = scheduleWeek({ monday: MONDAY, now: SUNDAY_BEFORE, rules: [...defaults, school5, schoolBy17, fridayOff, social], fixed: prayers() });
    expect(r.errors).toEqual([]);
    for (const b of r.blocks.filter((b) => b.category === "SCHOOL")) expect(localParts(b.end).time <= "17:00").toBe(true);
    const friday = r.blocks.filter((b) => localParts(b.start).date === "2026-10-30");
    for (const b of friday) expect(b.end <= localDateTime("2026-10-30", "16:00")).toBe(true);
  });

  it("legger blokker etter 19 hjemme når du vil være hjemme da", () => {
    const evening = rule({ kind: "DAILY_TIME", category: "ALONE", minutes: 60, days: ["MON"], sessions: null });
    const r = scheduleWeek({ monday: MONDAY, now: SUNDAY_BEFORE, rules: [...defaults, evening, home19], fixed: prayers() });
    const alone = r.blocks.find((b) => b.category === "ALONE")!;
    expect(localParts(alone.start).time).toBe("21:00"); // alenetid legges helst kl. 21
    expect(alone.location).toBe("HOME");
  });

  it("planlegger ikke i fortiden, og fordeler ukesmålet på dagene som er igjen", () => {
    const now = localDateTime("2026-10-28", "14:10"); // onsdag ettermiddag
    const r = scheduleWeek({ monday: MONDAY, now, rules: [...defaults, religion], fixed: prayers() });
    expect(r.blocks.every((b) => b.start >= localDateTime("2026-10-28", "14:15"))).toBe(true);
    expect(minutes(r.blocks, "RELIGION")).toBe(180);
    expect(new Set(r.blocks.map((b) => localParts(b.start).date)).size).toBeGreaterThanOrEqual(3);
  });

  it("flytter ukesmål til neste dag når en dag er full", () => {
    const busyAllWeek = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"].map((d, i): FixedBlock => ({
      id: `full${i}`,
      title: "Opptatt",
      category: "OTHER",
      start: localDateTime(d, "00:00"),
      end: localDateTime(d, "23:59"),
      source: "MANUAL",
      locked: true,
    }));
    const r = scheduleWeek({ monday: MONDAY, now: SUNDAY_BEFORE, rules: [...defaults, religion], fixed: [...prayers(), ...busyAllWeek] });
    expect(minutes(r.blocks, "RELIGION", "2026-11-01")).toBe(180);
    expect(r.warnings).toEqual([]);
  });

  it("melder fra når noe ikke får plass: myke regler gir advarsel, harde gir feil", () => {
    const tooMuch = rule({ kind: "DAILY_TIME", category: "SCHOOL", minutes: 20 * 60, days: ["MON"], sessions: null });
    const soft = scheduleWeek({ monday: MONDAY, now: SUNDAY_BEFORE, rules: [...defaults, tooMuch], fixed: prayers() });
    expect(soft.errors).toEqual([]);
    expect(soft.warnings[0].message).toMatch(/Skole 2026-10-26: .* av 20 t/);

    const hard = scheduleWeek({ monday: MONDAY, now: SUNDAY_BEFORE, rules: [...defaults, { ...tooMuch, strength: "HARD" }], fixed: prayers() });
    expect(hard.errors[0]).toMatchObject({ ruleId: tooMuch.id });
  });

  it("uten tidsregler blir det ingen blokker", () => {
    const r = scheduleWeek({ monday: MONDAY, now: SUNDAY_BEFORE, rules: defaults, fixed: prayers() });
    expect(r.blocks).toEqual([]);
    expect(r.summary).toMatch(/Ingenting å planlegge/);
  });
});

describe("planWeek", () => {
  function setup(): AppData {
    let data: AppData = { ...emptyData(), rules: example, progression: { ...emptyData().progression, enabled: false } };
    const add = (title: string, from: string, to: string, extra: object) => {
      data = createEvent(data, { title, category: "SCHOOL", start: localDateTime(MONDAY, from).toISOString(), end: localDateTime(MONDAY, to).toISOString(), ...extra }).data;
    };
    add("Forelesning", "14:00", "16:00", {});
    add("Gammel plan", "08:00", "09:00", {});
    add("Låst plan", "16:30", "17:30", { locked: true });
    // De to siste skal se ut som planlagte blokker
    data = { ...data, events: data.events.map((e) => (e.title === "Forelesning" ? e : { ...e, source: "AI" as const })) };
    return data;
  }

  it("bytter ut ulåste planlagte blokker og lar resten stå", () => {
    const { data, report } = planWeek(setup(), MONDAY, SUNDAY_BEFORE);
    const titles = data.events.map((e) => e.title);
    expect(titles).toContain("Forelesning");
    expect(titles).toContain("Låst plan");
    expect(titles).not.toContain("Gammel plan");
    expect(report).toMatchObject({ replaced: 1, errors: [] });
    expect(report.created).toBe(data.events.filter((e) => e.source === "AI" && !e.locked).length);
    expect(data.plans[MONDAY]).toEqual(report);
  });

  it("nye blokker overlapper ikke noe av det som ble stående", () => {
    const { data } = planWeek(setup(), MONDAY, SUNDAY_BEFORE);
    const { from, to } = weekRange(MONDAY);
    const all = calendarBetween(data, from, to);
    const planned = all.filter((e) => e.source === "AI" && !e.locked);
    for (const p of planned) {
      const clash = all.find((o) => o.id !== p.id && o.start < p.end && p.start < o.end);
      expect(clash, `${p.title} ${p.start}`).toBeUndefined();
    }
  });

  it("avviser en uke som er over", () => {
    expect(() => planWeek(setup(), "2026-10-12", SUNDAY_BEFORE)).toThrow(/allerede over/);
  });
});

describe("planWeek med opptrapping", () => {
  const data = (startMonday: string): AppData => ({
    ...emptyData(),
    rules: [...defaults, school5],
    progression: { enabled: true, startMonday, startPercent: 50, stepPercent: 10 },
  });

  it("første uke gir halvparten av tidsmålet", () => {
    const { data: d, report } = planWeek(data(MONDAY), MONDAY, SUNDAY_BEFORE);
    expect(report.percent).toBe(50);
    const monday = d.events.filter((e) => localParts(new Date(e.start)).date === MONDAY);
    expect(monday.reduce((s, e) => s + (Date.parse(e.end) - Date.parse(e.start)) / 60_000, 0)).toBe(150);
    expect(report.warnings).toEqual([]); // skalert mål er oppfylt, ingen advarsel om 5 t
  });

  it("tredje uke gir 70 %", () => {
    expect(planWeek(data("2026-10-12"), MONDAY, SUNDAY_BEFORE).report.percent).toBe(70);
  });
});

describe("økter og spredning", () => {
  const school4in2 = rule({ kind: "DAILY_TIME", category: "SCHOOL", minutes: 240, days: [...ALL], sessions: 2 });
  const training = rule({ kind: "WEEKLY_TIME", category: "TRAINING", minMinutes: 480, maxMinutes: null, sessions: 4 });
  const r = scheduleWeek({ monday: MONDAY, now: SUNDAY_BEFORE, rules: [...defaults, school4in2, training], fixed: prayers() });

  it("deler 4 t skole i to økter på 2 t med minst en time imellom", () => {
    for (let i = 0; i < 7; i++) {
      const date = addDays(MONDAY, i);
      const school = r.blocks.filter((b) => b.category === "SCHOOL" && localParts(b.start).date === date);
      expect(school.map((b) => (b.end.getTime() - b.start.getTime()) / 60_000), date).toEqual([120, 120]);
      expect(school[1].start.getTime() - school[0].end.getTime()).toBeGreaterThanOrEqual(60 * 60_000);
    }
  });

  it("legger trening 4 ganger à 2 t på fire ulike dager", () => {
    const t = r.blocks.filter((b) => b.category === "TRAINING");
    expect(t.map((b) => (b.end.getTime() - b.start.getTime()) / 60_000)).toEqual([120, 120, 120, 120]);
    expect(new Set(t.map((b) => localParts(b.start).date)).size).toBe(4);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
});

describe("trening og små rester", () => {
  const school4in2 = rule({ kind: "DAILY_TIME", category: "SCHOOL", minutes: 240, days: [...ALL], sessions: 2 });
  const training = rule({ kind: "WEEKLY_TIME", category: "TRAINING", minMinutes: 480, maxMinutes: null, sessions: 4 });
  const social = rule({ kind: "DAILY_TIME", category: "SOCIAL", minutes: 90, days: [...ALL], sessions: null });
  const alone = rule({ kind: "DAILY_TIME", category: "ALONE", minutes: 60, days: [...ALL], sessions: null });
  const r = scheduleWeek({ monday: MONDAY, now: SUNDAY_BEFORE, rules: [...defaults, school4in2, training, social, alone, home19], fixed: prayers() });

  it("legger trening ute og ferdig innen 19 på hverdager", () => {
    const t = r.blocks.filter((b) => b.category === "TRAINING");
    expect(t).toHaveLength(4);
    for (const b of t) {
      expect(b.location).toBe("OUT");
      const { weekday } = localParts(b.start);
      if (weekday !== "SAT" && weekday !== "SUN") expect(localParts(b.end).time <= "19:00", localParts(b.start).date).toBe(true);
    }
  });

  it("legger trening på fire ulike dager, ikke sent på kvelden", () => {
    const t = r.blocks.filter((b) => b.category === "TRAINING");
    expect(new Set(t.map((b) => localParts(b.start).date)).size).toBe(4);
    for (const b of t) expect(localParts(b.end).time <= "21:00").toBe(true);
  });

  it("lager ingen økter under en halvtime", () => {
    for (const b of r.blocks) expect(b.end.getTime() - b.start.getTime()).toBeGreaterThanOrEqual(30 * 60_000);
  });
});
