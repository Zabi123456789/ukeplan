import { useSyncExternalStore } from "react";
import { Calendar } from "@/components/Calendar";
import { PrayerSettingsForm } from "@/components/PrayerSettingsForm";
import { RulesManager } from "@/components/RulesManager";

// Fanene ligger i adressen (#regler osv.), så de virker på GitHub Pages og med tilbake-knappen.
const TABS = [
  { id: "kalender", label: "Kalender" },
  { id: "regler", label: "Regler" },
  { id: "bonnetider", label: "Bønnetider" },
] as const;
type Tab = (typeof TABS)[number]["id"];

function currentTab(): Tab {
  const hash = window.location.hash.slice(1);
  return TABS.some((t) => t.id === hash) ? (hash as Tab) : "kalender";
}

function subscribe(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

export function App() {
  const tab = useSyncExternalStore(subscribe, currentTab);

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-line bg-surface">
        <nav className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-3">
          <span className="mr-4 font-semibold tracking-tight">Ukeplan</span>
          {TABS.map((t) => (
            <a
              key={t.id}
              href={`#${t.id}`}
              aria-current={tab === t.id ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm ${tab === t.id ? "bg-hover font-medium" : "text-muted hover:text-foreground"}`}
            >
              {t.label}
            </a>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-4 py-4">
        {tab === "kalender" && <Calendar />}
        {tab === "regler" && (
          <>
            <PageTitle title="Regler for planleggingen" text="Det planleggeren skal balansere når den fyller uka di." />
            <RulesManager />
          </>
        )}
        {tab === "bonnetider" && (
          <>
            <PageTitle title="Bønnetider" text="Tidene beregnes for hver dato. En enkelt dag endrer du ved å klikke på bønnen i kalenderen." />
            <PrayerSettingsForm />
          </>
        )}
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 pb-6 text-xs text-muted">
        Alt lagres bare i denne nettleseren. Ingen andre kan se kalenderen din, og den følger ikke med til andre enheter.
      </footer>
    </div>
  );
}

function PageTitle({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted">{text}</p>
    </div>
  );
}
