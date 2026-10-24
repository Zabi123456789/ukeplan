"use client";

import type {
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
import { useRef, useState } from "react";
import { EventDialog, type EventDraft } from "@/components/EventDialog";
import { CATEGORIES, CATEGORY_INFO, type CalendarEvent } from "@/lib/events";

type Notice = { kind: "error" | "warning"; text: string };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Feil ${res.status}`);
  return body as T;
}

type SaveResult = { event: CalendarEvent; conflicts: CalendarEvent[] };

function conflictNotice(conflicts: CalendarEvent[]): Notice | null {
  if (conflicts.length === 0) return null;
  const names = conflicts.map((c) => `«${c.title}»`).join(", ");
  return { kind: "warning", text: `Overlapper med ${names}.` };
}

export function Calendar() {
  const calendarRef = useRef<FullCalendar>(null);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const refetch = () => calendarRef.current?.getApi().refetchEvents();

  async function loadEvents(info: EventSourceFuncArg) {
    const qs = new URLSearchParams({ start: info.start.toISOString(), end: info.end.toISOString() });
    const events = await api<CalendarEvent[]>(`/api/events?${qs}`);
    return events.map((e) => ({
      id: e.id,
      title: e.title,
      start: e.start,
      end: e.end,
      backgroundColor: CATEGORY_INFO[e.category].color,
      borderColor: CATEGORY_INFO[e.category].color,
      editable: !e.locked,
      classNames: e.locked ? ["is-locked"] : [],
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
    setDraft({ ...e, start: new Date(e.start), end: new Date(e.end) });
  }

  async function onEventChange(info: EventChangeArg) {
    try {
      const result = await api<SaveResult>(`/api/events/${info.event.id}`, {
        method: "PATCH",
        body: JSON.stringify({ start: info.event.start?.toISOString(), end: info.event.end?.toISOString() }),
      });
      info.event.setExtendedProp("start", result.event.start);
      info.event.setExtendedProp("end", result.event.end);
      setNotice(conflictNotice(result.conflicts));
    } catch (err) {
      info.revert();
      setNotice({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    }
  }

  async function save(d: EventDraft) {
    const body = JSON.stringify({
      title: d.title,
      category: d.category,
      start: d.start.toISOString(),
      end: d.end.toISOString(),
      locked: d.locked,
      location: d.location,
      notes: d.notes,
    });
    const result = d.id
      ? await api<SaveResult>(`/api/events/${d.id}`, { method: "PATCH", body })
      : await api<SaveResult>("/api/events", { method: "POST", body });
    setDraft(null);
    setNotice(conflictNotice(result.conflicts));
    refetch();
  }

  async function remove(id: string) {
    await api(`/api/events/${id}`, { method: "DELETE" });
    setDraft(null);
    setNotice(null);
    refetch();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {CATEGORIES.map((c) => (
          <span key={c} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: CATEGORY_INFO[c].color }} />
            {CATEGORY_INFO[c].label}
          </span>
        ))}
        <span className="ml-auto">Dra i kalenderen for å lage en blokk. Klikk på en blokk for å redigere.</span>
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
          initialView="timeGridWeek"
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
          events={loadEvents}
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
    </div>
  );
}

function renderEvent(arg: EventContentArg) {
  const e = arg.event.extendedProps as CalendarEvent;
  return (
    <div className="flex h-full flex-col overflow-hidden px-1 py-0.5 leading-tight">
      <span className="truncate text-[11px] opacity-90">{arg.timeText}</span>
      <span className="truncate text-xs font-medium">
        {e.locked && <span aria-label="Låst">🔒 </span>}
        {arg.event.title}
      </span>
    </div>
  );
}
