import { TZDate } from "@date-fns/tz";
import { CalculationParameters, Coordinates, HighLatitudeRule, Madhab, PrayerTimes } from "adhan";
import { addDays, format } from "date-fns";
import { z } from "zod";

// Ren beregning uten database, så den kan brukes både på serveren og i innstillingssiden.

export const PRAYERS = ["FAJR", "DHUHR", "ASR", "MAGHRIB", "ISHA"] as const;
export type Prayer = (typeof PRAYERS)[number];
export const PRAYER_LABEL: Record<Prayer, string> = {
  FAJR: "Fajr",
  DHUHR: "Dhuhr",
  ASR: "Asr",
  MAGHRIB: "Maghrib",
  ISHA: "Isha",
};

export const METHODS = ["JAFARI", "TEHRAN", "MWL", "CUSTOM"] as const;
export type Method = (typeof METHODS)[number];
export const METHOD_INFO: Record<Method, { label: string; fajr: number; isha: number; maghrib: number }> = {
  // Maghrib-vinkelen er når rødfargen i øst er borte (shia). 0 betyr ved solnedgang.
  JAFARI: { label: "Ja'fari (Leva-instituttet, Qum)", fajr: 16, isha: 14, maghrib: 4 },
  TEHRAN: { label: "Teheran-universitetet", fajr: 17.7, isha: 14, maghrib: 4.5 },
  MWL: { label: "Muslim World League", fajr: 18, isha: 17, maghrib: 0 },
  CUSTOM: { label: "Egne vinkler", fajr: 16, isha: 14, maghrib: 4 },
};

export const HIGH_LATITUDE_RULES = ["MIDDLE_OF_THE_NIGHT", "SEVENTH_OF_THE_NIGHT", "TWILIGHT_ANGLE"] as const;
export type HighLatitude = (typeof HIGH_LATITUDE_RULES)[number];
export const HIGH_LATITUDE_INFO: Record<HighLatitude, { label: string; help: string }> = {
  MIDDLE_OF_THE_NIGHT: {
    label: "Midt på natten",
    help: "Fajr og Isha begrenses til midten av natten (solnedgang–soloppgang). Gir sene Isha- og tidlige Fajr-tider om sommeren.",
  },
  SEVENTH_OF_THE_NIGHT: {
    label: "Sjuendedel av natten",
    help: "Fajr er tidligst en sjuendedel av natten før soloppgang, og Isha senest en sjuendedel etter solnedgang.",
  },
  TWILIGHT_ANGLE: {
    label: "Tusmørkevinkel",
    help: "Andelen av natten er vinkelen delt på 60 (f.eks. 16° gir 16/60 av natten).",
  },
};
const ADHAN_HIGH_LATITUDE: Record<HighLatitude, CalculationParameters["highLatitudeRule"]> = {
  MIDDLE_OF_THE_NIGHT: HighLatitudeRule.MiddleOfTheNight,
  SEVENTH_OF_THE_NIGHT: HighLatitudeRule.SeventhOfTheNight,
  TWILIGHT_ANGLE: HighLatitudeRule.TwilightAngle,
};

export const ASR_METHODS = ["STANDARD", "HANAFI"] as const;

const minutes = z.number().int().min(-60).max(60);
const angle = z.number().min(0).max(25);

export const prayerSettingsSchema = z.object({
  latitude: z.number().min(-66).max(66),
  longitude: z.number().min(-180).max(180),
  timeZone: z.string().min(1),
  method: z.enum(METHODS),
  // Brukes bare når method er CUSTOM
  fajrAngle: angle,
  ishaAngle: angle,
  maghribAngle: angle,
  asrMethod: z.enum(ASR_METHODS),
  highLatitudeRule: z.enum(HIGH_LATITUDE_RULES),
  combineDhuhrAsr: z.boolean(),
  combineMaghribIsha: z.boolean(),
  singleMinutes: z.number().int().min(5).max(120),
  combinedMinutes: z.number().int().min(5).max(120),
  adjustments: z.object({ FAJR: minutes, DHUHR: minutes, ASR: minutes, MAGHRIB: minutes, ISHA: minutes }),
});
export type PrayerSettings = z.infer<typeof prayerSettingsSchema>;

