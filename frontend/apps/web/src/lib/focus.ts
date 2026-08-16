import { useSyncExternalStore } from "react";

/**
 * The Terminal's "focused symbol" — Bloomberg-style linked panels. Setting it
 * from any widget (watchlist, board, treemap, movers) retargets every panel
 * that follows focus (currently the Chart widget). Session-only, not persisted.
 */
export interface Focus {
  symbol: string;
  name: string;
}

let current: Focus | null = null;
let listeners: Array<() => void> = [];

export function setFocusedSymbol(symbol: string, name: string): void {
  current = { symbol, name };
  listeners.forEach((l) => l());
}

export function useFocusedSymbol(): Focus | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.push(cb);
      return () => {
        listeners = listeners.filter((l) => l !== cb);
      };
    },
    () => current,
    () => current,
  );
}
