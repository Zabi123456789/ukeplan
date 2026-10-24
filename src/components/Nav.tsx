"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Kalender" },
  { href: "/innstillinger", label: "Innstillinger" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="border-b border-line bg-surface">
      <nav className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-3">
        <span className="mr-4 font-semibold tracking-tight">Ukeplan</span>
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-md px-3 py-1.5 text-sm ${path === l.href ? "bg-hover font-medium" : "text-muted hover:text-foreground"}`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
