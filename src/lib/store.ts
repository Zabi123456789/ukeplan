import { useSyncExternalStore } from "react";
import { emptyData, parseData, type AppData } from "@/lib/calendar";

// Lagring i nettleseren (localStorage). Dataene finnes bare i denne nettleseren.

const KEY = "ukeplan:v1";

function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parseData(JSON.parse(raw)) : emptyData();
  } catch {
    return emptyData(); // privat modus, blokkert lagring eller ødelagt JSON
  }
}

function save(data: AppData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Lagring kan være blokkert. Appen virker fortsatt, men endringer forsvinner ved omlasting.
  }
}

let state: AppData | null = null;
const listeners = new Set<() => void>();

export function getData(): AppData {
  state ??= load();
  return state;
}

/** Bruker en ren funksjon på dataene, lagrer og varsler komponentene. */
export function update(fn: (data: AppData) => AppData) {
  state = fn(getData());
  save(state);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Endringer fra en annen fane i samme nettleser
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      state = load();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useData(): AppData {
  return useSyncExternalStore(subscribe, getData, getData);
}
