import type { Change } from "@/lib/replan";

export type ChangeSet = { title: string; changes: Change[] };

const span = (i: { start: Date; end: Date }) => {
  const day = i.start.toLocaleDateString("nb-NO", { weekday: "short" });
  const t = (d: Date) => d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${t(i.start)}–${t(i.end)}`;
};
const minutes = (i: { start: Date; end: Date }) => (i.end.getTime() - i.start.getTime()) / 60_000;

export function describeChange(c: Change) {
  if (c.kind === "moved") {
    const shorter = minutes(c.to) < minutes(c.from) ? ` (kortet ned til ${minutes(c.to)} min)` : "";
    return `«${c.title}» flyttet fra ${span(c.from)} til ${span(c.to)}${shorter}`;
  }
  return c.reason === "covered"
    ? `«${c.title}» ${span(c.from)} fjernet: tiden er allerede dekket`
    : `«${c.title}» ${span(c.from)} fjernet: fant ikke ledig tid`;
}

/** Hva som ble justert etter at du la inn eller flyttet noe, med angre. */
export function ChangeLog({ set, onUndo, onClose }: { set: ChangeSet; onUndo: () => void; onClose: () => void }) {
  return (
    <div role="status" className="space-y-2 rounded-md border border-accent/50 bg-accent/10 px-3 py-2 text-sm">
      <div className="flex items-center gap-3">
        <p className="flex-1 font-medium">
          {set.title}. {set.changes.length === 1 ? "1 planlagt blokk ble justert:" : `${set.changes.length} planlagte blokker ble justert:`}
        </p>
        <button onClick={onUndo} className="rounded-md border border-line bg-surface px-2 py-1 text-xs hover:bg-hover">
          Angre
        </button>
        <button onClick={onClose} aria-label="Lukk" className="opacity-60 hover:opacity-100">
          ✕
        </button>
      </div>
      <ul className="space-y-0.5 text-xs">
        {set.changes.map((c) => (
          <li key={c.id}>{describeChange(c)}</li>
        ))}
      </ul>
    </div>
  );
}
