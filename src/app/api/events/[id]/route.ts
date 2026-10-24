import { prisma } from "@/lib/db";
import { updateEventSchema } from "@/lib/events";
import { conflictsFor, jsonError, toCalendarEvent } from "@/lib/event-store";

export async function PATCH(request: Request, ctx: RouteContext<"/api/events/[id]">) {
  const { id } = await ctx.params;
  const parsed = updateEventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Ugyldig endring", 400, parsed.error.issues);

  const existing = await prisma.event.findUnique({ where: { id } });
  if (!existing) return jsonError("Fant ikke hendelsen", 404);

  const changes = parsed.data;
  const start = changes.start ?? existing.start;
  const end = changes.end ?? existing.end;
  if (end <= start) return jsonError("Slutt må være etter start", 400);

  const moves = start.getTime() !== existing.start.getTime() || end.getTime() !== existing.end.getTime();
  // En låst blokk kan bare flyttes hvis den låses opp i samme forespørsel.
  if (moves && existing.locked && changes.locked !== false) {
    return jsonError("Blokken er låst. Lås den opp før du flytter den.", 409);
  }

  const event = await prisma.event.update({ where: { id }, data: changes });
  return Response.json({ event: toCalendarEvent(event), conflicts: await conflictsFor(event) });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/events/[id]">) {
  const { id } = await ctx.params;
  const existing = await prisma.event.findUnique({ where: { id } });
  if (!existing) return jsonError("Fant ikke hendelsen", 404);
  if (existing.locked) return jsonError("Blokken er låst. Lås den opp før du sletter den.", 409);

  await prisma.event.delete({ where: { id } });
  return new Response(null, { status: 204 });
}
