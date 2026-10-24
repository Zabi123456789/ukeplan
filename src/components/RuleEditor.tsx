import { CATEGORIES, CATEGORY_INFO, LOCATION_LABEL, LOCATIONS, type Category, type Location } from "@/lib/events";
import { RULE_KINDS, skipsWorkDays, WEEKDAY_LABEL, WEEKDAYS, type RuleInput, type RuleKind, type RuleParams, type Weekday } from "@/lib/rules";

const field =
  "rounded-md border border-line bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

const ALL_DAYS = [...WEEKDAYS];

/** Standardverdier når du bytter regeltype. */
const DEFAULTS: Record<RuleKind, RuleParams> = {
  DAILY_TIME: { kind: "DAILY_TIME", category: "SCHOOL", minutes: 120, days: ALL_DAYS, sessions: null, skipWorkDays: null },
  WEEKLY_TIME: { kind: "WEEKLY_TIME", category: "RELIGION", minMinutes: 180, maxMinutes: 240, sessions: null },
  LATEST_END: { kind: "LATEST_END", time: "19:00", days: ["MON", "TUE", "WED", "THU", "FRI"], location: "OUT", category: null },
  AWAKE_HOURS: { kind: "AWAKE_HOURS", days: ALL_DAYS, wake: "07:00", sleep: "23:00" },
  BLOCKED_TIME: { kind: "BLOCKED_TIME", days: ["FRI"], start: "18:00", end: "22:00", title: "Fri" },
  NOTE: { kind: "NOTE", text: "" },
};

export function newRule(): RuleInput {
  return { strength: "SOFT", enabled: true, sourceText: null, params: DEFAULTS.DAILY_TIME };
}

/** Skjema for én regel. Kontrollert: forelderen eier verdien. */
export function RuleEditor({ value, onChange }: { value: RuleInput; onChange: (v: RuleInput) => void }) {
  const p = value.params;
  const setParams = (next: Partial<RuleParams>) => onChange({ ...value, params: { ...p, ...next } as RuleParams });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className={field}
          aria-label="Regeltype"
          value={p.kind}
          onChange={(e) => onChange({ ...value, params: DEFAULTS[e.target.value as RuleKind] })}
        >
          {(Object.keys(RULE_KINDS) as RuleKind[]).map((k) => (
            <option key={k} value={k}>
              {RULE_KINDS[k]}
            </option>
          ))}
        </select>
        <StrengthToggle value={value.strength} onChange={(strength) => onChange({ ...value, strength })} />
      </div>

      {p.kind === "DAILY_TIME" && (
        <Row>
          <CategorySelect value={p.category} onChange={(category) => setParams({ category })} />
          <HoursInput label="timer per dag" minutes={p.minutes} onChange={(minutes) => setParams({ minutes })} />
          <SessionsInput value={p.sessions} onChange={(sessions) => setParams({ sessions })} />
          <DayPicker value={p.days} onChange={(days) => setParams({ days })} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-accent"
              checked={skipsWorkDays(p)}
              onChange={(e) => setParams({ skipWorkDays: e.target.checked })}
            />
            Ikke på jobbdager (minst 4 t jobb)
          </label>
        </Row>
      )}

      {p.kind === "WEEKLY_TIME" && (
        <Row>
          <CategorySelect value={p.category} onChange={(category) => setParams({ category })} />
          <HoursInput label="til" minutes={p.minMinutes} onChange={(minMinutes) => setParams({ minMinutes })} />
          <HoursInput
            label="timer i uka"
            minutes={p.maxMinutes ?? NaN}
            allowEmpty
            onChange={(m) => setParams({ maxMinutes: Number.isNaN(m) ? null : m })}
          />
          <SessionsInput value={p.sessions} onChange={(sessions) => setParams({ sessions })} />
        </Row>
      )}

      {p.kind === "LATEST_END" && (
        <Row>
          <span className="text-sm text-muted">Blokker</span>
          <select
            className={field}
            aria-label="Sted"
            value={p.location ?? ""}
            onChange={(e) => setParams({ location: (e.target.value || null) as Location | null })}
          >
            <option value="">alle steder</option>
            {LOCATIONS.map((l) => (
              <option key={l} value={l}>
                {LOCATION_LABEL[l].toLowerCase()}
              </option>
            ))}
          </select>
          <select
            className={field}
            aria-label="Kategori"
            value={p.category ?? ""}
            onChange={(e) => setParams({ category: (e.target.value || null) as Category | null })}
          >
            <option value="">alle kategorier</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_INFO[c].label}
              </option>
            ))}
          </select>
          <span className="text-sm text-muted">ferdig innen</span>
          <TimeInput value={p.time} onChange={(time) => setParams({ time })} />
          <DayPicker value={p.days} onChange={(days) => setParams({ days })} />
        </Row>
      )}

      {p.kind === "AWAKE_HOURS" && (
        <Row>
          <span className="text-sm text-muted">Våken fra</span>
          <TimeInput value={p.wake} onChange={(wake) => setParams({ wake })} />
          <span className="text-sm text-muted">til</span>
          <TimeInput value={p.sleep} onChange={(sleep) => setParams({ sleep })} />
          <DayPicker value={p.days} onChange={(days) => setParams({ days })} />
        </Row>
      )}

      {p.kind === "BLOCKED_TIME" && (
        <Row>
          <input className={field} aria-label="Hva" value={p.title} onChange={(e) => setParams({ title: e.target.value })} />
          <TimeInput value={p.start} onChange={(start) => setParams({ start })} />
          <span className="text-sm text-muted">–</span>
          <TimeInput value={p.end} onChange={(end) => setParams({ end })} />
          <DayPicker value={p.days} onChange={(days) => setParams({ days })} />
        </Row>
      )}

      {p.kind === "NOTE" && (
        <textarea
          className={`${field} w-full`}
          rows={2}
          aria-label="Ønske"
          value={p.text}
          onChange={(e) => setParams({ text: e.target.value })}
        />
      )}
    </div>
  );
}

