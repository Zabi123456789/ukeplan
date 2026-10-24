import { z } from "zod";
import {
  CATEGORIES,
  createEventSchema,
  LOCATIONS,
  overlapsWith,
  SOURCES,
  updateEventSchema,
  type CalendarEvent,
} from "@/lib/events";
import type { Finding } from "@/lib/plan-validate";
import {
  computePrayerDay,
  DEFAULT_PRAYER_SETTINGS,
  PRAYERS,
  prayerBlocksInRange,
  prayerSettingsSchema,
  timeOfDay,
  type DayOverrides,
  type Prayer,
  type PrayerBlock,
  type PrayerSettings,
} from "@/lib/prayer";
import { DEFAULT_RULES, ruleInputSchema, type Rule, type RuleInput } from "@/lib/rules";

// All data i appen og operasjonene på den. Rene funksjoner: tar inn data og gir tilbake ny data.
// Lagringen i nettleseren ligger i store.ts.

export type PlanReport = {
  createdAt: string;
  created: number;
  replaced: number;
  summary: string;
  errors: Finding[];
  warnings: Finding[];
};

export type AppData = {
  events: CalendarEvent[];
  rules: Rule[];
  prayerSettings: PrayerSettings;
  /** Manuelle bønnetider per dato */
  prayerOverrides: Record<string, DayOverrides>;
  /** Siste planlegging per uke (nøkkel: mandag) */
  plans: Record<string, PlanReport>;
};

export class ActionError extends Error {}

export const newId = () => crypto.randomUUID();

export function emptyData(): AppData {
  return {
    events: [],
    rules: DEFAULT_RULES.map((r) => ({ ...r, id: newId() })),
    prayerSettings: DEFAULT_PRAYER_SETTINGS,
    prayerOverrides: {},
    plans: {},
  };
}

// ---------- Innlesing (tåler gamle eller ødelagte data) ----------

const storedEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.enum(CATEGORIES),
  start: z.iso.datetime({ offset: true }),
  end: z.iso.datetime({ offset: true }),
  locked: z.boolean(),
  source: z.enum(SOURCES),
  location: z.enum(LOCATIONS).nullable(),
  notes: z.string().nullable(),
});

/** Leser lagrede data. Ugyldige deler hoppes over i stedet for at appen krasjer. */
export function parseData(raw: unknown): AppData {
  const base = emptyData();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const list = <T,>(value: unknown, schema: z.ZodType<T>) =>
    Array.isArray(value) ? value.flatMap((v) => {
      const p = schema.safeParse(v);
      return p.success ? [p.data] : [];
    }) : [];

  const settings = prayerSettingsSchema.safeParse({
    ...DEFAULT_PRAYER_SETTINGS,
    ...(r.prayerSettings as object),
    adjustments: { ...DEFAULT_PRAYER_SETTINGS.adjustments, ...((r.prayerSettings as { adjustments?: object })?.adjustments ?? {}) },
  });
  const overrides = z.record(z.iso.date(), z.partialRecord(z.enum(PRAYERS), timeOfDay)).safeParse(r.prayerOverrides);

  return {
    events: list(r.events, storedEventSchema),
    rules: Array.isArray(r.rules) ? list(r.rules, ruleInputSchema.extend({ id: z.string() })) : base.rules,
    prayerSettings: settings.success ? settings.data : base.prayerSettings,
    prayerOverrides: overrides.success ? overrides.data : {},
    plans: r.plans && typeof r.plans === "object" ? (r.plans as Record<string, PlanReport>) : {},
  };
}

// ---------- Kalenderen ----------

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

export const isPrayerId = (id: string) => id.startsWith("prayer:");

export function prayerBlocksBetween(data: AppData, from: Date, to: Date) {
  return prayerBlocksInRange(from, to, data.prayerSettings, data.prayerOverrides);
}

/** Lagrede blokker og beregnede bønneblokker i tidsrommet, sortert etter start. */
export function calendarBetween(data: AppData, from: Date, to: Date): CalendarEvent[] {
  const events = data.events.filter((e) => new Date(e.start) < to && new Date(e.end) > from);
  const prayers = prayerBlocksBetween(data, from, to).map(prayerBlockToEvent);
  return [...events, ...prayers].sort((a, b) => a.start.localeCompare(b.start));
}

