import { useState } from "react";
import { planWeek } from "@/lib/planner";
import { update, useData } from "@/lib/store";
import { weekRange } from "@/lib/week";

const dateLabel = (monday: string) => new Date(`${monday}T12:00:00`).toLocaleDateString("nb-NO", { day: "numeric", month: "long" });

/** Knapp og rapport for planlegging av uka som vises i kalenderen. */
export function PlanPanel({ monday }: { monday: string }) {
  const data = useData();
  const report = data.plans[monday] ?? null;
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const { from, to } = weekRange(monday);
  const planned = data.events.filter((e) => e.source === "AI" && !e.locked && new Date(e.start) >= from && new Date(e.start) < to);

  function plan() {
    setError(null);
    try {
      update((d) => planWeek(d, monday).data);
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function clear() {
    const ids = new Set(planned.map((e) => e.id));
    update((d) => {
      const plans = { ...d.plans };
      delete plans[monday];
      return { ...d, events: d.events.filter((e) => !ids.has(e.id)), plans };
    });
  }

  const problems = (report?.errors.length ?? 0) + (report?.warnings.length ?? 0);

  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={plan} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          Planlegg uka
        </button>
        {planned.length > 0 && (
          <button onClick={clear} className="rounded-md px-3 py-2 text-sm text-muted hover:bg-hover hover:text-foreground">
            Fjern {planned.length} planlagte blokker
          </button>
        )}
        <p className="min-w-60 flex-1 text-xs text-muted">
          Uka fra {dateLabel(monday)}, fra nå og ut uka. Bønner, låste blokker og det du har lagt inn selv blir stående.{" "}
          <a href="#regler" className="text-accent hover:underline">
            Reglene
          </a>{" "}
          bestemmer hva som planlegges.
        </p>
      </div>

      {error && <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">{error}</p>}

      {report && (
        <div className="space-y-1 text-sm" role="status">
          <p>
            {report.summary}
            {report.replaced > 0 && ` Erstattet ${report.replaced} tidligere planlagte blokker.`}
          </p>
          {problems > 0 && (
            <div>
              <button onClick={() => setOpen(!open)} className="text-xs text-accent hover:underline">
                {open ? "Skjul" : "Vis"}{" "}
                {[
                  report.errors.length && `${report.errors.length} harde regler som ikke kunne oppfylles`,
                  report.warnings.length && `${report.warnings.length} ønsker som ikke ble helt oppfylt`,
                ]
                  .filter(Boolean)
                  .join(" og ")}
              </button>
              {open && (
                <ul className="mt-1 space-y-1 text-xs">
                  {report.errors.map((f, i) => (
                    <li key={`e${i}`} className="text-red-800 dark:text-red-200">
                      ✕ {f.message}
                    </li>
                  ))}
                  {report.warnings.map((f, i) => (
                    <li key={`w${i}`} className="text-amber-900 dark:text-amber-100">
                      ! {f.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
