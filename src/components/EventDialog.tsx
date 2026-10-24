import { format } from "date-fns";
import { useState } from "react";
import {
  CATEGORIES,
  CATEGORY_INFO,
  LOCATION_LABEL,
  LOCATIONS,
  type Category,
  type Location,
} from "@/lib/events";

export type EventDraft = {
  id?: string;
  title: string;
  category: Category;
  start: Date;
  end: Date;
  locked: boolean;
  location: Location | null;
  notes: string | null;
  /** Bare for nye blokker: antall uker blokken legges inn (1 = bare denne gangen). */
  repeatWeeks?: number;
};

type Props = {
  draft: EventDraft;
  onSave: (draft: EventDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
};

const toInput = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");

const field =
  "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

export function EventDialog({ draft, onSave, onDelete, onClose }: Props) {
  const [form, setForm] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNew = !draft.id;

  const set = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return setError("Gi blokken en tittel");
    if (form.end <= form.start) return setError("Slutt må være etter start");
    run(() => onSave(form));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-4 rounded-xl border border-line bg-surface p-5 shadow-xl"
        role="dialog"
        aria-label={isNew ? "Ny blokk" : "Rediger blokk"}
      >
        <h2 className="text-lg font-semibold">{isNew ? "Ny blokk" : "Rediger blokk"}</h2>

        <label className="block space-y-1">
          <span className="text-sm text-muted">Tittel</span>
          <input
            autoFocus
            className={field}
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="F.eks. Lese statistikk"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-sm text-muted">Kategori</span>
            <select
              className={field}
              value={form.category}
              onChange={(e) => set("category", e.target.value as Category)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_INFO[c].label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted">Sted</span>
            <select
              className={field}
              value={form.location ?? ""}
              onChange={(e) => set("location", (e.target.value || null) as Location | null)}
            >
              <option value="">Ikke satt</option>
              {LOCATIONS.map((l) => (
                <option key={l} value={l}>
                  {LOCATION_LABEL[l]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-sm text-muted">Start</span>
            <input
              type="datetime-local"
              className={field}
              value={toInput(form.start)}
              onChange={(e) => e.target.value && set("start", new Date(e.target.value))}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted">Slutt</span>
            <input
              type="datetime-local"
              className={field}
              value={toInput(form.end)}
              onChange={(e) => e.target.value && set("end", new Date(e.target.value))}
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-sm text-muted">Notater</span>
          <textarea
            className={field}
            rows={2}
            value={form.notes ?? ""}
            onChange={(e) => set("notes", e.target.value || null)}
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-accent"
            checked={form.locked}
            onChange={(e) => set("locked", e.target.checked)}
          />
          Lås blokken (planleggeren flytter den aldri)
        </label>

        {isNew && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-accent"
                checked={(form.repeatWeeks ?? 1) > 1}
                onChange={(e) => set("repeatWeeks", e.target.checked ? 8 : 1)}
              />
              Gjenta hver uke
            </label>
            {(form.repeatWeeks ?? 1) > 1 && (
              <label className="flex items-center gap-1.5 text-muted">
                i
                <input
                  type="number"
                  min={2}
                  max={52}
                  aria-label="Antall uker"
                  className="w-16 rounded-md border border-line bg-surface px-2 py-1 text-foreground"
                  value={form.repeatWeeks}
                  onChange={(e) => set("repeatWeeks", Math.min(52, Math.max(2, Number(e.target.value) || 2)))}
                />
                uker (f.eks. faste jobbvakter)
              </label>
            )}
          </div>
        )}

        {error && <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}

        <div className="flex items-center gap-2 pt-1">
          {onDelete && (
            <button
              type="button"
              disabled={busy || draft.locked}
              title={draft.locked ? "Lås opp blokken og lagre før du sletter den" : undefined}
              onClick={() => run(onDelete)}
              className="rounded-md px-3 py-2 text-sm text-red-700 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-300"
            >
              Slett
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-sm hover:bg-hover">
              Avbryt
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Lagre
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
