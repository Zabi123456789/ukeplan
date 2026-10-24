import { describe, expect, it } from "vitest";
import {
  ActionError,
  addRules,
  calendarBetween,
  createEvent,
  deleteEvent,
  emptyData,
  parseData,
  prayerDay,
  setPrayerOverride,
  updateEvent,
  type AppData,
} from "./calendar";
import { localDateTime } from "./week";

const MONDAY = "2026-10-26";
const iso = (t: string, d = MONDAY) => localDateTime(d, t).toISOString();
const input = (title: string, from: string, to: string, extra = {}) => ({ title, category: "SCHOOL", start: iso(from), end: iso(to), ...extra });

function withEvent(extra = {}) {
  return createEvent(emptyData(), input("Lesing", "09:00", "10:00", extra));
}

describe("kalenderen", () => {
  it("viser lagrede blokker og tre bønneblokker per dag", () => {
    const { data } = withEvent();
    const day = calendarBetween(data, localDateTime(MONDAY, "00:00"), localDateTime("2026-10-27", "00:00"));
    expect(day.map((e) => `${e.title}:${e.source}`)).toEqual(["Fajr:PRAYER", "Lesing:MANUAL", "Dhuhr + Asr:PRAYER", "Maghrib + Isha:PRAYER"]);
  });

  it("nye blokker blir manuelle og advarer om overlapp med bønner", () => {
    const { event, conflicts } = createEvent(emptyData(), input("Forelesning", "11:30", "13:00"));
    expect(event.source).toBe("MANUAL");
    expect(conflicts.map((c) => c.title)).toEqual(["Dhuhr + Asr"]);
  });

  it("avviser ugyldig input", () => {
    expect(() => createEvent(emptyData(), input("", "09:00", "10:00"))).toThrow(ActionError);
    expect(() => createEvent(emptyData(), input("X", "10:00", "09:00"))).toThrow(/Slutt må være etter start/);
  });

  it("låste blokker kan ikke flyttes eller slettes før de låses opp", () => {
    const { data, event } = withEvent({ locked: true });
    expect(() => updateEvent(data, event.id, { start: iso("12:00"), end: iso("13:00") })).toThrow(/låst/);
    expect(() => deleteEvent(data, event.id)).toThrow(/låst/);
    const moved = updateEvent(data, event.id, { start: iso("14:00"), end: iso("15:00"), locked: false });
    expect(moved.event).toMatchObject({ locked: false, start: iso("14:00") });
    expect(deleteEvent(moved.data, event.id).events).toEqual([]);
  });

  it("andre endringer på en låst blokk er lov", () => {
    const { data, event } = withEvent({ locked: true });
    expect(updateEvent(data, event.id, { title: "Statistikk" }).event.title).toBe("Statistikk");
  });

  it("bønneblokker kan ikke endres eller slettes", () => {
    const data = emptyData();
    expect(() => updateEvent(data, `prayer:${MONDAY}:FAJR`, { title: "x" })).toThrow(/Bønnetider flyttes ikke/);
    expect(() => deleteEvent(data, `prayer:${MONDAY}:FAJR`)).toThrow(/Bønnetider flyttes ikke/);
  });
});

describe("manuelle bønnetider", () => {
  it("overstyrer og tilbakestiller, og rydder tomme datoer", () => {
    let data: AppData = setPrayerOverride(emptyData(), MONDAY, "FAJR", "05:30");
    expect(prayerDay(data, MONDAY).overridden).toEqual(["FAJR"]);
    data = setPrayerOverride(data, MONDAY, "FAJR", null);
    expect(data.prayerOverrides).toEqual({});
    expect(() => setPrayerOverride(data, MONDAY, "FAJR", "25:00")).toThrow(ActionError);
  });
});

describe("parseData", () => {
  it("gir standarddata for tomt eller ødelagt innhold", () => {
    for (const raw of [null, "tekst", 42, {}]) {
      const data = parseData(raw);
      expect(data.events).toEqual([]);
      expect(data.rules.map((r) => r.params.kind)).toEqual(["AWAKE_HOURS", "AWAKE_HOURS"]);
      expect(data.prayerSettings.method).toBe("JAFARI");
    }
  });

  it("beholder gyldige blokker og hopper over ugyldige", () => {
    const { data, event } = withEvent();
    const raw = JSON.parse(JSON.stringify({ ...data, events: [...data.events, { id: "x", title: "Mangler felt" }] }));
    expect(parseData(raw).events).toEqual([event]);
  });

  it("tåler at nye innstillingsfelt mangler i gamle data", () => {
    const raw = { prayerSettings: { method: "TEHRAN" } };
    expect(parseData(raw).prayerSettings).toMatchObject({ method: "TEHRAN", combineDhuhrAsr: true, adjustments: { FAJR: 0 } });
  });

  it("beholder lagrede regler og bruker ikke standardreglene da", () => {
    const data = addRules({ ...emptyData(), rules: [] }, [
      { strength: "HARD", enabled: true, sourceText: null, params: { kind: "NOTE", text: "Fri søndag" } },
    ]);
    expect(parseData(JSON.parse(JSON.stringify(data))).rules.map((r) => r.params.kind)).toEqual(["NOTE"]);
  });
});
