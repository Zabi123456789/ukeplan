import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { WEEKDAYS, type Weekday } from "@/lib/rules";

// Hjelpere for lokal tid (Europe/Oslo) uavhengig av maskinens tidssone.

export const TIME_ZONE = "Europe/Oslo";

export function localParts(d: Date, timeZone = TIME_ZONE) {
  const t = new TZDate(d.getTime(), timeZone);
  return {
    date: format(t, "yyyy-MM-dd"),
    time: format(t, "HH:mm"),
    minutes: t.getHours() * 60 + t.getMinutes(),
    weekday: WEEKDAYS[(t.getDay() + 6) % 7] as Weekday,
  };
}

/** "2026-10-26" + "09:30" i lokal tid. "24:00" betyr midnatt etter datoen. */
export function localDateTime(date: string, time: string, timeZone = TIME_ZONE): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return new Date(new TZDate(y, m - 1, d, h, min, timeZone).getTime());
}

export function addDays(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function weekdayOf(date: string): Weekday {
  const [y, m, d] = date.split("-").map(Number);
  return WEEKDAYS[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7];
}

/** Mandagen i uka datoen ligger i. */
export function mondayOf(date: string) {
  return addDays(date, -WEEKDAYS.indexOf(weekdayOf(date)));
}

export function weekDates(monday: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function weekRange(monday: string, timeZone = TIME_ZONE) {
  return { from: localDateTime(monday, "00:00", timeZone), to: localDateTime(addDays(monday, 7), "00:00", timeZone) };
}
