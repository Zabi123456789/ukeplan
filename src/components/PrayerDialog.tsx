"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PrayerDayResponse } from "@/app/api/prayers/[date]/route";
import { PRAYER_LABEL, PRAYERS, type Prayer } from "@/lib/prayer";

type Props = {
  date: string; // YYYY-MM-DD
  onChanged: () => void;
  onClose: () => void;
};

const TIME_ZONE = "Europe/Oslo";
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("nb-NO", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });

export function PrayerDialog({ date, onChanged, onClose }: Props) {
  const [day, setDay] = useState<PrayerDayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/prayers/${date}`)
      .then((r) => r.json())
      .then(setDay, () => setError("Kunne ikke hente bønnetidene"));
  }, [date]);

  async function setTime(prayer: Prayer, time: string | null) {
    setError(null);
    const res = await fetch(`/api/prayers/${date}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prayer, time }),
    });
    const body = await res.json();
    if (!res.ok) return setError(body.error ?? "Kunne ikke lagre");
    setDay(body);
    onChanged();
  }

  const heading = new Date(`${date}T12:00:00`).toLocaleDateString("nb-NO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-label="Bønnetider" className="w-full max-w-md space-y-4 rounded-xl border border-line bg-surface p-5 shadow-xl">
        <div>
          <h2 className="text-lg font-semibold">Bønnetider</h2>
          <p className="text-sm capitalize text-muted">{heading}</p>
        </div>

        {!day ? (
          <p className="text-sm text-muted">{error ?? "Henter …"}</p>
        ) : (
          <div className="divide-y divide-line rounded-md border border-line text-sm">
            <InfoRow label="Soloppgang" value={hhmm(day.sunrise)} />
            {PRAYERS.map((p) => (
              <PrayerRow
                key={`${p}-${day.times[p]}`}
                prayer={p}
                time={hhmm(day.times[p])}
                calculated={hhmm(day.calculated[p])}
                manual={day.overridden.includes(p)}
                onSet={(time) => setTime(p, time)}
              />
            ))}
            <InfoRow label="Solnedgang" value={hhmm(day.sunset)} />
            <InfoRow label="Midnatt" value={hhmm(day.midnight)} hint="siste frist for Maghrib og Isha" />
          </div>
        )}

        {error && day && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}

        <p className="text-xs text-muted">
          Endrer du en tid her, gjelder det bare denne dagen. Metode, vinkler og varighet endrer du i{" "}
          <Link href="/innstillinger" className="text-accent hover:underline">
            innstillingene
          </Link>
          .
        </p>

        <div className="flex justify-end">
          <button onClick={onClose} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            Ferdig
          </button>
        </div>
      </div>
    </div>
  );
}

/** Lagrer først når feltet mister fokus eller du trykker Enter, ikke for hvert tastetrykk. */
function PrayerRow(props: {
  prayer: Prayer;
  time: string;
  calculated: string;
  manual: boolean;
  onSet: (time: string | null) => void;
}) {
  const { prayer, time, calculated, manual, onSet } = props;
  const [value, setValue] = useState(time);
  const commit = () => value && value !== time && onSet(value);
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <span className="w-20 font-medium">{PRAYER_LABEL[prayer]}</span>
      <input
        type="time"
        aria-label={`${PRAYER_LABEL[prayer]} tid`}
        className={`rounded-md border bg-surface px-2 py-1 tabular-nums ${manual ? "border-accent" : "border-line"}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
      {manual ? (
        <button onClick={() => onSet(null)} className="ml-auto text-xs text-accent hover:underline">
          Bruk beregnet ({calculated})
        </button>
      ) : (
        <span className="ml-auto text-xs text-muted">beregnet</span>
      )}
    </div>
  );
}

function InfoRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 text-muted">
      <span className="w-20">{label}</span>
      <span className="tabular-nums">{value}</span>
      {hint && <span className="ml-auto text-xs">{hint}</span>}
    </div>
  );
}