/** Andre blokker (også bønner) som overlapper. Brukes til å advare ved manuelle endringer. */
export function conflictsFor(data: AppData, target: { id: string; start: Date; end: Date }) {
  const nearby = calendarBetween(data, target.start, target.end).map((e) => ({ ...e, start: new Date(e.start), end: new Date(e.end) }));
  return overlapsWith(target, nearby).map((e) => ({ ...e, start: e.start.toISOString(), end: e.end.toISOString() }));
}

const PRAYER_FIXED = "Bønnetider flyttes ikke. Endre tiden ved å klikke på bønnen, eller under Bønnetider.";

export function createEvent(data: AppData, input: unknown) {
  const parsed = createEventSchema.safeParse(input);
  if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "Ugyldig hendelse");
  const { start, end, ...rest } = parsed.data;
  const event: CalendarEvent = { ...rest, id: newId(), source: "MANUAL", start: start.toISOString(), end: end.toISOString() };
  const next = { ...data, events: [...data.events, event] };
  return { data: next, event, conflicts: conflictsFor(next, { id: event.id, start, end }) };
}

export function updateEvent(data: AppData, id: string, input: unknown) {
  if (isPrayerId(id)) throw new ActionError(PRAYER_FIXED);
  const parsed = updateEventSchema.safeParse(input);
  if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "Ugyldig endring");
  const existing = data.events.find((e) => e.id === id);
  if (!existing) throw new ActionError("Fant ikke hendelsen");

  const changes = parsed.data;
  const start = changes.start ?? new Date(existing.start);
  const end = changes.end ?? new Date(existing.end);
  if (end <= start) throw new ActionError("Slutt må være etter start");
  const moves = start.getTime() !== new Date(existing.start).getTime() || end.getTime() !== new Date(existing.end).getTime();
  // En låst blokk kan bare flyttes hvis den låses opp i samme endring.
  if (moves && existing.locked && changes.locked !== false) {
    throw new ActionError("Blokken er låst. Lås den opp før du flytter den.");
  }

  const event: CalendarEvent = { ...existing, ...changes, start: start.toISOString(), end: end.toISOString() };
  const next = { ...data, events: data.events.map((e) => (e.id === id ? event : e)) };
  return { data: next, event, conflicts: conflictsFor(next, { id, start, end }) };
}

export function deleteEvent(data: AppData, id: string): AppData {
  if (isPrayerId(id)) throw new ActionError(PRAYER_FIXED);
  const existing = data.events.find((e) => e.id === id);
  if (!existing) throw new ActionError("Fant ikke hendelsen");
  if (existing.locked) throw new ActionError("Blokken er låst. Lås den opp før du sletter den.");
  return { ...data, events: data.events.filter((e) => e.id !== id) };
}

// ---------- Bønnetider ----------

export function prayerDay(data: AppData, date: string) {
  return computePrayerDay(date, data.prayerSettings, data.prayerOverrides[date]);
}

export function setPrayerOverride(data: AppData, date: string, prayer: Prayer, time: string | null): AppData {
  if (time !== null && !timeOfDay.safeParse(time).success) throw new ActionError("Bruk formatet TT:MM");
  const day = { ...data.prayerOverrides[date] };
  if (time === null) delete day[prayer];
  else day[prayer] = time;
  const prayerOverrides = { ...data.prayerOverrides, [date]: day };
  if (Object.keys(day).length === 0) delete prayerOverrides[date];
  return { ...data, prayerOverrides };
}

export function setPrayerSettings(data: AppData, settings: PrayerSettings): AppData {
  return { ...data, prayerSettings: prayerSettingsSchema.parse(settings) };
}

// ---------- Regler ----------

export function addRules(data: AppData, rules: RuleInput[]): AppData {
  const parsed = rules.map((r) => ruleInputSchema.parse(r));
  return { ...data, rules: [...data.rules, ...parsed.map((r) => ({ ...r, id: newId() }))] };
}

export function updateRule(data: AppData, id: string, rule: RuleInput): AppData {
  const parsed = ruleInputSchema.parse(rule);
  if (!data.rules.some((r) => r.id === id)) throw new ActionError("Fant ikke regelen");
  return { ...data, rules: data.rules.map((r) => (r.id === id ? { ...parsed, id } : r)) };
}

export function deleteRule(data: AppData, id: string): AppData {
  return { ...data, rules: data.rules.filter((r) => r.id !== id) };
}
