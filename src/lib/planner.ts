import { ActionError, calendarBetween, newId, type AppData, type PlanReport } from "@/lib/calendar";
import type { CalendarEvent } from "@/lib/events";
import { ceilToQuarter } from "@/lib/free-time";
import type { FixedBlock } from "@/lib/plan-validate";
import { scheduleWeek } from "@/lib/scheduler";
import { weekRange } from "@/lib/week";

/**
 * Planlegger uka og lagrer resultatet i dataene. Ulåste planlagte blokker fra nå og ut uka
 * byttes ut. Bønner, låste blokker og blokker du har lagt inn selv blir stående.
 */
export function planWeek(data: AppData, monday: string, now = new Date()): { data: AppData; report: PlanReport } {
  const range = weekRange(monday);
  const from = new Date(Math.max(range.from.getTime(), ceilToQuarter(now).getTime()));
  if (from >= range.to) throw new ActionError("Uka er allerede over.");

  const replaceable = new Set(
    data.events.filter((e) => e.source === "AI" && !e.locked && new Date(e.start) >= from && new Date(e.start) < range.to).map((e) => e.id),
  );
  const fixed: FixedBlock[] = calendarBetween(data, range.from, range.to)
    .filter((e) => !replaceable.has(e.id))
    .map((e) => ({ ...e, start: new Date(e.start), end: new Date(e.end) }));

  const result = scheduleWeek({ monday, now, rules: data.rules, fixed });

  // Feil uten regel (overlapp, utenfor uka) betyr en feil i planleggeren: da lagres ingenting.
  const systemErrors = result.errors.filter((e) => e.ruleId === null);
  if (systemErrors.length) throw new ActionError(`Planen ble avvist: ${systemErrors[0].message}`);

  const created: CalendarEvent[] = result.blocks.map((b) => ({
    id: newId(),
    title: b.title,
    category: b.category,
    start: b.start.toISOString(),
    end: b.end.toISOString(),
    locked: false,
    source: "AI",
    location: b.location,
    notes: null,
  }));
  const report: PlanReport = {
    createdAt: now.toISOString(),
    created: created.length,
    replaced: replaceable.size,
    summary: result.summary,
    errors: result.errors,
    warnings: result.warnings,
  };
  return {
    data: {
      ...data,
      events: [...data.events.filter((e) => !replaceable.has(e.id)), ...created],
      plans: { ...data.plans, [monday]: report },
    },
    report,
  };
}
