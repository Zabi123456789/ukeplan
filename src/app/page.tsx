import { Calendar } from "@/components/Calendar";

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Ukeplan</h1>
      </header>
      <Calendar />
    </main>
  );
}
