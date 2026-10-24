import { describe, expect, it } from "vitest";
import type { Category, Location } from "./events";
import { validatePlan, type FixedBlock, type ProposedBlock, type ValidationInput } from "./plan-validate";
import type { Rule, RuleParams } from "./rules";
import { localDateTime, weekRange } from "./week";

const MONDAY = "2026-10-26";
const at = (date: string, time: string) => localDateTime(date, time);

const block = (date: string, from: string, to: string, category: Category = "SCHOOL", location: Location | null = null, title = "Blokk"): ProposedBlock => ({
  title,
  category,
  location,
  start: at(date, from),
  end: at(date, to),
});

const prayer = (date: string, from: string, to: string, title = "Dhuhr + Asr"): FixedBlock => ({
  id: `prayer:${date}:${title}`,
  title,
  category: "RELIGION",
  start: at(date, from),
  end: at(date, to),
  source: "PRAYER",
  locked: true,
});

const rule = (params: RuleParams, strength: Rule["strength"] = "SOFT"): Rule => ({
  id: `r-${params.kind}-${strength}`,
  strength,
  enabled: true,
  sourceText: null,
  params,
});

function check(blocks: ProposedBlock[], extra: Partial<ValidationInput> = {}) {
  return validatePlan({ blocks, fixed: [], rules: [], window: weekRange(MONDAY), monday: MONDAY, ...extra });
}

describe("grunnleggende kontroller", () => {
  it("godtar en gyldig plan", () => {
    const r = check([block(MONDAY, "09:00", "11:00"), block(MONDAY, "11:00", "12:00")], {
      fixed: [prayer(MONDAY, "12:01", "12:21")],
    });
    expect(r).toEqual({ errors: [], warnings: [] });
  });

  it("avviser slutt før start", () => {
    expect(check([block(MONDAY, "11:00", "10:00")]).errors[0].message).toMatch(/slutt må være etter start/);
  });

  it("avviser ugyldige datoer", () => {
    const bad = { ...block(MONDAY, "09:00", "10:00"), start: new Date("ikke en dato") };
    expect(check([bad]).errors[0].message).toMatch(/ugyldig tid/);
  });

  it("avviser blokker utenfor vinduet (fortid eller neste uke)", () => {
    const window = { from: at("2026-10-28", "10:00"), to: weekRange(MONDAY).to };
    const r = check([block("2026-10-27", "09:00", "10:00"), block("2026-11-02", "09:00", "10:00")], { window });
    expect(r.errors).toHaveLength(2);
  });

  it("avviser overlapp mellom nye blokker", () => {
    const r = check([block(MONDAY, "09:00", "11:00"), block(MONDAY, "10:30", "12:00")]);
    expect(r.errors.map((e) => e.message)).toEqual([expect.stringMatching(/overlapper med/)]);
  });

  it("avviser blokker over en bønn, og sier hvilken", () => {
    const r = check([block(MONDAY, "11:30", "12:30")], { fixed: [prayer(MONDAY, "12:01", "12:21")] });
    expect(r.errors[0].message).toMatch(/bønnen «Dhuhr \+ Asr» kl\. 12:01/);
  });

  it("avviser blokker over låste og manuelle blokker", () => {
    const fixed: FixedBlock = { ...prayer(MONDAY, "15:00", "16:00", "Trening"), source: "MANUAL", category: "ALONE" };
    expect(check([block(MONDAY, "15:30", "16:30")], { fixed: [fixed] }).errors).toHaveLength(1);
  });

  it("regner ikke blokker som møtes i kanten som overlapp", () => {
    expect(check([block(MONDAY, "11:00", "12:01")], { fixed: [prayer(MONDAY, "12:01", "12:21")] }).errors).toEqual([]);
  });
});

