import { useMemo, useState } from "react";
import { setPrayerSettings } from "@/lib/calendar";
import {
  computePrayerDay,
  HIGH_LATITUDE_INFO,
  HIGH_LATITUDE_RULES,
  METHOD_INFO,
  METHODS,
  PRAYER_LABEL,
  PRAYERS,
  prayerSettingsSchema,
  shiftDate,
  type PrayerSettings,
  todayIn,
} from "@/lib/prayer";
import { update, useData } from "@/lib/store";

const field =
  "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

export function PrayerSettingsForm() {
  const saved = useData().prayerSettings;
  const [today] = useState(() => todayIn(saved.timeZone));
  const [s, setS] = useState(saved);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const set = <K extends keyof PrayerSettings>(key: K, value: PrayerSettings[K]) => {
    setS((prev) => ({ ...prev, [key]: value }));
    setStatus(null);
  };
  const num = (v: string) => (v === "" ? NaN : Number(v));
  const angles = s.method === "CUSTOM" ? { fajr: s.fajrAngle, isha: s.ishaAngle, maghrib: s.maghribAngle } : METHOD_INFO[s.method];

  const valid = prayerSettingsSchema.safeParse(s);
  const changed = JSON.stringify(s) !== JSON.stringify(saved);

  function save() {
    if (!valid.success) return;
    const settings = valid.data;
    update((data) => setPrayerSettings(data, settings));
    setStatus({ kind: "ok", text: "Lagret. Kalenderen bruker de nye tidene." });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="space-y-6">
        <Section title="Beregningsmetode og vinkler">
          <select className={field} value={s.method} onChange={(e) => set("method", e.target.value as PrayerSettings["method"])}>
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {METHOD_INFO[m].label}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ["fajrAngle", "Fajr", angles.fajr],
                ["maghribAngle", "Maghrib", angles.maghrib],
                ["ishaAngle", "Isha", angles.isha],
              ] as const
            ).map(([key, label, value]) => (
              <label key={key} className="block space-y-1">
                <span className="text-xs text-muted">{label} (°)</span>
                <input
                  type="number"
                  step="0.1"
                  className={`${field} disabled:opacity-60`}
                  disabled={s.method !== "CUSTOM"}
                  value={Number.isNaN(value) ? "" : value}
                  onChange={(e) => set(key, num(e.target.value))}
                />
              </label>
            ))}
          </div>
          <p className="text-xs text-muted">
            Maghrib-vinkelen er når rødfargen i øst er borte (shia). 0° betyr ved solnedgang. Velg «Egne vinkler» for å endre dem.
          </p>
        </Section>

        <Section title="Asr">
          <div className="flex gap-4 text-sm">
            {(
              [
                ["STANDARD", "Standard (skygge = 1×)"],
                ["HANAFI", "Hanafi (skygge = 2×)"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input type="radio" className="accent-accent" checked={s.asrMethod === value} onChange={() => set("asrMethod", value)} />
                {label}
              </label>
            ))}
          </div>
        </Section>

        <Section title="Lyse netter (høye breddegrader)">
          <div className="space-y-2">
            {HIGH_LATITUDE_RULES.map((r) => (
              <label key={r} className="flex gap-2 text-sm">
                <input
                  type="radio"
                  className="mt-1 accent-accent"
                  checked={s.highLatitudeRule === r}
                  onChange={() => set("highLatitudeRule", r)}
                />
                <span>
                  {HIGH_LATITUDE_INFO[r].label}
                  <span className="block text-xs text-muted">{HIGH_LATITUDE_INFO[r].help}</span>
                </span>
              </label>
            ))}
          </div>
        </Section>

        <Section title="Bønneblokker i kalenderen">
          <Check label="Be Dhuhr og Asr sammen (ved Dhuhr)" checked={s.combineDhuhrAsr} onChange={(v) => set("combineDhuhrAsr", v)} />
          <Check label="Be Maghrib og Isha sammen (ved Maghrib)" checked={s.combineMaghribIsha} onChange={(v) => set("combineMaghribIsha", v)} />
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Én bønn (min)" value={s.singleMinutes} onChange={(v) => set("singleMinutes", v)} />
            <NumberField label="To sammen (min)" value={s.combinedMinutes} onChange={(v) => set("combinedMinutes", v)} />
          </div>
        </Section>

        <Section title="Justering i minutter">
          <p className="text-xs text-muted">Brukes for å treffe tabellen til moskeen eller senteret ditt, f.eks. +2 på Maghrib.</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {PRAYERS.map((p) => (
              <NumberField
                key={p}
                label={PRAYER_LABEL[p]}
                value={s.adjustments[p]}
                onChange={(v) => set("adjustments", { ...s.adjustments, [p]: v })}
              />
            ))}
          </div>
        </Section>

        <Section title="Sted">
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Breddegrad" step="0.0001" value={s.latitude} onChange={(v) => set("latitude", v)} />
            <NumberField label="Lengdegrad" step="0.0001" value={s.longitude} onChange={(v) => set("longitude", v)} />
          </div>
          <p className="text-xs text-muted">Standard er Oslo sentrum (59,9139, 10,7522).</p>
        </Section>

        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={!valid.success || !changed}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            Lagre
          </button>
          {changed && (
            <button onClick={() => setS(saved)} className="rounded-md px-3 py-2 text-sm hover:bg-hover">
              Angre endringer
            </button>
          )}
          {!valid.success && <span className="text-sm text-red-700 dark:text-red-300">Sjekk feltene: {valid.error.issues[0]?.path.join(".")}</span>}
          {status && (
            <span role="status" className={`text-sm ${status.kind === "ok" ? "text-accent" : "text-red-700 dark:text-red-300"}`}>
              {status.text}
            </span>
          )}
        </div>
      </div>

      <Preview settings={valid.success ? valid.data : null} today={today} />
    </div>
  );
}

