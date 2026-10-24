import { describe, expect, it } from "vitest";
import { calendarBetween, createEvent, emptyData, updateEvent, type AppData } from "./calendar";
import type { Category } from "./events";
import { planWeek } from "./planner";
import { adjustAround } from "./replan";
import { DEFAULT_RULES, type Rule, type RuleParams } from "./rules";
import { localDateTime, localParts, weekRange } from "./week";

const MONDAY = "2026-10-26";
const NOW = localDateTime("2026-10-25", "10:00");
const ALL = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
let n = 0;
const rule = (params: RuleParams): Rule => ({ id: `r${++n}`, strength: "SOFT", enabled: true, sourceText: null, params });
const rules = [
  ...DEFAULT_RULES.map((r, i) => ({ ...r, id: `d${i}` })),
  rule({ kind: "DAILY_TIME", category: "SCHOOL", minutes: 300, days: [...ALL], sessions: null }),
  rule({ kind: "WEEKLY_TIME", category: "RELIGION", minMinutes: 180, maxMinutes: 240, sessions: null }),
  rule({ kind: "DAILY_TIME", category: "SOCIAL", minutes: 90, days: [...ALL], sessions: null }),
];

/** En planlagt uke uten opptrapping. */
function planned(): AppData {
  const base: AppData = { ...emptyData(), rules, progression: { ...emptyData().progression, enabled: false } };
  return planWeek(base, MONDAY, NOW).data;
}

const iso = (t: string, d = MONDAY) => localDateTime(d, t).toISOString();
const add = (data: AppData, title: string, category: Category, from: string, to: string, date = MONDAY) =>
  createEvent(data, { title, category, start: iso(from, date), end: iso(to, date) });

const schoolMinutes = (data: AppData, date = MONDAY) =>
  data.events
    .filter((e) => e.category === "SCHOOL" && localParts(new Date(e.start)).date === date)
    .reduce((s, e) => s + (Date.parse(e.end) - Date.parse(e.start)) / 60_000, 0);

function expectNoOverlaps(data: AppData, exceptId?: string) {
  const { from, to } = weekRange(MONDAY);
  const all = calendarBetween(data, from, to);
  for (const a of all.filter((e) => e.source === "AI")) {
    const clash = all.find((b) => b.id !== a.id && b.id !== exceptId && b.start < a.end && a.start < b.end);
    expect(clash, `${a.title} ${a.start} kolliderer med ${clash?.title}`).toBeUndefined();
  }
}

describe("adjustAround", () => {
  it("flytter bare blokkene som kolliderer, og beholder målet for dagen", () => {
    const before = planned();
    const { data: withAppt, event } = add(before, "Tannlege", "OTHER", "09:00", "10:00");
    const { data, changes } = adjustAround(withAppt, event.id, NOW);

    expect(changes.map((c) => [c.kind, c.title])).toEqual([
      ["moved", "Studietid"],
      ["moved", "Studietid"],
    ]);
    expect(schoolMinutes(data)).toBe(300);
    expectNoOverlaps(data);
    // Alle andre blokker er urørt
    const movedIds = new Set(changes.map((c) => c.id));
    const untouched = before.events.filter((e) => !movedIds.has(e.id));
    for (const e of untouched) expect(data.events).toContainEqual(e);
  });

  it("flytter blokken så nær det opprinnelige tidspunktet som mulig", () => {
    const { data: withAppt, event } = add(planned(), "Kort møte", "OTHER", "12:30", "13:00");
    const { changes } = adjustAround(withAppt, event.id, NOW);
    const moved = changes.find((c) => c.kind === "moved")!;
    if (moved.kind !== "moved") throw new Error();
    expect(localParts(moved.from.start).time).toBe("12:30");
    expect(localParts(moved.to.start).time).toBe("13:00"); // rett etter møtet
  });

  it("fjerner blokken når det du la inn dekker behovet", () => {
    const { data: withLecture, event } = add(planned(), "Forelesning", "SCHOOL", "08:00", "09:30");
    const { data, changes } = adjustAround(withLecture, event.id, NOW);
    expect(changes).toEqual([expect.objectContaining({ kind: "removed", title: "Studietid", reason: "covered" })]);
    expect(schoolMinutes(data)).toBe(300);
  });

  it("lar låste blokker være, også når de kolliderer", () => {
    let data = planned();
    const first = data.events.find((e) => e.title === "Studietid" && localParts(new Date(e.start)).date === MONDAY)!;
    data = updateEvent(data, first.id, { locked: true }).data;
    const { data: withAppt, event } = add(data, "Tannlege", "OTHER", "08:00", "09:00");
    const { changes } = adjustAround(withAppt, event.id, NOW);
    expect(changes.map((c) => c.id)).not.toContain(first.id);
  });

  it("gjør ingenting når ingenting kolliderer", () => {
    const { data: withAppt, event } = add(planned(), "Kaffe", "SOCIAL", "07:00", "07:45");
    const result = adjustAround(withAppt, event.id, NOW);
    expect(result.changes).toEqual([]);
    expect(result.data).toBe(withAppt);
  });

  it("flytter ukesmål (religion) til en annen dag når dagen er full", () => {
    const before = planned();
    const religionMonday = before.events.find((e) => e.category === "RELIGION" && localParts(new Date(e.start)).date === MONDAY);
    expect(religionMonday).toBeDefined();
    const { data: withTrip, event } = add(before, "Tur", "OTHER", "07:00", "23:00");
    const { data, changes } = adjustAround(withTrip, event.id, NOW);
    const religion = changes.find((c) => c.id === religionMonday!.id)!;
    expect(religion.kind).toBe("moved");
    if (religion.kind === "moved") expect(localParts(religion.to.start).date > MONDAY).toBe(true);
    expectNoOverlaps(data);
  });

  it("fjerner dagsmål som ikke får plass samme dag, og sier fra", () => {
    const { data: withDay, event } = add(planned(), "Heldagsseminar", "OTHER", "07:00", "23:00");
    const { data, changes } = adjustAround(withDay, event.id, NOW);
    const school = changes.filter((c) => c.title === "Studietid");
    expect(school.length).toBeGreaterThan(0);
    expect(school.every((c) => c.kind === "removed" && c.reason === "no-room")).toBe(true);
    expect(schoolMinutes(data)).toBe(0);
  });

  it("rører ikke blokker som allerede er over", () => {
    const later = localDateTime(MONDAY, "10:00");
    const { data: withAppt, event } = add(planned(), "Tannlege", "OTHER", "08:00", "12:00");
    const { changes } = adjustAround(withAppt, event.id, later);
    expect(changes.every((c) => c.from.end > later)).toBe(true);
  });
});
