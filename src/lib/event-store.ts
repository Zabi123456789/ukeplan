import { prisma } from "@/lib/db";
import type { Event } from "@/generated/prisma/client";
import { overlapsWith, type CalendarEvent } from "@/lib/events";
import { prayerBlocksBetween, prayerBlockToEvent } from "@/lib/prayer-store";

export function toCalendarEvent(e: Event): CalendarEvent {
  return {
    id: e.id,
    title: e.title,
    category: e.category,
    start: e.start.toISOString(),
    end: e.end.toISOString(),
    locked: e.locked,
    source: e.source,
    location: e.location,
    notes: e.notes,
  };
}

export function listEvents(from: Date, to: Date) {
  return prisma.event.findMany({
    where: { start: { lt: to }, end: { gt: from } },
    orderBy: { start: "asc" },
  });
}

/** Lagrede blokker og beregnede bønneblokker i tidsrommet, sortert etter start. */
export async function listCalendar(from: Date, to: Date): Promise<CalendarEvent[]> {
  const [events, prayers] = await Promise.all([listEvents(from, to), prayerBlocksBetween(from, to)]);
  return [...events.map(toCalendarEvent), ...prayers.map(prayerBlockToEvent)].sort((a, b) =>
    a.start.localeCompare(b.start),
  );
}

/** Andre blokker (også bønner) som overlapper tidsrommet. Brukes til å advare ved manuelle endringer. */
export async function conflictsFor(target: { id: string; start: Date; end: Date }) {
  const nearby = (await listCalendar(target.start, target.end)).map((e) => ({
    ...e,
    start: new Date(e.start),
    end: new Date(e.end),
  }));
  return overlapsWith(target, nearby).map((e) => ({ ...e, start: e.start.toISOString(), end: e.end.toISOString() }));
}

export function jsonError(message: string, status: number, details?: unknown) {
  return Response.json({ error: message, details }, { status });
}
