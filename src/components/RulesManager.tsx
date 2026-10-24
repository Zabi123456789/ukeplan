import { useState } from "react";
import { ProgressionCard } from "@/components/ProgressionCard";
import { newRule, RuleEditor } from "@/components/RuleEditor";
import { addRules, deleteRule, updateRule } from "@/lib/calendar";
import { describeRule, ruleInputSchema, WEEKDAYS, type RuleInput } from "@/lib/rules";
import { update, useData } from "@/lib/store";

const EVERY_DAY = [...WEEKDAYS];
const WEEKDAYS_ONLY = WEEKDAYS.filter((d) => d !== "SAT" && d !== "SUN");

/** Forslag basert på de fire kategoriene. Brukeren legger dem til og justerer. */
const SUGGESTIONS: RuleInput[] = [
  { strength: "SOFT", enabled: true, sourceText: "Studere 4 timer hver dag, helst i to økter", params: { kind: "DAILY_TIME", category: "SCHOOL", minutes: 240, days: EVERY_DAY, sessions: 2 } },
  { strength: "SOFT", enabled: true, sourceText: "3–4 timer religion", params: { kind: "WEEKLY_TIME", category: "RELIGION", minMinutes: 180, maxMinutes: 240, sessions: null } },
  { strength: "SOFT", enabled: true, sourceText: "Trene 4 ganger i uka, 2 timer hver gang", params: { kind: "WEEKLY_TIME", category: "TRAINING", minMinutes: 480, maxMinutes: null, sessions: 4 } },
  { strength: "SOFT", enabled: true, sourceText: "Være hjemme rundt kl. 19 de fleste dager", params: { kind: "LATEST_END", time: "19:00", days: WEEKDAYS_ONLY, location: "OUT", category: null } },
  { strength: "SOFT", enabled: true, sourceText: "Tid med familie og venner hver dag", params: { kind: "DAILY_TIME", category: "SOCIAL", minutes: 90, days: EVERY_DAY, sessions: null } },
  { strength: "SOFT", enabled: true, sourceText: "Litt alenetid hver kveld", params: { kind: "DAILY_TIME", category: "ALONE", minutes: 60, days: EVERY_DAY, sessions: null } },
];

const sameParams = (a: RuleInput, b: RuleInput) => JSON.stringify(a.params) === JSON.stringify(b.params);

export function RulesManager() {
  const { rules } = useData();
  const [editing, setEditing] = useState<{ id: string | null; value: RuleInput } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const suggestions = SUGGESTIONS.filter((s) => !rules.some((r) => sameParams(r, s)));
  const editingValid = editing ? ruleInputSchema.safeParse(editing.value).success : false;

  function run(fn: Parameters<typeof update>[0]) {
    setError(null);
    try {
      update(fn);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function saveEditing() {
    if (!editing) return;
    const { id, value } = editing;
    run((d) => (id ? updateRule(d, id, value) : addRules(d, [value])));
    setEditing(null);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="h-fit space-y-6">
        <ProgressionCard />
        <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
          <h2 className="font-semibold">Forslag</h2>
          <p className="text-sm text-muted">Legg til det som passer, og juster tallene etterpå. Bønnetidene er alltid faste og trenger ingen regel. Jobbvakter legger du inn i kalenderen med «+ Ny blokk» (kategori Jobb), og kan gjenta dem hver uke.</p>
          {suggestions.length === 0 ? (
            <p className="text-sm text-muted">Du har lagt til alle forslagene.</p>
          ) : (
            <>
              <ul className="divide-y divide-line rounded-md border border-line">
                {suggestions.map((s) => (
                  <li key={s.sourceText} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{describeRule(s.params)}</p>
                      <p className="text-xs text-muted">«{s.sourceText}»</p>
                    </div>
                    <button onClick={() => run((d) => addRules(d, [s]))} className="shrink-0 text-sm text-accent hover:underline">
                      Legg til
                    </button>
                  </li>
                ))}
              </ul>
              {suggestions.length > 1 && (
                <button
                  onClick={() => run((d) => addRules(d, suggestions))}
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Legg til alle ({suggestions.length})
                </button>
              )}
            </>
          )}
        </section>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Reglene dine</h2>
          <button onClick={() => setEditing({ id: null, value: newRule() })} className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-hover">
            Ny regel
          </button>
        </div>
        <p className="text-xs text-muted">
          <strong>Harde regler</strong> planlegges først og brytes aldri for plasseringer (tidsfrister, sperret tid). <strong>Myke regler</strong> prøver
          planleggeren å følge, og det som ikke får plass vises etter planleggingen.
        </p>
        {error && <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">{error}</p>}

        {editing?.id === null && (
          <EditCard value={editing.value} valid={editingValid} onChange={(value) => setEditing({ id: null, value })} onSave={saveEditing} onCancel={() => setEditing(null)} />
        )}

        {rules.length === 0 && <p className="text-sm text-muted">Ingen regler ennå. Legg til forslag eller lag en ny regel.</p>}
        {rules.map((r) =>
          editing?.id === r.id ? (
            <EditCard key={r.id} value={editing.value} valid={editingValid} onChange={(value) => setEditing({ id: r.id, value })} onSave={saveEditing} onCancel={() => setEditing(null)} />
          ) : (
            <div key={r.id} className={`flex items-start gap-3 rounded-lg border border-line bg-surface p-3 ${r.enabled ? "" : "opacity-50"}`}>
              <input
                type="checkbox"
                className="mt-1 size-4 accent-accent"
                aria-label="Aktiv"
                title={r.enabled ? "Aktiv" : "Slått av"}
                checked={r.enabled}
                onChange={(e) => run((d) => updateRule(d, r.id, { ...r, enabled: e.target.checked }))}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm">{describeRule(r.params)}</p>
                <p className="mt-0.5 text-xs text-muted">
                  <span className={r.strength === "HARD" ? "font-medium text-foreground" : ""}>{r.strength === "HARD" ? "Hard regel" : "Myk"}</span>
                  {r.sourceText && ` · «${r.sourceText}»`}
                </p>
              </div>
              <button onClick={() => setEditing({ id: r.id, value: r })} className="text-xs text-accent hover:underline">
                Endre
              </button>
              <button onClick={() => run((d) => deleteRule(d, r.id))} className="text-xs text-red-700 hover:underline dark:text-red-300">
                Slett
              </button>
            </div>
          ),
        )}
      </section>
    </div>
  );
}

function EditCard(props: { value: RuleInput; valid: boolean; onChange: (v: RuleInput) => void; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="space-y-3 rounded-lg border border-accent bg-surface p-3">
      <RuleEditor value={props.value} onChange={props.onChange} />
      <div className="flex gap-2">
        <button
          onClick={props.onSave}
          disabled={!props.valid}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          Lagre
        </button>
        <button onClick={props.onCancel} className="rounded-md px-3 py-1.5 text-sm hover:bg-hover">
          Avbryt
        </button>
      </div>
    </div>
  );
}
