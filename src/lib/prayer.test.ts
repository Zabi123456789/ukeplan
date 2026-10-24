import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { describe, expect, it } from "vitest";
import {
  computePrayerDay,
  datesInRange,
  DEFAULT_PRAYER_SETTINGS as S,
  prayerBlocksForDay,
  prayerBlocksInRange,
  type Prayer,
} from "./prayer";

const oslo = (d: Date) => format(new TZDate(d.getTime(), "Europe/Oslo"), "yyyy-MM-dd HH:mm");
const minutesBetween = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / 60_000;
/** "2026-10-26T05:19" tolket som Oslo-tid, uavhengig av maskinens tidssone. */
const at = (local: string) => {
  const [y, mo, d, h, mi] = local.split(/[-T:]/).map(Number);
  return new Date(new TZDate(y, mo - 1, d, h, mi, "Europe/Oslo").getTime());
};

// Referanse: api.aladhan.com, method=0 (Ja'fari: Fajr 16°, Isha 14°, Maghrib 4°),
// Oslo 59.9139, 10.7522, latitudeAdjustmentMethod=1 (midt på natten). Hentet 2026-10-24.
// Unntak: Aladhans Asr avvek 4–8 min fra en uavhengig NOAA-solberegning (skygge = 1 + skygge
// ved middag), så Asr-verdiene her er fra den uavhengige beregningen.
const REFERENCE: Record<string, Record<Prayer, string>> = {
  "2026-01-15": { FAJR: "06:44", DHUHR: "12:26", ASR: "13:35", MAGHRIB: "16:23", ISHA: "17:53" },
  "2026-03-20": { FAJR: "04:13", DHUHR: "12:24", ASR: "15:31", MAGHRIB: "18:57", ISHA: "20:20" },
  "2026-06-21": { FAJR: "01:19", DHUHR: "13:19", ASR: "18:00", MAGHRIB: "23:35", ISHA: "01:19" },
  "2026-10-24": { FAJR: "06:14", DHUHR: "13:01", ASR: "15:07", MAGHRIB: "18:10", ISHA: "19:31" },
  "2026-10-26": { FAJR: "05:19", DHUHR: "12:01", ASR: "14:02", MAGHRIB: "17:05", ISHA: "18:26" },
};

describe("computePrayerDay mot referansetabell", () => {
  for (const [date, expected] of Object.entries(REFERENCE)) {
    it(`stemmer innen 3 minutter ${date}`, () => {
      const day = computePrayerDay(date, S);
      for (const [prayer, hhmm] of Object.entries(expected) as [Prayer, string][]) {
        // Isha i midtsommer er etter midnatt, altså neste dato.
        const refDate = prayer === "ISHA" && hhmm < "12:00" ? "2026-06-22" : date;
        expect(minutesBetween(day.times[prayer], at(`${refDate}T${hhmm}`)), `${prayer} ${date}`).toBeLessThanOrEqual(3);
      }
    });
  }

  it("Maghrib kommer etter solnedgang (rødfargen i øst)", () => {
    const day = computePrayerDay("2026-10-26", S);
    const delay = (day.times.MAGHRIB.getTime() - day.sunset.getTime()) / 60_000;
    expect(delay).toBeGreaterThan(15);
    expect(delay).toBeLessThan(40);
  });

  it("Ja'fari-midnatt ligger midt mellom solnedgang og neste Fajr", () => {
    const day = computePrayerDay("2026-01-15", S);
    const nextFajr = computePrayerDay("2026-01-16", S).times.FAJR;
    expect(day.midnight.getTime()).toBe((day.sunset.getTime() + nextFajr.getTime()) / 2);
  });

  it("regel for høye breddegrader endrer sommertidene", () => {
    const seventh = computePrayerDay("2026-06-21", { ...S, highLatitudeRule: "SEVENTH_OF_THE_NIGHT" });
    const middle = computePrayerDay("2026-06-21", S);
    expect(seventh.times.FAJR > middle.times.FAJR).toBe(true);
    expect(seventh.times.ISHA < middle.times.ISHA).toBe(true);
  });

  it("holder Maghrib ved rødfargen om sommeren selv når regelen flytter Isha tidligere", () => {
    const day = computePrayerDay("2026-06-21", { ...S, highLatitudeRule: "SEVENTH_OF_THE_NIGHT" });
    expect(minutesBetween(day.times.MAGHRIB, at("2026-06-21T23:35"))).toBeLessThanOrEqual(2);
    expect(day.times.ISHA >= day.times.MAGHRIB).toBe(true);
  });

  it("Maghrib-justering gjelder også vinkelberegnet Maghrib", () => {
    const base = computePrayerDay("2026-10-26", S);
    const adjusted = computePrayerDay("2026-10-26", { ...S, adjustments: { ...S.adjustments, MAGHRIB: 3 } });
    expect(minutesBetween(base.times.MAGHRIB, adjusted.times.MAGHRIB)).toBe(3);
  });

  it("MWL har Maghrib ved solnedgang", () => {
    const day = computePrayerDay("2026-10-26", { ...S, method: "MWL" });
    expect(day.times.MAGHRIB).toEqual(day.sunset);
  });

  it("justeringer i minutter legges til", () => {
    const base = computePrayerDay("2026-10-26", S);
    const adjusted = computePrayerDay("2026-10-26", { ...S, adjustments: { ...S.adjustments, FAJR: -10 } });
    expect(minutesBetween(base.times.FAJR, adjusted.times.FAJR)).toBe(10);
  });
});