export const DEFAULT_PRAYER_SETTINGS: PrayerSettings = {
  latitude: 59.9139,
  longitude: 10.7522,
  timeZone: "Europe/Oslo",
  method: "JAFARI",
  fajrAngle: 16,
  ishaAngle: 14,
  maghribAngle: 4,
  asrMethod: "STANDARD",
  highLatitudeRule: "MIDDLE_OF_THE_NIGHT",
  combineDhuhrAsr: true,
  combineMaghribIsha: true,
  singleMinutes: 15,
  combinedMinutes: 20,
  adjustments: { FAJR: 0, DHUHR: 0, ASR: 0, MAGHRIB: 0, ISHA: 0 },
};

/** Manuelle tider for én dato, "HH:mm" i lokal tid. */
export type DayOverrides = Partial<Record<Prayer, string>>;
export const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Bruk formatet TT:MM");

export type PrayerDay = {
  date: string; // YYYY-MM-DD i innstillingenes tidssone
  times: Record<Prayer, Date>;
  calculated: Record<Prayer, Date>;
  overridden: Prayer[];
  sunrise: Date;
  sunset: Date;
  /** Ja'fari-midnatt: midt mellom solnedgang og neste dags Fajr. Siste frist for Maghrib og Isha. */
  midnight: Date;
};

function adhanParams(s: PrayerSettings) {
  const a = s.method === "CUSTOM" ? { fajr: s.fajrAngle, isha: s.ishaAngle, maghrib: s.maghribAngle } : METHOD_INFO[s.method];
  const params = new CalculationParameters("Other", a.fajr, a.isha, 0, a.maghrib);
  params.madhab = s.asrMethod === "HANAFI" ? Madhab.Hanafi : Madhab.Shafi;
  params.highLatitudeRule = ADHAN_HIGH_LATITUDE[s.highLatitudeRule];
  params.adjustments = {
    fajr: s.adjustments.FAJR,
    sunrise: 0,
    dhuhr: s.adjustments.DHUHR,
    asr: s.adjustments.ASR,
    maghrib: s.adjustments.MAGHRIB,
    isha: s.adjustments.ISHA,
  };
  return params;
}

function parseDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

function adhanTimes(date: string, s: PrayerSettings, params = adhanParams(s)) {
  const { y, m, d } = parseDate(date);
  // adhan leser bare år/måned/dag fra datoen og returnerer tidspunkter i UTC.
  return new PrayerTimes(new Coordinates(s.latitude, s.longitude), new Date(y, m - 1, d), params);
}

/**
 * Maghrib når solen er `maghribAngle` under horisonten (rødfargen i øst er borte).
 * adhan bruker bare vinkelen hvis Isha kommer senere, og om sommeren kan regelen for
 * lyse netter flytte Isha tidligere. Da faller adhan tilbake til solnedgang, som er feil
 * for shia. Derfor regnes Maghrib ut for seg, som en «Isha» med Maghrib-vinkelen.
 */
function angleMaghrib(date: string, s: PrayerSettings, angle: number) {
  const params = adhanParams(s);
  params.ishaAngle = angle;
  params.maghribAngle = 0;
  params.highLatitudeRule = HighLatitudeRule.MiddleOfTheNight; // brukes bare hvis vinkelen aldri nås
  params.adjustments = { ...params.adjustments, isha: s.adjustments.MAGHRIB };
  return adhanTimes(date, s, params).isha;
}

/** Gjør "HH:mm" på en dato om til et tidspunkt. Maghrib/Isha før kl. 12 tolkes som etter midnatt. */
export function overrideToDate(date: string, prayer: Prayer, time: string, timeZone: string) {
  const { y, m, d } = parseDate(date);
  const [h, min] = time.split(":").map(Number);
  const afterMidnight = (prayer === "MAGHRIB" || prayer === "ISHA") && h < 12;
  return new Date(new TZDate(y, m - 1, d + (afterMidnight ? 1 : 0), h, min, timeZone).getTime());
}

