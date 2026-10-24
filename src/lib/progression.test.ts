import { describe, expect, it } from "vitest";
import { defaultProgression, percentFor, progressionWeek, scaleRules, weeksToFull, type Progression } from "./progression";
import { localDateTime } from "./week";
import type { Rule } from "./rules";

const p: Progression = { enabled: true, startMonday: "2026-10-26", startPercent: 50, stepPercent: 10 };

describe("opptrapping", () => {
  it("teller uker fra startmandagen, også om en dato midt i uka sendes inn", () => {
    expect(progressionWeek(p, "2026-10-26")).toBe(1);
    expect(progressionWeek(p, "2026-11-02")).toBe(2);
    expect(progressionWeek(p, "2026-11-04")).toBe(2);
    expect(progressionWeek(p, "2026-10-19")).toBe(1); // uker før start regnes som første uke
  });

  it("øker med steget og stopper på 100 %", () => {
    expect(percentFor(p, "2026-10-26")).toBe(50);
    expect(percentFor(p, "2026-11-09")).toBe(70);
    expect(percentFor(p, "2026-12-28")).toBe(100);
    expect(weeksToFull(p)).toBe(6);
    expect(weeksToFull({ ...p, stepPercent: 0 })).toBeNull();
  });

  it("gir 100 % når opptrapping er slått av", () => {
    expect(percentFor({ ...p, enabled: false }, "2026-10-26")).toBe(100);
  });

  it("skalerer bare tidsmål, og runder til kvarter", () => {
    const rules: Rule[] = [
      { id: "a", strength: "SOFT", enabled: true, sourceText: null, params: { kind: "DAILY_TIME", category: "SCHOOL", minutes: 300, days: ["MON"], sessions: null } },
      { id: "b", strength: "SOFT", enabled: true, sourceText: null, params: { kind: "WEEKLY_TIME", category: "RELIGION", minMinutes: 180, maxMinutes: 240, sessions: null } },
      { id: "c", strength: "SOFT", enabled: true, sourceText: null, params: { kind: "AWAKE_HOURS", days: ["MON"], wake: "07:00", sleep: "23:00" } },
    ];
    const scaled = scaleRules(rules, 55);
    expect(scaled[0].params).toMatchObject({ minutes: 165 });
    expect(scaled[1].params).toMatchObject({ minMinutes: 105, maxMinutes: 135 });
    expect(scaled[2]).toBe(rules[2]);
    expect(scaleRules(rules, 100)).toBe(rules);
  });

  it("starter denne uka på hverdager og neste uke i helgen", () => {
    expect(defaultProgression(localDateTime("2026-10-21", "12:00")).startMonday).toBe("2026-10-19");
    expect(defaultProgression(localDateTime("2026-10-24", "12:00")).startMonday).toBe("2026-10-26");
  });
});