describe("manuelle tider", () => {
  it("overstyrer beregningen og tolkes i Oslo-tid", () => {
    const day = computePrayerDay("2026-10-26", S, { FAJR: "05:30" });
    expect(oslo(day.times.FAJR)).toBe("2026-10-26 05:30");
    expect(day.overridden).toEqual(["FAJR"]);
    expect(oslo(day.calculated.FAJR)).not.toBe("2026-10-26 05:30");
  });

  it("Isha før kl. 12 betyr natt til neste dag", () => {
    const day = computePrayerDay("2026-06-21", S, { ISHA: "00:45" });
    expect(oslo(day.times.ISHA)).toBe("2026-06-22 00:45");
  });

  it("håndterer overgang fra sommertid (25. oktober)", () => {
    const before = computePrayerDay("2026-10-24", S, { DHUHR: "13:00" });
    const after = computePrayerDay("2026-10-25", S, { DHUHR: "13:00" });
    expect(before.times.DHUHR.toISOString()).toBe("2026-10-24T11:00:00.000Z");
    expect(after.times.DHUHR.toISOString()).toBe("2026-10-25T12:00:00.000Z");
  });
});

describe("bønneblokker", () => {
  it("gir tre blokker per dag når bønnene slås sammen", () => {
    const blocks = prayerBlocksForDay(computePrayerDay("2026-10-26", S), S);
    expect(blocks.map((b) => b.title)).toEqual(["Fajr", "Dhuhr + Asr", "Maghrib + Isha"]);
    expect(blocks.map((b) => (b.end.getTime() - b.start.getTime()) / 60_000)).toEqual([15, 20, 20]);
    expect(blocks[1].start).toEqual(computePrayerDay("2026-10-26", S).times.DHUHR);
  });

  it("gir fem blokker når sammenslåing er slått av", () => {
    const s = { ...S, combineDhuhrAsr: false, combineMaghribIsha: false };
    expect(prayerBlocksForDay(computePrayerDay("2026-10-26", s), s)).toHaveLength(5);
  });

  it("gir 21 blokker for en hel uke, uten overlapp", () => {
    const blocks = prayerBlocksInRange(at("2026-10-26T00:00"), at("2026-11-02T00:00"), S);
    expect(blocks).toHaveLength(21);
    for (let i = 1; i < blocks.length; i++) expect(blocks[i].start >= blocks[i - 1].end).toBe(true);
  });

  it("skyver blokker som kolliderer om sommeren i stedet for å overlappe", () => {
    // Midt på natten-regelen gir Isha og neste Fajr samme tid i juni.
    const s = { ...S, combineMaghribIsha: false };
    const blocks = prayerBlocksInRange(at("2026-06-21T00:00"), at("2026-06-23T00:00"), s);
    for (let i = 1; i < blocks.length; i++) expect(blocks[i].start >= blocks[i - 1].end).toBe(true);
  });

  it("tar med Maghrib+Isha fra kvelden før hvis den går over midnatt", () => {
    const blocks = prayerBlocksInRange(at("2026-06-22T00:00"), at("2026-06-22T02:00"), {
      ...S,
      combineMaghribIsha: false,
    });
    expect(blocks.some((b) => b.id === "prayer:2026-06-21:ISHA")).toBe(true);
  });
});

describe("datesInRange", () => {
  it("gir datoene i Oslo-tid for en uke", () => {
    expect(datesInRange(at("2026-10-26T00:00"), at("2026-11-02T00:00"), "Europe/Oslo")).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
  });
});
