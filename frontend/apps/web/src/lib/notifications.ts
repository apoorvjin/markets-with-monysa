import { useSyncExternalStore } from "react";

/** Per-device "seen" tracking for the notification history bell — local only, mirrors watchlist.ts. */
const KEY = "finbrio-read-notification-ids";
let listeners: Array<() => void> = [];
let cache: Set<string> = load();

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : []);
  } catch {
    return new Set();
  }
}

function save(next: Set<string>): void {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify([...next]));
  } catch {
    // private mode — in-memory only
  }
  listeners.forEach((l) => l());
}

export function markNotificationsRead(ids: Iterable<string>): void {
  const next = new Set(cache);
  let changed = false;
  for (const id of ids) {
    if (!next.has(id)) {
      next.add(id);
      changed = true;
    }
  }
  if (changed) save(next);
}

export function useReadNotificationIds(): Set<string> {
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
