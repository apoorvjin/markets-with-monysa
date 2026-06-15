import { useSyncExternalStore } from "react";

/** Persisted watchlist — mirrors watchlist_provider.dart (list of symbols). */
const KEY = "monysa-watchlist";
let listeners: Array<() => void> = [];
let cache: string[] = load();

function load(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function save(next: string[]): void {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // private mode — in-memory only
  }
  listeners.forEach((l) => l());
}

export function toggleWatchlist(symbol: string): void {
  save(
    cache.includes(symbol) ? cache.filter((s) => s !== symbol) : [...cache, symbol],
  );
}

export function useWatchlist(): string[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.push(cb);
      return () => {
        listeners = listeners.filter((l) => l !== cb);
      };
    },
    () => cache,
  );
}
