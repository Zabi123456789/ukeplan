import { z } from "zod";
import { jsonError } from "@/lib/event-store";
import { PRAYERS, timeOfDay, type PrayerDay } from "@/lib/prayer";
import { getPrayerDay, setPrayerOverride } from "@/lib/prayer-store";

const dateSchema = z.iso.date();
const overrideSchema = z.object({ prayer: z.enum(PRAYERS), time: timeOfDay.nullable() });

function serialize(day: PrayerDay) {
  const iso = (r: Record<string, Date>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.toISOString()]));
  return {
    date: day.date,
    times: iso(day.times),
    calculated: iso(day.calculated),
    overridden: day.overridden,
    sunrise: day.sunrise.toISOString(),
    sunset: day.sunset.toISOString(),
    midnight: day.midnight.toISOString(),
  };
}
export type PrayerDayResponse = ReturnType<typeof serialize>;

// GET /api/prayers/2026-10-26: beregnede og manuelle tider for dagen
export async function GET(_request: Request, ctx: RouteContext<"/api/prayers/[date]">) {
  const { date } = await ctx.params;
  if (!dateSchema.safeParse(date).success) return jsonError("Ugyldig dato", 400);
  return Response.json(serialize(await getPrayerDay(date)));
}

// PUT /api/prayers/2026-10-26 { prayer: "FAJR", time: "05:30" | null }. null fjerner den manuelle tiden.
export async function PUT(request: Request, ctx: RouteContext<"/api/prayers/[date]">) {
  const { date } = await ctx.params;
  if (!dateSchema.safeParse(date).success) return jsonError("Ugyldig dato", 400);
  const parsed = overrideSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Ugyldig tid", 400, parsed.error.issues);
  await setPrayerOverride(date, parsed.data.prayer, parsed.data.time);
  return Response.json(serialize(await getPrayerDay(date)));
}