describe("harde og myke regler", () => {
  const awake = (strength: Rule["strength"]) =>
    rule({ kind: "AWAKE_HOURS", days: ["MON", "TUE", "WED", "THU", "FRI"], wake: "07:00", sleep: "23:00" }, strength);

  it("et brudd på en hard regel er en feil", () => {
    const r = check([block(MONDAY, "06:00", "07:30")], { rules: [awake("HARD")] });
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ ruleId: "r-AWAKE_HOURS-HARD" });
    expect(r.errors[0].message).toMatch(/utenfor våkentiden 07:00–23:00/);
  });

  it("et brudd på en myk regel er bare en advarsel", () => {
    const r = check([block(MONDAY, "06:00", "07:30")], { rules: [awake("SOFT")] });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(1);
  });

  it("våkentid over midnatt: lørdag 23:00–00:00 er innenfor «09:00–00:00»", () => {
    const weekend = rule({ kind: "AWAKE_HOURS", days: ["SAT", "SUN"], wake: "09:00", sleep: "00:00" }, "HARD");
    expect(check([block("2026-10-31", "23:00", "23:59")], { rules: [weekend] }).errors).toEqual([]);
    expect(check([block("2026-10-31", "08:00", "09:30")], { rules: [weekend] }).errors).toHaveLength(1);
  });

  it("«hjemme rundt 19»: ute-blokker som slutter etter 19 bryter, hjemme-blokker gjør ikke", () => {
    const home19 = rule({ kind: "LATEST_END", time: "19:00", days: ["MON"], location: "OUT", category: null });
    const r = check(
      [block(MONDAY, "17:00", "20:00", "SOCIAL", "OUT", "Kino"), block(MONDAY, "20:00", "21:00", "SOCIAL", "HOME", "Middag")],
      { rules: [home19] },
    );
    expect(r.warnings.map((w) => w.message)).toEqual([expect.stringMatching(/«Kino».*slutter etter 19:00/)]);
  });

  it("sperret tid", () => {
    const blocked = rule({ kind: "BLOCKED_TIME", days: ["FRI"], start: "18:00", end: "23:00", title: "Fredagskveld" }, "HARD");
    expect(check([block("2026-10-30", "17:00", "18:30")], { rules: [blocked] }).errors[0].message).toMatch(/sperret tid/);
    expect(check([block("2026-10-29", "18:00", "19:00")], { rules: [blocked] }).errors).toEqual([]);
  });
});

describe("tidsregler", () => {
  const school5 = rule({ kind: "DAILY_TIME", category: "SCHOOL", minutes: 300, days: ["MON"], sessions: null, skipWorkDays: null });

  it("advarer når en dag får for lite tid", () => {
    const r = check([block(MONDAY, "09:00", "13:00")], { rules: [school5] });
    expect(r.warnings[0].message).toMatch(/Skole 2026-10-26: 4 t av 5 t/);
  });

  it("teller med manuelle blokker og godtar 15 minutters slingring", () => {
    const manual: FixedBlock = { ...prayer(MONDAY, "08:00", "09:00", "Forelesning"), source: "MANUAL", category: "SCHOOL", locked: false };
    const r = check([block(MONDAY, "09:00", "12:45")], { rules: [school5], fixed: [manual] });
    expect(r.warnings).toEqual([]);
  });

  it("krever ikke tid på dager som er halvveis over", () => {
    const window = { from: at(MONDAY, "15:00"), to: weekRange(MONDAY).to };
    expect(check([], { rules: [school5], window }).warnings).toEqual([]);
  });

  it("religion i uka teller ikke bønnene", () => {
    const religion = rule({ kind: "WEEKLY_TIME", category: "RELIGION", minMinutes: 180, maxMinutes: 240, sessions: null });
    const fixed = Array.from({ length: 7 }, (_, i) => prayer(`2026-10-${26 + i}`, "12:00", "12:20"));
    const r = check([block(MONDAY, "18:00", "19:00", "RELIGION")], { rules: [religion], fixed });
    expect(r.warnings[0].message).toMatch(/1 t i uka, ønsket minst 3 t/);
  });

  it("advarer når uka får mer enn maks", () => {
    const religion = rule({ kind: "WEEKLY_TIME", category: "RELIGION", minMinutes: 60, maxMinutes: 120, sessions: null });
    const r = check([block(MONDAY, "08:00", "12:00", "RELIGION")], { rules: [religion] });
    expect(r.warnings[0].message).toMatch(/ønsket høyst 2 t/);
  });
});
