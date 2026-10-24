import { prisma } from "@/lib/db";
import type { CalendarEvent } from "@/lib/events";
import {
  computePrayerDay,
  DEFAULT_PRAYER_SETTINGS,
  datesInRange,
  prayerBlocksInRange,
  prayerSettingsSchema,
  shiftDate,
  type DayOverrides,
  type Prayer,
  type PrayerBlock,
  type PrayerSettings,
} from "@/lib/prayer";

const SETTINGS_KEY = "prayer";

export async function getPrayerSettings(): Promise<PrayerSettings> {
  const row = await prisma.setting.findUnique({ where: { key: SETTINGS_KEY } });
  if (!row) return DEFAULT_PRAYER_SETTINGS;
  const stored = JSON.parse(row.value);
  // Slå sammen med standardverdiene, så nye felt fungerer med gamle lagrede innstillinger.
  const parsed = prayerSettingsSchema.safeParse({
    ...DEFAULT_PRAYER_SETTINGS,
    ...stored,
    adjustments: { ...DEFAULT_PRAYER_SETTINGS.adjustments, ...stored.adjustments },
  });
  return parsed.success ? parsed.data : DEFAULT_PRAYER_SETTINGS;
}

export async function savePrayerSettings(settings: PrayerSettings) {
  const value = JSON.stringify(settings);
  await prisma.setting.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value },
    update: { value },
  });
}

async function overridesFor(dates: string[]): Promise<Record<string, DayOverrides>> {
  const rows = await prisma.prayerOverride.findMany({ where: { date: { in: dates } } });
  const byDate: Record<string, DayOverrides> = {};
  for (const r of rows) (byDate[r.date] ??= {})[r.prayer] = r.time;
  return byDate;
}

export async function prayerBlocksBetween(from: Date, to: Date): Promise<PrayerBlock[]> {
  const settings = await getPrayerSettings();
  const dates = datesInRange(from, to, settings.timeZone);
  const overrides = await overridesFor([shiftDate(dates[0], -1), ...dates]);
  return prayerBlocksInRange(from, to, settings, overrides);
}

export async function getPrayerDay(date: string) {
  const settings = await getPrayerSettings();
  const overrides = await overridesFor([date]);
  return computePrayerDay(date, settings, overrides[date]);
}

export async function setPrayerOverride(date: string, prayer: Prayer, time: string | null) {
  if (time === null) {
    await prisma.prayerOverride.deleteMany({ where: { date, prayer } });
  } else {
    await prisma.prayerOverride.upsert({
      where: { date_prayer: { date, prayer } },
      create: { date, prayer, time },
      update: { time },
    });
  }
}

export const isPrayerId = (id: string) => id.startsWith("prayer:");

export function prayerBlockToEvent(b: PrayerBlock): CalendarEvent {
  return {
    id: b.id,
    title: b.title,
    category: "RELIGION",
    start: b.start.toISOString(),
    end: b.end.toISOString(),
    locked: true,
    source: "PRAYER",
    location: null,
    notes: null,
  };
}
