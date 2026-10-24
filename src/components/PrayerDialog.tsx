import { useState } from "react";
import { prayerDay, setPrayerOverride } from "@/lib/calendar";
import { PRAYER_LABEL, PRAYERS, type Prayer } from "@/lib/prayer";
import { update, useData } from "@/lib/store";

type Props = {
  date: string; // YYYY-MM-DD
  onClose: () => void;
};

const hhmm = (d: Date) => d.toLocaleTimeString("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" });

export function PrayerDialog({ date, onClose }: Props) {
  const day = prayerDay(useData(), date);
  const [error, setError] = useState<string | null>(null);

  function setTime(prayer: Prayer, time: string | null) {
    setError(null);
    try {
      update((data) => setPrayerOverride(data, date, prayer, time));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
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

        <div className="divide-y divide-line rounded-md border border-line text-sm">
          <InfoRow label="Soloppgang" value={hhmm(day.sunrise)} />
          {PRAYERS.map((p) => (
            <PrayerRow
              key={`${p}-${day.times[p].getTime()}`}
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

        {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}

        <p className="text-xs text-muted">
          Endrer du en tid her, gjelder det bare denne dagen. Metode, vinkler og varighet endrer du under{" "}
          <a href="#bonnetider" onClick={onClose} className="text-accent hover:underline">
            Bønnetider
          </a>
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
