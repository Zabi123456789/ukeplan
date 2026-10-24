import { jsonError } from "@/lib/event-store";
import { prayerSettingsSchema } from "@/lib/prayer";
import { getPrayerSettings, savePrayerSettings } from "@/lib/prayer-store";

export async function GET() {
  return Response.json(await getPrayerSettings());
}

export async function PUT(request: Request) {
  const parsed = prayerSettingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Ugyldige innstillinger", 400, parsed.error.issues);
  await savePrayerSettings(parsed.data);
  return Response.json(parsed.data);
}
