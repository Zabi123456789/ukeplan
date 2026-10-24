import { prisma } from "@/lib/db";
import type { Event } from "@/generated/prisma/client";
import { overlapsWith, type CalendarEvent } from "@/lib/events";

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

/** Andre blokker som overlapper tidsrommet. Brukes til å advare ved manuelle endringer. */
export async function conflictsFor(target: { id: string; start: Date; end: Date }) {
  const nearby = await listEvents(target.start, target.end);
  return overlapsWith(target, nearby).map(toCalendarEvent);
}

export function jsonError(message: string, status: number, details?: unknown) {
  return Response.json({ error: message, details }, { status });
}