export function computePrayerDay(date: string, s: PrayerSettings, overrides: DayOverrides = {}): PrayerDay {
  const t = adhanTimes(date, s);
  const maghribAngle = s.method === "CUSTOM" ? s.maghribAngle : METHOD_INFO[s.method].maghrib;
  const maghrib = maghribAngle > 0 ? angleMaghrib(date, s, maghribAngle) : t.maghrib;
  const calculated: Record<Prayer, Date> = {
    FAJR: t.fajr,
    DHUHR: t.dhuhr,
    ASR: t.asr,
    MAGHRIB: maghrib,
    // Isha kan bes rett etter Maghrib, men aldri før.
    ISHA: t.isha < maghrib ? maghrib : t.isha,
  };
  const times = { ...calculated };
  const overridden: Prayer[] = [];
  for (const p of PRAYERS) {
    const manual = overrides[p];
    if (manual) {
      times[p] = overrideToDate(date, p, manual, s.timeZone);
      overridden.push(p);
    }
  }
  const nextFajr = adhanTimes(shiftDate(date, 1), s).fajr;
  const midnight = new Date((t.sunset.getTime() + nextFajr.getTime()) / 2);
  return { date, times, calculated, overridden, sunrise: t.sunrise, sunset: t.sunset, midnight };
}

export type PrayerBlock = {
  id: string; // "prayer:2026-10-26:DHUHR"
  date: string;
  title: string;
  prayers: Prayer[];
  start: Date;
  end: Date;
};

/** Bønneblokkene for én dag. Dhuhr+Asr og Maghrib+Isha slås sammen hvis innstillingen sier det. */
export function prayerBlocksForDay(day: PrayerDay, s: PrayerSettings): PrayerBlock[] {
  const groups: Prayer[][] = [
    ["FAJR"],
    ...(s.combineDhuhrAsr ? [["DHUHR", "ASR"] as Prayer[]] : [["DHUHR"] as Prayer[], ["ASR"] as Prayer[]]),
    ...(s.combineMaghribIsha ? [["MAGHRIB", "ISHA"] as Prayer[]] : [["MAGHRIB"] as Prayer[], ["ISHA"] as Prayer[]]),
  ];
  return groups.map((prayers) => {
    const start = day.times[prayers[0]];
    const length = prayers.length > 1 ? s.combinedMinutes : s.singleMinutes;
    return {
      id: `prayer:${day.date}:${prayers[0]}`,
      date: day.date,
      title: prayers.map((p) => PRAYER_LABEL[p]).join(" + "),
      prayers,
      start,
      end: new Date(start.getTime() + length * 60_000),
    };
  });
}

/** Datoer (i tidssonen) som tidsrommet [from, to) berører. */
export function datesInRange(from: Date, to: Date, timeZone: string): string[] {
  const dates: string[] = [];
  let day = new TZDate(from.getTime(), timeZone);
  const last = format(new TZDate(to.getTime() - 1, timeZone), "yyyy-MM-dd");
  for (let i = 0; i < 400; i++) {
    const key = format(day, "yyyy-MM-dd");
    dates.push(key);
    if (key >= last) break;
    day = addDays(day, 1);
  }
  return dates;
}

export function shiftDate(date: string, days: number) {
  const { y, m, d } = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Alle bønneblokker som overlapper [from, to). Tar med dagen før, siden Maghrib+Isha
 * kan gå over midnatt om sommeren. Hvis to blokker kolliderer (f.eks. sen Isha og tidlig
 * Fajr i juni), legges den siste rett etter den første, så blokkene aldri overlapper.
 */
export function prayerBlocksInRange(
  from: Date,
  to: Date,
  s: PrayerSettings,
  overridesByDate: Record<string, DayOverrides> = {},
): PrayerBlock[] {
  const dates = datesInRange(from, to, s.timeZone);
  const all = [shiftDate(dates[0], -1), ...dates].flatMap((date) =>
    prayerBlocksForDay(computePrayerDay(date, s, overridesByDate[date]), s),
  );
  all.sort((a, b) => a.start.getTime() - b.start.getTime());
  for (let i = 1; i < all.length; i++) {
    const prev = all[i - 1];
    if (all[i].start < prev.end) {
      const length = all[i].end.getTime() - all[i].start.getTime();
      all[i] = { ...all[i], start: prev.end, end: new Date(prev.end.getTime() + length) };
    }
  }
  return all.filter((b) => b.start < to && b.end > from);
}

/** Dagens dato (YYYY-MM-DD) i tidssonen. */
export function todayIn(timeZone: string) {
  return format(new TZDate(Date.now(), timeZone), "yyyy-MM-dd");
}
