import { setProgression } from "@/lib/calendar";
import { percentFor, progressionSchema, progressionWeek, scaleRules, weeksToFull, type Progression } from "@/lib/progression";
import { describeRule } from "@/lib/rules";
import { update, useData } from "@/lib/store";
import { addDays, localParts, mondayOf } from "@/lib/week";

const field = "w-16 rounded-md border border-line bg-surface px-2 py-1 text-sm outline-none focus:border-accent";

/** Innstilling for opptrapping: lavere tidsmål i starten, litt mer hver uke. */
export function ProgressionCard() {
  const { progression: p, rules } = useData();
  const thisMonday = mondayOf(localParts(new Date()).date);
  const week = progressionWeek(p, thisMonday);
  const percent = percentFor(p, thisMonday);
  const full = weeksToFull(p);

  const set = (changes: Partial<Progression>) => {
    const next = progressionSchema.safeParse({ ...p, ...changes });
    if (next.success) update((d) => setProgression(d, next.data));
  };

  const example = rules.find((r) => r.enabled && (r.params.kind === "DAILY_TIME" || r.params.kind === "WEEKLY_TIME"));
  const weeks = Array.from({ length: Math.min(full ?? 8, 10) }, (_, i) => i + 1);

  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Opptrapping</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-accent" checked={p.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          På
        </label>
      </div>
      <p className="text-sm text-muted">
        Bygg disiplin gradvis: tidsmålene starter lavere og øker litt for hver uke. Gjelder tid per dag og tid per uke, ikke våkentid eller frister.
      </p>

      {p.enabled && (
        <>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
            <span>Start på</span>
            <input
              type="number"
              min={10}
              max={100}
              step={5}
              className={field}
              aria-label="Startprosent"
              value={p.startPercent}
              onChange={(e) => set({ startPercent: Number(e.target.value) })}
            />
            <span>% og øk med</span>
            <input
              type="number"
              min={0}
              max={50}
              step={5}
              className={field}
              aria-label="Økning per uke"
              value={p.stepPercent}
              onChange={(e) => set({ stepPercent: Number(e.target.value) })}
            />
            <span>prosentpoeng per uke.</span>
          </div>
          <label className="flex flex-wrap items-center gap-2 text-sm">
            Første uke er uka som starter
            <input
              type="date"
              className="rounded-md border border-line bg-surface px-2 py-1 text-sm"
              value={p.startMonday}
              onChange={(e) => e.target.value && set({ startMonday: mondayOf(e.target.value) })}
            />
          </label>

          <div className="flex flex-wrap gap-1.5" aria-label="Prosent per uke">
            {weeks.map((w) => {
              const monday = addDays(p.startMonday, (w - 1) * 7);
              return (
                <span
                  key={w}
                  className={`rounded-md border px-2 py-1 text-xs ${w === week ? "border-accent bg-accent/15 font-medium" : "border-line text-muted"}`}
                >
                  Uke {w}: {percentFor(p, monday)} %
                </span>
              );
            })}
          </div>

          <p className="text-sm">
            Denne uka er uke {week}: <strong>{percent} %</strong> av målene
            {full ? `. Fullt nivå fra uke ${full}.` : ". Økningen er satt til 0, så nivået blir stående."}
          </p>
          {example && percent < 100 && (
            <p className="text-xs text-muted">
              Eksempel: «{describeRule(example.params)}» blir «{describeRule(scaleRules([example], percent)[0].params)}» denne uka.
            </p>
          )}
        </>
      )}
    </section>
  );
}
