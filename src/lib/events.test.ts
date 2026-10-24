import { describe, expect, it } from "vitest";
import { createEventSchema, findOverlaps, overlapsWith, updateEventSchema } from "./events";

const block = (id: string, start: string, end: string) => ({
  id,
  start: new Date(`2026-10-26T${start}:00Z`),
  end: new Date(`2026-10-26T${end}:00Z`),
});

describe("findOverlaps", () => {
  it("finner blokker som overlapper", () => {
    const a = block("a", "09:00", "11:00");
    const b = block("b", "10:30", "12:00");
    const c = block("c", "13:00", "14:00");
    expect(findOverlaps([c, b, a]).map(([x, y]) => [x.id, y.id])).toEqual([["a", "b"]]);
  });

  it("regner ikke blokker som møtes i kanten som overlapp", () => {
    expect(findOverlaps([block("a", "09:00", "10:00"), block("b", "10:00", "11:00")])).toEqual([]);
  });

  it("finner en blokk som ligger helt inni en annen, også etter en kort blokk", () => {
    const long = block("long", "08:00", "12:00");
    const short = block("short", "08:30", "09:00");
    const inner = block("inner", "10:00", "10:30");
    const ids = findOverlaps([long, short, inner]).map(([x, y]) => `${x.id}-${y.id}`);
    expect(ids).toEqual(["long-short", "long-inner"]);
  });
});

describe("overlapsWith", () => {
  it("utelater blokken selv", () => {
    const a = block("a", "09:00", "11:00");
    const b = block("b", "10:00", "10:30");
    expect(overlapsWith(a, [a, b]).map((x) => x.id)).toEqual(["b"]);
  });
});

describe("skjemaer", () => {
  const valid = {
    title: "Lese",
    category: "SCHOOL",
    start: "2026-10-26T08:00:00.000Z",
    end: "2026-10-26T10:00:00.000Z",
  };

  it("fyller inn standardverdier for ny hendelse", () => {
    const parsed = createEventSchema.parse(valid);
    expect(parsed).toMatchObject({ locked: false, location: null, notes: null });
    expect(parsed.start).toBeInstanceOf(Date);
  });

  it("avviser slutt før start", () => {
    expect(createEventSchema.safeParse({ ...valid, end: valid.start }).success).toBe(false);
  });

  it("avviser ukjent kategori og tom tittel", () => {
    expect(createEventSchema.safeParse({ ...valid, category: "WORK" }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...valid, title: "  " }).success).toBe(false);
  });

  it("tillater delvis oppdatering", () => {
    expect(updateEventSchema.parse({ locked: true })).toEqual({ locked: true });
  });
});
