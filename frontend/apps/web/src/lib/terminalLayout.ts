import { useSyncExternalStore } from "react";

/**
 * Terminal workspace layout store — the panels that make up each saved layout,
 * persisted to localStorage. Mirrors the watchlist store pattern
 * (useSyncExternalStore + a module-level cache), so any component that calls
 * `useTerminalStore()` re-renders on mutation.
 */

export type PanelType =
  | "watchlist"
  | "chart"
  | "movers"
  | "treemap"
  | "quotes"
  | "macro"
  | "correlation"
  | "portfolio"
  | "compare"
  | "wire"
  | "signals"
  | "econ"
  | "breaking"
  | "geointel"
  | "instflow"
  | "cot"
  | "smartmoney";
/** Grid column span: 1 (compact), 2 (wide), 3 (full-bleed). */
export type PanelSpan = 1 | 2 | 3;

export interface Panel {
  id: string;
  type: PanelType;
  span: PanelSpan;
}
export interface Layout {
  id: string;
  name: string;
  panels: Panel[];
}
interface Store {
  layouts: Layout[];
  activeId: string;
}

export const PANEL_META: Record<PanelType, { label: string; defaultSpan: PanelSpan }> = {
  chart: { label: "Chart", defaultSpan: 2 },
  watchlist: { label: "Watchlist", defaultSpan: 1 },
  treemap: { label: "Treemap", defaultSpan: 2 },
  movers: { label: "Movers", defaultSpan: 1 },
  quotes: { label: "Market Board", defaultSpan: 1 },
  macro: { label: "Macro", defaultSpan: 1 },
  correlation: { label: "Correlation", defaultSpan: 2 },
  portfolio: { label: "Portfolio", defaultSpan: 1 },
  compare: { label: "Compare", defaultSpan: 2 },
  wire: { label: "Wire", defaultSpan: 1 },
  signals: { label: "Signals", defaultSpan: 1 },
  econ: { label: "Economic Calendar", defaultSpan: 1 },
  breaking: { label: "Breaking", defaultSpan: 1 },
  geointel: { label: "Geo-Intel", defaultSpan: 1 },
  instflow: { label: "Institutional Flow", defaultSpan: 1 },
  cot: { label: "CFTC COT", defaultSpan: 1 },
  smartmoney: { label: "Smart Money", defaultSpan: 1 },
};

const KEY = "finbrio-terminal-layouts";
// Bumped to 2 to discard the old preset default (which pre-placed panels incl.
// Movers). The default now starts empty — the user builds their own workspace.
const SCHEMA = 2;

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function defaultStore(): Store {
  // No presets — start with a single empty "Default" layout; the user adds
  // panels via the ＋ Panel menu.
  const id = uid();
  return { layouts: [{ id, name: "Default", panels: [] }], activeId: id };
}

let store: Store = load();
let listeners: Array<() => void> = [];

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultStore();
    const parsed = JSON.parse(raw) as { __v?: number; layouts?: Layout[]; activeId?: string };
    if (parsed.__v !== SCHEMA || !Array.isArray(parsed.layouts) || parsed.layouts.length === 0) {
      return defaultStore();
    }
    const activeId =
      parsed.activeId && parsed.layouts.some((l) => l.id === parsed.activeId)
        ? parsed.activeId
        : parsed.layouts[0]!.id;
    return { layouts: parsed.layouts, activeId };
  } catch {
    return defaultStore();
  }
}

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ __v: SCHEMA, ...store }));
  } catch {
    /* private mode — in-memory only */
  }
  listeners.forEach((l) => l());
}

function mutateActive(fn: (panels: Panel[]) => Panel[]): void {
  store = {
    ...store,
    layouts: store.layouts.map((l) =>
      l.id === store.activeId ? { ...l, panels: fn(l.panels) } : l,
    ),
  };
  persist();
}

export function useTerminalStore(): Store {
  return useSyncExternalStore(
    (cb) => {
      listeners.push(cb);
      return () => {
        listeners = listeners.filter((l) => l !== cb);
      };
    },
    () => store,
    () => store,
  );
}

export function activeLayout(s: Store): Layout {
  return s.layouts.find((l) => l.id === s.activeId) ?? s.layouts[0]!;
}

export function addPanel(type: PanelType): void {
  mutateActive((p) => [...p, { id: uid(), type, span: PANEL_META[type].defaultSpan }]);
}
export function removePanel(id: string): void {
  mutateActive((p) => p.filter((x) => x.id !== id));
}
export function resizePanel(id: string): void {
  mutateActive((p) =>
    p.map((x) =>
      x.id === id ? { ...x, span: (x.span === 3 ? 1 : ((x.span + 1) as PanelSpan)) } : x,
    ),
  );
}
export function movePanel(id: string, dir: -1 | 1): void {
  mutateActive((p) => {
    const i = p.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= p.length) return p;
    const next = p.slice();
    const tmp = next[i]!;
    next[i] = next[j]!;
    next[j] = tmp;
    return next;
  });
}

export function setActiveLayout(id: string): void {
  if (!store.layouts.some((l) => l.id === id)) return;
  store = { ...store, activeId: id };
  persist();
}
export function addLayout(name: string): void {
  const id = uid();
  store = {
    ...store,
    layouts: [
      ...store.layouts,
      { id, name: name.trim() || `Layout ${store.layouts.length + 1}`, panels: [] },
    ],
    activeId: id,
  };
  persist();
}
export function renameLayout(id: string, name: string): void {
  const clean = name.trim();
  if (!clean) return;
  store = {
    ...store,
    layouts: store.layouts.map((l) => (l.id === id ? { ...l, name: clean } : l)),
  };
  persist();
}
export function deleteLayout(id: string): void {
  if (store.layouts.length <= 1) return;
  const layouts = store.layouts.filter((l) => l.id !== id);
  store = { layouts, activeId: store.activeId === id ? layouts[0]!.id : store.activeId };
  persist();
}