export function StrengthToggle({ value, onChange }: { value: RuleInput["strength"]; onChange: (v: RuleInput["strength"]) => void }) {
  return (
    <div className="inline-flex rounded-md border border-line p-0.5 text-xs" role="radiogroup" aria-label="Styrke">
      {(
        [
          ["HARD", "Hard regel"],
          ["SOFT", "Myk (helst)"],
        ] as const
      ).map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`rounded px-2 py-1 ${value === v ? "bg-accent text-white" : "text-muted hover:text-foreground"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

function CategorySelect({ value, onChange }: { value: Category; onChange: (c: Category) => void }) {
  return (
    <select className={field} aria-label="Kategori" value={value} onChange={(e) => onChange(e.target.value as Category)}>
      {CATEGORIES.map((c) => (
        <option key={c} value={c}>
          {CATEGORY_INFO[c].label}
        </option>
      ))}
    </select>
  );
}

function HoursInput(props: { label: string; minutes: number; onChange: (m: number) => void; allowEmpty?: boolean }) {
  return (
    <label className="flex items-center gap-1.5 text-sm">
      <input
        type="number"
        min={0}
        step={0.5}
        className={`${field} w-20`}
        value={Number.isNaN(props.minutes) ? "" : props.minutes / 60}
        onChange={(e) => props.onChange(e.target.value === "" ? NaN : Math.round(Number(e.target.value) * 60))}
        placeholder={props.allowEmpty ? "maks" : undefined}
      />
      <span className="text-muted">{props.label}</span>
    </label>
  );
}

/** Antall økter tiden deles i. Tomt felt = planleggeren velger. */
function SessionsInput({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-sm">
      <span className="text-muted">fordelt på</span>
      <input
        type="number"
        min={1}
        max={14}
        className={`${field} w-16`}
        placeholder="auto"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Math.max(1, Math.round(Number(e.target.value))))}
      />
      <span className="text-muted">økter</span>
    </label>
  );
}

function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input type="time" className={field} value={value} onChange={(e) => e.target.value && onChange(e.target.value)} />;
}

function DayPicker({ value, onChange }: { value: Weekday[]; onChange: (d: Weekday[]) => void }) {
  const toggle = (d: Weekday) =>
    onChange(value.includes(d) ? value.filter((x) => x !== d) : WEEKDAYS.filter((w) => w === d || value.includes(w)));
  return (
    <div className="flex gap-1" role="group" aria-label="Dager">
      {WEEKDAYS.map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={value.includes(d)}
          onClick={() => toggle(d)}
          className={`w-9 rounded-md border py-1 text-xs capitalize ${
            value.includes(d) ? "border-accent bg-accent/15 text-foreground" : "border-line text-muted"
          }`}
        >
          {WEEKDAY_LABEL[d]}
        </button>
      ))}
    </div>
  );
}
