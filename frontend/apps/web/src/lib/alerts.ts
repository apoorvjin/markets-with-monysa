import { useSyncExternalStore } from "react";

/** Price alerts — mirrors price_alert.dart + alert_provider.dart, persisted
    in localStorage and evaluated client-side against polled quotes. */
export interface PriceAlert {
  id: string;
  symbol: string;
  name: string;
  targetPrice: number;
  direction: "above" | "below";
  triggered?: boolean;
}

const KEY = "monysa-alerts";
let listeners: Array<() => void> = [];
let cache: PriceAlert[] = load();

function load(): PriceAlert[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as PriceAlert[]) : [];
  } catch {
    return [];
  }
}

function save(next: PriceAlert[]): void {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // private mode — in-memory only
  }
  listeners.forEach((l) => l());
}

export function addAlert(a: Omit<PriceAlert, "id">): void {
  save([...cache, { ...a, id: `${a.symbol}-${Date.now()}` }]);
}

export function removeAlert(id: string): void {
  save(cache.filter((a) => a.id !== id));
}

/** Mark alerts triggered by current prices; returns newly-triggered alerts. */
export function evaluateAlerts(prices: Map<string, number>): PriceAlert[] {
  const fired: PriceAlert[] = [];
  const next = cache.map((a) => {
    if (a.triggered) return a;
    const p = prices.get(a.symbol);
    if (p == null) return a;
    const hit =
      a.direction === "above" ? p >= a.targetPrice : p <= a.targetPrice;
    if (hit) {
      const t = { ...a, triggered: true };
      fired.push(t);
      return t;
    }
    return a;
  });
  if (fired.length > 0) save(next);
  return fired;
}

export function useAlerts(): PriceAlert[] {
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
