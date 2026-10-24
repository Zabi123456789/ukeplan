import { calendarBetween } from "@/lib/calendar";
import { dailyRuleApplies } from "@/lib/plan-validate";
import { CATEGORIES, CATEGORY_INFO, type Category } from "@/lib/events";
import { percentFor, scaleRules } from "@/lib/progression";
import { useData } from "@/lib/store";
import { weekDates, weekRange } from "@/lib/week";

const hours = (m: number) => `${(Math.round(m / 6) / 10).toString().replace(".", ",")} t`;

/** Timer per kategori denne uka, mot målene i reglene. Fungerer også som fargeforklaring. */
export function WeekSummary({ monday }: { monday: string }) {
  const data = useData();
  const { from, to } = weekRange(monday);
  const events = calendarBetween(data, from, to).filter((e) => e.source !== "PRAYER");
  const blocks = events.map((e) => ({ ...e, start: new Date(e.start), end: new Date(e.end) }));
  const rules = scaleRules(data.rules.filter((r) => r.enabled), percentFor(data.progression, monday));

  const goal = (c: Category) => {
    let total = 0;
    for (const r of rules) {
      const p = r.params;
      if (p.kind === "DAILY_TIME" && p.category === c) total += p.minutes * weekDates(monday).filter((d) => dailyRuleApplies(p, d, blocks)).length;
      if (p.kind === "WEEKLY_TIME" && p.category === c) total += p.minMinutes;
    }
    return total;
  };
  const used = (c: Category) =>
    events.filter((e) => e.category === c).reduce((s, e) => s + (Date.parse(e.end) - Date.parse(e.start)) / 60_000, 0);

  return (
    <ul className="flex flex-wrap gap-2" aria-label="Timer denne uka">
      {CATEGORIES.map((c) => {
        const g = goal(c);
        const u = used(c);
        const done = g > 0 && u >= g - 15;
        return (
          <li key={c} className="flex items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1 text-xs">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: CATEGORY_INFO[c].color }} />
            <span>{CATEGORY_INFO[c].label}</span>
            <span className={`tabular-nums ${done ? "text-accent" : "text-muted"}`}>
              {hours(u)}
              {g > 0 && ` / ${hours(g)}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
