import { prisma } from "@/lib/db";
import { createEventSchema } from "@/lib/events";
import { conflictsFor, jsonError, listEvents, toCalendarEvent } from "@/lib/event-store";

// GET /api/events?start=ISO&end=ISO
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const from = new Date(params.get("start") ?? "");
  const to = new Date(params.get("end") ?? "");
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return jsonError("start og end må være gyldige datoer", 400);
  }
  const events = await listEvents(from, to);
  return Response.json(events.map(toCalendarEvent));
}

export async function POST(request: Request) {
  const parsed = createEventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Ugyldig hendelse", 400, parsed.error.issues);

  const event = await prisma.event.create({ data: { ...parsed.data, source: "MANUAL" } });
  return Response.json(
    { event: toCalendarEvent(event), conflicts: await conflictsFor(event) },
    { status: 201 },
  );
}
