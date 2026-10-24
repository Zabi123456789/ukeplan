import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PrayerSettingsForm } from "@/components/PrayerSettingsForm";
import { todayIn } from "@/lib/prayer";
import { getPrayerSettings } from "@/lib/prayer-store";

export const metadata: Metadata = { title: "Innstillinger · Ukeplan" };

export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Bønnetider</h1>
        <p className="text-sm text-muted">
          Tidene beregnes for hver dato. Endrer du en enkelt dag, gjør du det ved å klikke på bønnen i kalenderen.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted">Henter innstillinger …</p>}>
        <SavedSettings />
      </Suspense>
    </main>
  );
}

async function SavedSettings() {
  await connection(); // les innstillingene ved hver forespørsel, ikke ved bygging
  const settings = await getPrayerSettings();
  return <PrayerSettingsForm initial={settings} today={todayIn(settings.timeZone)} />;
}
