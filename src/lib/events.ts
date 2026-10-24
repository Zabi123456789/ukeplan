import { z } from "zod";

// Kategorier, typer og skjemaer for blokker i kalenderen.

// Rekkefølgen er også prioriteten når planleggeren fordeler tid.
export const CATEGORIES = ["RELIGION", "SCHOOL", "TRAINING", "SOCIAL", "ALONE", "WORK", "OTHER"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_INFO: Record<Category, { label: string; color: string }> = {
  RELIGION: { label: "Religion", color: "#0f766e" },
  SCHOOL: { label: "Skole", color: "#1d4ed8" },
  TRAINING: { label: "Trening", color: "#15803d" },
  SOCIAL: { label: "Familie og venner", color: "#c2410c" },
  ALONE: { label: "Alenetid", color: "#7c3aed" },
  WORK: { label: "Jobb", color: "#a16207" },
  OTHER: { label: "Annet", color: "#475569" },
};

export const LOCATIONS = ["HOME", "OUT"] as const;
export type Location = (typeof LOCATIONS)[number];
export const LOCATION_LABEL: Record<Location, string> = { HOME: "Hjemme", OUT: "Ute" };

export const SOURCES = ["MANUAL", "PRAYER", "AI"] as const;
export type Source = (typeof SOURCES)[number];

export type CalendarEvent = {
  id: string;
  title: string;
  category: Category;
  start: string; // ISO, UTC
  end: string;
  locked: boolean;
  source: Source;
  location: Location | null;
  notes: string | null;
};

const isoDate = z.iso.datetime({ offset: true }).transform((s) => new Date(s));

const eventFields = {
  title: z.string().trim().min(1, "Tittel mangler").max(120),
  category: z.enum(CATEGORIES),
  start: isoDate,
  end: isoDate,
  locked: z.boolean(),
  location: z.enum(LOCATIONS).nullable(),
  notes: z.string().max(2000).nullable(),
};

const endAfterStart = (e: { start?: Date; end?: Date }) => !e.start || !e.end || e.end > e.start;
const endAfterStartMsg = { message: "Slutt må være etter start", path: ["end"] };

export const createEventSchema = z
  .object({
    ...eventFields,
    locked: eventFields.locked.default(false),
    location: eventFields.location.default(null),
    notes: eventFields.notes.default(null),
  })
  .refine(endAfterStart, endAfterStartMsg);

export const updateEventSchema = z.object(eventFields).partial().refine(endAfterStart, endAfterStartMsg);

export type Interval = { id: string; start: Date; end: Date };

/** Alle par av blokker som overlapper. Blokker som bare møtes i kanten (10:00–11:00 og 11:00–12:00) overlapper ikke. */
export function findOverlaps<T extends Interval>(items: T[]): [T, T][] {
  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime());
  const pairs: [T, T][] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length && sorted[j].start < sorted[i].end; j++) {
      pairs.push([sorted[i], sorted[j]]);
    }
  }
  return pairs;
}

/** Blokkene i `others` som overlapper `target` (target selv er utelatt). */
export function overlapsWith<T extends Interval>(target: Interval, others: T[]): T[] {
  return others.filter((o) => o.id !== target.id && o.start < target.end && target.start < o.end);
}
