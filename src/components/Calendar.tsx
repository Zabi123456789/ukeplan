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
import timeGridPlugin from "@fullcalendar/timegrid";
import { useEffect, useRef, useState } from "react";
import { EventDialog, type EventDraft } from "@/components/EventDialog";
import { PlanPanel } from "@/components/PlanPanel";
import { PrayerDialog } from "@/components/PrayerDialog";
import { calendarBetween, createEvent, deleteEvent, updateEvent } from "@/lib/calendar";
import { CATEGORIES, CATEGORY_INFO, type CalendarEvent } from "@/lib/events";
import { getData, update, useData } from "@/lib/store";
import { localParts, mondayOf } from "@/lib/week";

type Notice = { kind: "error" | "warning"; text: string };

function conflictNotice(conflicts: CalendarEvent[]): Notice | null {
  if (conflicts.length === 0) return null;
  const names = conflicts.map((c) => `«${c.title}»`).join(", ");
  return { kind: "warning", text: `Overlapper med ${names}.` };
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function Calendar() {
  const calendarRef = useRef<FullCalendar>(null);
  const data = useData();
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [prayerDate, setPrayerDate] = useState<string | null>(null);
  const [monday, setMonday] = useState<string | null>(null);

  // Tegn kalenderen på nytt når dataene endres (også fra en annen fane)
  useEffect(() => {
    calendarRef.current?.getApi().refetchEvents();
  }, [data]);

  function loadEvents(info: EventSourceFuncArg) {
    return calendarBetween(getData(), info.start, info.end).map((e) => ({
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

  function onSelect(info: DateSelectArg) {
    info.view.calendar.unselect();
    setDraft({
      title: "",
      category: "SCHOOL",
      start: info.start,
      end: info.end,
      locked: false,
      location: null,
      notes: null,
    });
  }

  function onEventClick(info: EventClickArg) {
    const e = info.event.extendedProps as CalendarEvent;
    // Bønneblokker har id-en "prayer:YYYY-MM-DD:FAJR"
    if (e.source === "PRAYER") return setPrayerDate(e.id.split(":")[1]);
    setDraft({ ...e, start: new Date(e.start), end: new Date(e.end) });
  }

  function onEventChange(info: EventChangeArg) {
    try {
      const changes = { start: info.event.start?.toISOString(), end: info.event.end?.toISOString() };
      const result = updateEvent(getData(), info.event.id, changes);
      update(() => result.data);
      setNotice(conflictNotice(result.conflicts));
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
    const result = d.id ? updateEvent(getData(), d.id, input) : createEvent(getData(), input);
    update(() => result.data);
    setDraft(null);
    setNotice(conflictNotice(result.conflicts));
  }

  async function remove(id: string) {
    update((current) => deleteEvent(current, id));
    setDraft(null);
    setNotice(null);
  }

  return (
    <div className="space-y-3">
      {monday && <PlanPanel monday={monday} />}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {CATEGORIES.map((c) => (
          <span key={c} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: CATEGORY_INFO[c].color }} />
            {CATEGORY_INFO[c].label}
          </span>
        ))}
        <span className="ml-auto">Dra i kalenderen for å lage en blokk. Klikk på en blokk eller bønn for å redigere.</span>
      </div>

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
          plugins={[timeGridPlugin, interactionPlugin]}
          locale={nbLocale}
          initialView={window.innerWidth < 640 ? "timeGridDay" : "timeGridWeek"}
          headerToolbar={{ left: "prev,next today", center: "title", right: "timeGridWeek,timeGridDay" }}
          buttonText={{ today: "I dag", week: "Uke", day: "Dag" }}
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
          events={(info, success) => success(loadEvents(info))}
          datesSet={(arg: DatesSetArg) => setMonday(mondayOf(localParts(arg.start).date))}
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
