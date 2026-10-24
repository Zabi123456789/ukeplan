import { z } from "zod";
import { CATEGORIES, CATEGORY_INFO, LOCATION_LABEL, LOCATIONS } from "@/lib/events";

// Regler planleggeren skal følge. Delt mellom klient og server (ingen Prisma her).

export const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const WEEKDAY_LABEL: Record<Weekday, string> = {
  MON: "man",
  TUE: "tir",
  WED: "ons",
  THU: "tor",
  FRI: "fre",
  SAT: "lør",
  SUN: "søn",
};

export const STRENGTHS = ["HARD", "SOFT"] as const;
export type Strength = (typeof STRENGTHS)[number];

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Bruk formatet TT:MM");
const days = z.array(z.enum(WEEKDAYS)).min(1, "Velg minst én dag");
const minutes = z.number().int().min(0).max(24 * 60 * 7);
/** Ønsket antall økter (per dag eller per uke). null = planleggeren velger. */
const sessions = z.number().int().min(1).max(14).nullable().default(null);

/** Regeltypene. Bønnetider er ikke regler: de er faste blokker i kalenderen. */
export const ruleParamsSchema = z.discriminatedUnion("kind", [
  // «Studere 5 timer hver dag». Teller ikke bønneblokker.
  z.object({
    kind: z.literal("DAILY_TIME"),
    category: z.enum(CATEGORIES),
    minutes,
    days,
    sessions,
    // Gjelder ikke dager med minst 4 t jobb. null = automatisk: på for skole, av ellers.
    skipWorkDays: z.boolean().nullable().default(null),
  }),
  // «3–4 timer religion i uka» (i tillegg til bønnene)
  z.object({
    kind: z.literal("WEEKLY_TIME"),
    category: z.enum(CATEGORIES),
    minMinutes: minutes,
    maxMinutes: minutes.nullable(),
    sessions,
  }),
  // «Hjemme rundt kl. 19»: blokker (ute / i en kategori) skal være ferdige innen tidspunktet
  z.object({
    kind: z.literal("LATEST_END"),
    time: hhmm,
    days,
    location: z.enum(LOCATIONS).nullable(),
    category: z.enum(CATEGORIES).nullable(),
  }),
  // Våken fra–til. Leggetid før eller lik oppvåkning betyr etter midnatt.
  z.object({ kind: z.literal("AWAKE_HOURS"), days, wake: hhmm, sleep: hhmm }),
  // Ingen planlagte blokker i tidsrommet, f.eks. «fri fredag kveld»
  z.object({ kind: z.literal("BLOCKED_TIME"), days, start: hhmm, end: hhmm, title: z.string().min(1) }),
  // Ønske som ikke passer i typene over. Sendes til modellen, men sjekkes ikke i koden.
  z.object({ kind: z.literal("NOTE"), text: z.string().min(1) }),
]);
export type RuleParams = z.infer<typeof ruleParamsSchema>;
export type RuleKind = RuleParams["kind"];

export const RULE_KINDS: Record<RuleKind, string> = {
  DAILY_TIME: "Tid per dag",
  WEEKLY_TIME: "Tid per uke",
  LATEST_END: "Ferdig innen",
  AWAKE_HOURS: "Våkentid",
  BLOCKED_TIME: "Ikke planlegg",
  NOTE: "Annet ønske",
};

export const ruleInputSchema = z.object({
  strength: z.enum(STRENGTHS),
  enabled: z.boolean().default(true),
  sourceText: z.string().max(500).nullable().default(null),
  params: ruleParamsSchema,
});
export type RuleInput = z.infer<typeof ruleInputSchema>;
export type Rule = RuleInput & { id: string };

export const DEFAULT_RULES: RuleInput[] = [
  {
    strength: "SOFT",
    enabled: true,
    sourceText: "Standard våkentid på hverdager",
    params: { kind: "AWAKE_HOURS", days: ["MON", "TUE", "WED", "THU", "FRI"], wake: "07:00", sleep: "23:00" },
  },
  {
    strength: "SOFT",
    enabled: true,
    sourceText: "Standard våkentid i helgen",
    params: { kind: "AWAKE_HOURS", days: ["SAT", "SUN"], wake: "09:00", sleep: "00:00" },
  },
];

const num = (m: number) => {
  const h = m / 60;
  return Number.isInteger(h) ? `${h}` : h.toFixed(1).replace(".", ",");
};
const hours = (m: number) => `${num(m)} t`;
const inSessions = (n: number | null) => (n ? `, fordelt på ${n} ${n === 1 ? "økt" : "økter"}` : "");

export function describeDays(d: Weekday[]) {
  const set = new Set(d);
  if (set.size === 7) return "hver dag";
  if (set.size === 5 && !set.has("SAT") && !set.has("SUN")) return "hverdager";
  if (set.size === 2 && set.has("SAT") && set.has("SUN")) return "helg";
  return WEEKDAYS.filter((w) => set.has(w)).map((w) => WEEKDAY_LABEL[w]).join(", ");
}

/** Kort norsk beskrivelse, brukt både i grensesnittet og i prompten. */
export function describeRule(p: RuleParams): string {
  switch (p.kind) {
    case "DAILY_TIME":
      return `${CATEGORY_INFO[p.category].label}: ${hours(p.minutes)} per dag${inSessions(p.sessions)} (${describeDays(p.days)}${skipsWorkDays(p) ? ", ikke på jobbdager" : ""})`;
    case "WEEKLY_TIME":
      return `${CATEGORY_INFO[p.category].label}: ${p.maxMinutes ? `${num(p.minMinutes)}–${hours(p.maxMinutes)}` : `minst ${hours(p.minMinutes)}`} i uka${inSessions(p.sessions)}${p.category === "RELIGION" ? " i tillegg til bønnene" : ""}`;
    case "LATEST_END": {
      const what = [p.location && LOCATION_LABEL[p.location].toLowerCase(), p.category && CATEGORY_INFO[p.category].label.toLowerCase()]
        .filter(Boolean)
        .join(", ");
      return `Blokker${what ? ` (${what})` : ""} ferdig innen ${p.time} (${describeDays(p.days)})`;
    }
    case "AWAKE_HOURS":
      return `Våken ${p.wake}–${p.sleep} (${describeDays(p.days)})`;
    case "BLOCKED_TIME":
      return `Ikke planlegg ${p.start}–${p.end} (${describeDays(p.days)}): ${p.title}`;
    case "NOTE":
      return p.text;
  }
}

/** Om en dagsregel hoppes over på jobbdager (automatisk for skole). */
export function skipsWorkDays(p: { category: string; skipWorkDays: boolean | null }) {
  return p.skipWorkDays ?? p.category === "SCHOOL";
}

/** En jobbdag er en dag med minst så mange minutter jobb. */
export const WORKDAY_MINUTES = 240;

export const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
