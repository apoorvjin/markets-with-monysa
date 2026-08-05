import { useSyncExternalStore } from "react";
import { WIRE_DESKS, type WireDesk } from "@monysa/contracts";

/**
 * Persisted Wire desk-column order (user-reorderable via drag-and-drop).
 * Mirrors the watchlist store pattern (useSyncExternalStore + localStorage).
 * `normalize` always returns a full permutation of WIRE_DESKS: it drops
 * unknown/duplicate ids and appends any desk missing from the stored order
 * (so a newly added desk shows up at the end instead of vanishing).
 */
const KEY = "monysa-wire-desk-order";
const VALID = new Set<string>(WIRE_DESKS);

let listeners: Array<() => void> = [];
let cache: WireDesk[] = load();

function normalize(stored: unknown): WireDesk[] {
  const arr = Array.isArray(stored) ? stored : [];
  const seen = new Set<WireDesk>();
  const ordered: WireDesk[] = [];
  for (const d of arr) {
    if (typeof d === "string" && VALID.has(d) && !seen.has(d as WireDesk)) {
      seen.add(d as WireDesk);
      ordered.push(d as WireDesk);
    }
  }
  for (const d of WIRE_DESKS) {
    if (!seen.has(d)) ordered.push(d);
  }
  return ordered;
}

function load(): WireDesk[] {
  try {
    const raw = localStorage.getItem(KEY);
    return normalize(raw ? JSON.parse(raw) : []);
  } catch {
    return [...WIRE_DESKS];
  }
}

function save(next: WireDesk[]): void {
  cache = normalize(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // private mode — in-memory only for this session
  }
  listeners.forEach((l) => l());
}

/** Move `desk` to sit immediately before `target` (no-op if identical). */
export function moveWireDesk(desk: WireDesk, target: WireDesk): void {
  if (desk === target) return;
  const without = cache.filter((d) => d !== desk);
  const at = without.indexOf(target);
  if (at < 0) return;
  without.splice(at, 0, desk);
  save(without);
}

/** Shift `desk` by `delta` positions (keyboard reorder). */
export function nudgeWireDesk(desk: WireDesk, delta: number): void {
  const from = cache.indexOf(desk);
  if (from < 0) return;
  const to = Math.max(0, Math.min(cache.length - 1, from + delta));
  if (to === from) return;
  const next = [...cache];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved ?? desk);
  save(next);
}

export function resetWireDeskOrder(): void {
  save([...WIRE_DESKS]);
}

export function isWireOrderCustomized(): boolean {
  return cache.some((d, i) => d !== WIRE_DESKS[i]);
}

export function useWireDeskOrder(): WireDesk[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.push(cb);
      return () => {
        listeners = listeners.filter((l) => l !== cb);
      };
    },
    () => cache,
    () => [...WIRE_DESKS],
  );
}
