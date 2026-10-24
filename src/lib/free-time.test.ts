import { describe, expect, it } from "vitest";
import { awakeFor, freeIntervals, subtract } from "./free-time";
import type { Rule } from "./rules";
import { localDateTime, localParts } from "./week";

const D = "2026-10-26";
const at = (t: string, date = D) => localDateTime(date, t);
const busy = (a: string, b: string) => ({ start: at(a), end: at(b) });
const early = at("00:00");
const show = (xs: { start: Date; end: Date }[]) => xs.map((x) => `${localParts(x.start).time}–${localParts(x.end).time}`);

describe("freeIntervals", () => {
  it("trekker faste blokker fra våkentiden", () => {
    expect(show(freeIntervals(D, { wake: "07:00", sleep: "23:00" }, [busy("12:01", "12:21"), busy("17:05", "17:25")], early))).toEqual([
      "07:00–12:01",
      "12:21–17:05",
      "17:25–23:00",
    ]);
  });

  it("starter ikke før nå, rundet opp til nærmeste kvarter", () => {
    expect(show(freeIntervals(D, { wake: "07:00", sleep: "23:00" }, [], at("15:22")))).toEqual(["15:30–23:00"]);
  });

  it("leggetid ved eller etter midnatt kuttes ved midnatt", () => {
    expect(show(freeIntervals(D, { wake: "09:00", sleep: "00:30" }, [], early))).toEqual(["09:00–00:00"]);
  });

  it("dropper hull under 15 minutter og takler overlappende opptatte blokker", () => {
    expect(freeIntervals(D, { wake: "07:00", sleep: "12:00" }, [busy("07:10", "09:00"), busy("08:30", "11:50")], early)).toEqual([]);
  });

  it("blokker før våkentiden (f.eks. Fajr) påvirker ikke resten", () => {
    expect(show(freeIntervals(D, { wake: "07:00", sleep: "09:00" }, [busy("05:19", "05:34")], early))).toEqual(["07:00–09:00"]);
  });

  it("gir ingenting for en dag som er over", () => {
    expect(freeIntervals(D, { wake: "07:00", sleep: "23:00" }, [], at("23:30"))).toEqual([]);
  });
});

describe("subtract", () => {
  it("deler et tidsrom i to", () => {
    expect(show(subtract([busy("08:00", "12:00")], [busy("09:00", "10:00")]))).toEqual(["08:00–09:00", "10:00–12:00"]);
  });
});

describe("awakeFor", () => {
  const rule = (days: Rule["params"] & { kind: "AWAKE_HOURS" }, enabled = true): Rule => ({ id: "r", strength: "SOFT", enabled, sourceText: null, params: days });
  it("bruker regelen for ukedagen, ellers 07–23", () => {
    const weekend = rule({ kind: "AWAKE_HOURS", days: ["SAT", "SUN"], wake: "09:00", sleep: "00:00" });
    expect(awakeFor("2026-10-31", [weekend])).toEqual({ wake: "09:00", sleep: "00:00" });
    expect(awakeFor(D, [weekend])).toEqual({ wake: "07:00", sleep: "23:00" });
  });
  it("hopper over avslåtte regler", () => {
    expect(awakeFor(D, [rule({ kind: "AWAKE_HOURS", days: ["MON"], wake: "10:00", sleep: "20:00" }, false)])).toEqual({ wake: "07:00", sleep: "23:00" });
  });
});
