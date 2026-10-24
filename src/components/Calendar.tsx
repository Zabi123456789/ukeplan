import type {
  DatesSetArg,
  DateSelectArg,
  EventChangeArg,
  EventClickArg,
  EventContentArg,
  EventSourceFuncArg,
} from "@fullcalendar/core";
import nbLocale from "@fullcalendar/core/locales/nb";
import interactionPlugin from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import { useEffect, useRef, useState } from "react";
import { ChangeLog, type ChangeSet } from "@/components/ChangeLog";
import { EventDialog, type EventDraft } from "@/components/EventDialog";
import { PlanPanel } from "@/components/PlanPanel";
import { PrayerDialog } from "@/components/PrayerDialog";
import { WeekSummary } from "@/components/WeekSummary";
import { calendarBetween, createEvent, deleteEvent, updateEvent, type AppData } from "@/lib/calendar";
import { CATEGORY_INFO, type CalendarEvent } from "@/lib/events";
import { adjustAround, type Change } from "@/lib/replan";
import { getData, update, useData } from "@/lib/store";
import { localParts, mondayOf } from "@/lib/week";

type Notice = { kind: "error" | "warning"; text: string };

function conflictNotice(conflicts: CalendarEvent[]): Notice | null {
  if (conflicts.length === 0) return null;
  const names = conflicts.map((c) => `«${c.title}»`).join(", ");
  return { kind: "warning", text: `Overlapper med ${names}.` };
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Stabil hendelseskilde. Et promise gjør at hendelsene leveres etter opptegningen (React advarer ellers). */
async function loadEvents(info: EventSourceFuncArg) {
  // I månedsvisning (over en uke) tas bønnene ut, så det blir plass til det du har planlagt
  const month = info.end.getTime() - info.start.getTime() > 8 * 86_400_000;
  return calendarBetween(getData(), info.start, info.end)
    .filter((e) => !month || e.source !== "PRAYER")
    .map((e) => ({
    id: e.id,
    title: e.title,
    start: e.start,
    end: e.end,
    backgroundColor: CATEGORY_INFO[e.category].color,
    borderColor: CATEGORY_INFO[e.category].color,
    editable: !e.locked,
    classNames: [e.source === "PRAYER" ? "is-prayer" : e.locked ? "is-locked" : "", e.source === "AI" ? "is-ai" : ""].filter(Boolean),
    extendedProps: e,
  }));
}

/** Uka planpanelet og oppsummeringen gjelder. I månedsvisning: denne uka hvis den er i måneden, ellers første uke. */
function weekShown(arg: DatesSetArg) {
  if (arg.view.type !== "dayGridMonth") return mondayOf(localParts(arg.start).date);
  const today = new Date();
  const inMonth = today >= arg.view.currentStart && today < arg.view.currentEnd;
  return mondayOf(localParts(inMonth ? today : arg.view.currentStart).date);
}

export function Calendar() {
  const calendarRef = useRef<FullCalendar>(null);
  const data = useData();
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [prayerDate, setPrayerDate] = useState<string | null>(null);
  const [monday, setMonday] = useState<string | null>(null);
  const [changeSet, setChangeSet] = useState<(ChangeSet & { undo: AppData }) | null>(null);

  // Tegn kalenderen på nytt når dataene endres (også fra en annen fane)
  useEffect(() => {
    calendarRef.current?.getApi().refetchEvents();
  }, [data]);

  function openDraft(start: Date, end: Date) {
    setDraft({ title: "", category: "OTHER", start, end, locked: false, location: null, notes: null });
  }

  function onSelect(info: DateSelectArg) {
    info.view.calendar.unselect();
    openDraft(info.start, info.end);
  }

  /** «Ny blokk»: neste hele time hvis du ser på uka du er i, ellers kl. 09 første dag i visningen. */
  function newBlock() {
    const view = calendarRef.current?.getApi().view;
    const now = new Date();
    let start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1);
    if (view && (start < view.activeStart || start >= view.activeEnd)) {
      start = new Date(view.activeStart.getFullYear(), view.activeStart.getMonth(), view.activeStart.getDate(), 9);
    }
    openDraft(start, new Date(start.getTime() + 60 * 60_000));
  }

  function onEventClick(info: EventClickArg) {
    const e = info.event.extendedProps as CalendarEvent;
    // Bønneblokker har id-en "prayer:YYYY-MM-DD:FAJR"
    if (e.source === "PRAYER") return setPrayerDate(e.id.split(":")[1]);
    setDraft({ ...e, start: new Date(e.start), end: new Date(e.end) });
  }

  /** Lagrer endringen og flytter planlagte blokker som kolliderer med den. */
  function commit(before: AppData, result: { data: AppData; event: CalendarEvent; conflicts: CalendarEvent[] }, verb: string) {
    const adjusted = adjustAround(result.data, result.event.id);
    update(() => adjusted.data);
    const handled = new Set(adjusted.changes.map((c) => c.id));
    setNotice(conflictNotice(result.conflicts.filter((c) => !handled.has(c.id))));
    setChangeSet(adjusted.changes.length ? { title: `${verb} «${result.event.title}»`, changes: adjusted.changes, undo: before } : null);
  }

  /** Legger inn samme blokk hver uke i flere uker, og justerer rundt hver av dem. */
  function commitRepeated(before: AppData, input: Record<string, unknown>, start: Date, end: Date, weeks: number) {
    const shift = (d: Date, i: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * i, d.getHours(), d.getMinutes());
    let data = before;
    const changes: Change[] = [];
    let title = "";
    for (let i = 0; i < weeks; i++) {
      const created = createEvent(data, { ...input, start: shift(start, i).toISOString(), end: shift(end, i).toISOString() });
      const adjusted = adjustAround(created.data, created.event.id);
      data = adjusted.data;
      changes.push(...adjusted.changes);
      title = created.event.title;
    }
    update(() => data);
    setNotice(null);
    setChangeSet(changes.length ? { title: `La til «${title}» hver uke i ${weeks} uker`, changes, undo: before } : null);
  }

  function undo() {
    if (!changeSet) return;
    const previous = changeSet.undo;
    update(() => previous);
    setChangeSet(null);
    setNotice(null);
  }

  function onEventChange(info: EventChangeArg) {
    try {
      const before = getData();
      const changes = { start: info.event.start?.toISOString(), end: info.event.end?.toISOString() };
      commit(before, updateEvent(before, info.event.id, changes), "Flyttet");
    } catch (err) {
      info.revert();
      setNotice({ kind: "error", text: errorText(err) });
    }
  }

  async function save(d: EventDraft) {
    const input = {
      title: d.title,
      category: d.category,
      start: d.start.toISOString(),
      end: d.end.toISOString(),
      locked: d.locked,
      location: d.location,
      notes: d.notes,
    };
    const before = getData();
    if (!d.id && (d.repeatWeeks ?? 1) > 1) commitRepeated(before, input, d.start, d.end, d.repeatWeeks!);
    else commit(before, d.id ? updateEvent(before, d.id, input) : createEvent(before, input), d.id ? "Endret" : "La til");
    setDraft(null);
  }

  async function remove(id: string) {
    update((current) => deleteEvent(current, id));
    setDraft(null);
    setNotice(null);
    setChangeSet(null);
  }

  return (
    <div className="space-y-3">
      {monday && <PlanPanel monday={monday} />}

      <div className="flex flex-wrap items-start gap-3">
        <button onClick={newBlock} className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
          + Ny blokk
        </button>
        {monday && <WeekSummary monday={monday} />}
      </div>
      <p className="text-xs text-muted">
        Timer denne uka mot målene dine. Dra i en ledig del av kalenderen for å lage en blokk, og klikk på en blokk eller bønn for å
        redigere.
      </p>

      {changeSet && <ChangeLog set={changeSet} onUndo={undo} onClose={() => setChangeSet(null)} />}

      {notice && (
        <div
          role="status"
          className={`flex items-start gap-3 rounded-md px-3 py-2 text-sm ${
            notice.kind === "error"
              ? "bg-red-500/10 text-red-800 dark:text-red-200"
              : "bg-amber-500/15 text-amber-900 dark:text-amber-100"
          }`}
        >
          <span className="flex-1">{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Lukk" className="opacity-60 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      <div className="calendar-shell rounded-xl border border-line bg-surface p-2 sm:p-3">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          locale={nbLocale}
          initialView={window.innerWidth < 640 ? "timeGridDay" : "timeGridWeek"}
          headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }}
          buttonText={{ today: "I dag", month: "Måned", week: "Uke", day: "Dag" }}
          // Måned: maks fire blokker per dag («+3 til»), farget som i uka, og klikk på datoen åpner dagen
          views={{ dayGridMonth: { dayMaxEvents: 4, displayEventEnd: true } }}
          eventDisplay="block"
          navLinks
          firstDay={1}
          allDaySlot={false}
          nowIndicator
          slotDuration="00:30:00"
          snapDuration="00:15:00"
          scrollTime="07:00:00"
          height="78vh"
          selectable
          selectMirror
          editable
          eventOverlap
          events={loadEvents}
          datesSet={(arg: DatesSetArg) => setMonday(weekShown(arg))}
          select={onSelect}
          eventClick={onEventClick}
          eventChange={onEventChange}
          eventContent={renderEvent}
        />
      </div>

      {draft && (
        <EventDialog
          key={draft.id ?? "new"}
          draft={draft}
          onSave={save}
          onDelete={draft.id ? () => remove(draft.id!) : undefined}
          onClose={() => setDraft(null)}
        />
      )}

      {prayerDate && <PrayerDialog date={prayerDate} onClose={() => setPrayerDate(null)} />}
    </div>
  );
}

function renderEvent(arg: EventContentArg) {
  const e = arg.event.extendedProps as CalendarEvent;
  const minutes = ((arg.event.end?.getTime() ?? 0) - (arg.event.start?.getTime() ?? 0)) / 60_000;
  if (minutes < 45) {
    // Korte blokker (f.eks. bønner på 15–20 min): én linje
    return (
      <div className="flex h-full items-center gap-1.5 overflow-hidden px-1 text-[11px] leading-none">
        <span className="truncate font-medium">{arg.event.title}</span>
        <span className="shrink-0 opacity-75">{arg.timeText.split(" - ")[0]}</span>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col overflow-hidden px-1 py-0.5 leading-tight">
      <span className="truncate text-[11px] opacity-90">{arg.timeText}</span>
      <span className="truncate text-xs font-medium">
        {e.locked && e.source !== "PRAYER" && <span aria-label="Låst">🔒 </span>}
        {arg.event.title}
        {e.source === "AI" && <span className="ml-1 text-[10px] font-normal opacity-70">auto</span>}
      </span>
    </div>
  );
}