/** Tidene med innstillingene slik de står i skjemaet, før de lagres. Uten manuelle tider. */
function Preview({ settings, today }: { settings: PrayerSettings | null; today: string }) {
  const year = today.slice(0, 4);
  const rows = useMemo(() => {
    if (!settings) return [];
    const week = Array.from({ length: 7 }, (_, i) => shiftDate(today, i));
    const seasons = [`${year}-12-21`, `${year}-03-20`, `${year}-06-21`];
    return [...week, ...seasons].map((date) => computePrayerDay(date, settings));
  }, [settings, today, year]);

  const hhmm = (d: Date) =>
    d.toLocaleTimeString("nb-NO", { timeZone: settings?.timeZone, hour: "2-digit", minute: "2-digit" });
  const label = (date: string) =>
    new Date(`${date}T12:00:00`).toLocaleDateString("nb-NO", { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="h-fit space-y-2 rounded-xl border border-line bg-surface p-4 lg:sticky lg:top-6">
      <h2 className="font-semibold">Forhåndsvisning</h2>
      {!settings ? (
        <p className="text-sm text-muted">Rett opp feltene for å se tidene.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1 pr-2 font-normal">Dato</th>
                {PRAYERS.map((p) => (
                  <th key={p} className="px-1 py-1 font-normal">
                    {PRAYER_LABEL[p]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((day, i) => (
                <tr key={day.date} className={`border-t border-line ${i === 7 ? "border-t-2" : ""}`}>
                  <td className="py-1.5 pr-2 capitalize text-muted">{label(day.date)}</td>
                  {PRAYERS.map((p) => (
                    <td key={p} className="px-1 py-1.5">
                      {hhmm(day.times[p])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">De tre nederste radene viser vinter, vår og midtsommer, så du ser hvordan de lyse nettene påvirker tidene.</p>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="size-4 accent-accent" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function NumberField(props: { label: string; value: number; onChange: (v: number) => void; step?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted">{props.label}</span>
      <input
        type="number"
        step={props.step ?? "1"}
        className="w-full rounded-md border border-line bg-surface px-2 py-2 text-sm outline-none focus:border-accent"
        value={Number.isNaN(props.value) ? "" : props.value}
        onChange={(e) => props.onChange(e.target.value === "" ? NaN : Number(e.target.value))}
      />
    </label>
  );
}
