/**
 * server/lib/macro-notifiers.ts
 * Four macro / milestone broadcast triggers registered into broadcast-notifier.ts:
 *   - yield-curve      : 3M/10Y curve label flips (inverted / flat / normal)
 *   - fear-greed       : CNN-style sentiment index entering an extreme band
 *   - debt-milestone   : US national debt crossing a $1T floor
 *   - extreme-move     : a headline index/commodity posting an outsized daily move
 *
 * Each fetches its own upstream data rather than reading a route's in-process
 * cache — a cache is only warm if a user happened to hit that endpoint, and a
 * trigger that silently never fires because nobody opened the app is exactly
 * the failure mode broadcast-notifier.ts's own history warns about.
 *
 * The pure classify/threshold helpers are exported and unit-tested in
 * macro-notifiers.test.ts; only the fetch + copy live in the check() bodies.
 */

import { registerBroadcastTrigger } from "./broadcast-notifier";
import { fetchYahooPrice } from "../routes/shared";
import { curveStatusOf } from "../routes/economy";

// ── Yield curve ──────────────────────────────────────────────────────────────

const CURVE_LABEL: Record<string, string> = {
  inverted: "inverted",
  flat: "flat",
  normal: "normal (upward-sloping)",
};

/** Human sentence for a curve transition. Pure. */
export function curveTransitionCopy(from: string, to: string): { title: string; body: string } {
  if (from === "inverted" && to !== "inverted") {
    return {
      title: "📈 Yield curve just re-steepened",
      body: `3M/10Y is out of inversion and back to ${CURVE_LABEL[to] ?? to}. Historically the recession-onset signal, more than the inversion itself.`,
    };
  }
  if (to === "inverted") {
    return {
      title: "📉 Yield curve just inverted",
      body: "3M/10Y spread turned negative — short rates now above long rates.",
    };
  }
  return {
    title: "📊 Yield curve shifted",
    body: `3M/10Y moved from ${CURVE_LABEL[from] ?? from} to ${CURVE_LABEL[to] ?? to}.`,
  };
}

export function registerYieldCurveTrigger(): void {
  registerBroadcastTrigger({
    id: "yield-curve-status",
    intervalMs: 60 * 60_000, // hourly — the label changes a handful of times a decade
    check: async () => {
      const [r3m, r10y] = await Promise.all([
        fetchYahooPrice("^IRX"),
        fetchYahooPrice("^TNX"),
      ]);
      const us3m = r3m?.price ?? null;
      const us10y = r10y?.price ?? null;
      if (us3m == null || us10y == null) return null;

      const spread = parseFloat((us10y - us3m).toFixed(4));
      const status = curveStatusOf(spread);
      if (status === null) return null;

      const sign = spread >= 0 ? "+" : "";
      return {
        state: status,
        title: "", // filled by the engine-facing copy below
        body: "",
        data: { spread: `${sign}${spread.toFixed(2)}`, us3m: String(us3m), us10y: String(us10y) },
      };
    },
    // The engine only knows the previous state string, and the copy depends on
    // the transition (inversion vs re-steepening read very differently), so the
    // title/body are resolved from both sides here.
    renderTransition: (from, to, data) => {
      const copy = curveTransitionCopy(from, to);
      return { title: copy.title, body: `${copy.body} Spread now ${data?.spread ?? "?"}%.` };
    },
  });
}

// ── Fear & Greed ─────────────────────────────────────────────────────────────

const EXTREME_BANDS = new Set(["Extreme Fear", "Extreme Greed"]);

/** Only the two outer bands are notification-worthy; Fear↔Neutral wobble is noise. Pure. */
export function isExtremeSentiment(classification: string | null | undefined): boolean {
  return !!classification && EXTREME_BANDS.has(classification);
}

export function registerFearGreedTrigger(): void {
  registerBroadcastTrigger({
    id: "fear-greed-extreme",
    intervalMs: 6 * 60 * 60_000, // 6h — the index updates once a day
    cooldownMs: 3 * 24 * 60 * 60_000, // 3 days, so a value oscillating on a band edge can't nag
    check: async () => {
      const resp = await fetch("https://api.alternative.me/fng/?limit=2", {
        headers: { "User-Agent": "markets-api/1.0", Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) return null;
      const raw = (await resp.json()) as {
        data?: { value: string; value_classification: string }[];
      };
      const latest = raw.data?.[0];
      if (!latest) return null;

      const value = parseInt(latest.value, 10);
      const classification = latest.value_classification;
      if (!isExtremeSentiment(classification)) {
        // Not an extreme — still report the band as state so leaving an extreme
        // is recorded (and so re-entering it later reads as a real change).
        return {
          state: `normal:${classification}`,
          title: "",
          body: "",
          data: { value: String(value), classification },
        };
      }

      const icon = classification === "Extreme Fear" ? "😨" : "🤑";
      const prev = raw.data?.[1]?.value;
      const fromText = prev ? ` (was ${parseInt(prev, 10)} yesterday)` : "";
      return {
        state: `extreme:${classification}`,
        title: `${icon} Market sentiment: ${classification}`,
        body: `Fear & Greed at ${value}${fromText}.`,
        data: { value: String(value), classification },
      };
    },
    // Leaving an extreme is a state change too, but not worth a push — only
    // notify when the new state is itself an extreme.
    shouldNotify: (_from, to) => to.startsWith("extreme:"),
  });
}

// ── US debt milestone ────────────────────────────────────────────────────────

const TRILLION = 1_000_000_000_000;

/** Which $1T floor the debt currently sits above. Pure. */
export function trillionFloor(totalDebt: number): number {
  return Math.floor(totalDebt / TRILLION);
}

export function registerDebtMilestoneTrigger(): void {
  registerBroadcastTrigger({
    id: "us-debt-milestone",
    intervalMs: 6 * 60 * 60_000, // 6h — Treasury publishes daily
    check: async () => {
      const url =
        "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny?sort=-record_date&page[size]=1";
      const resp = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!resp.ok) return null;
      const raw = (await resp.json()) as { data?: { tot_pub_debt_out_amt?: string; record_date?: string }[] };
      const row = raw.data?.[0];
      const totalDebt = row?.tot_pub_debt_out_amt ? parseFloat(row.tot_pub_debt_out_amt) : NaN;
      if (!Number.isFinite(totalDebt) || totalDebt <= 0) return null;

      const floor = trillionFloor(totalDebt);
      return {
        state: `T${floor}`,
        title: `🇺🇸 US national debt just crossed $${floor} trillion`,
        body: `Total public debt outstanding is now $${(totalDebt / TRILLION).toFixed(2)}T as of ${row?.record_date ?? "the latest Treasury filing"}.`,
        data: { totalDebt: String(totalDebt), trillions: String(floor) },
      };
    },
    // Debt only ratchets up in practice, but guard against a downward revision
    // producing a "crossed $38T" push when it actually fell back.
    shouldNotify: (from, to) => {
      const prev = parseInt(from.replace("T", ""), 10);
      const next = parseInt(to.replace("T", ""), 10);
      return Number.isFinite(prev) && Number.isFinite(next) && next > prev;
    },
  });
}

// ── Extreme single-day move ──────────────────────────────────────────────────

/**
 * Deliberately a curated headline list, not all 46 indices + 23 commodities:
 * a -3% day in a thinly-followed index is not push-worthy, and fetching the
 * full universe hourly to find out would be wasteful.
 */
const HEADLINE_INSTRUMENTS: { symbol: string; name: string; flag: string }[] = [
  { symbol: "^GSPC",  name: "S&P 500",     flag: "🇺🇸" },
  { symbol: "^IXIC",  name: "Nasdaq",      flag: "🇺🇸" },
  { symbol: "^DJI",   name: "Dow Jones",   flag: "🇺🇸" },
  { symbol: "^N225",  name: "Nikkei 225",  flag: "🇯🇵" },
  { symbol: "^HSI",   name: "Hang Seng",   flag: "🇭🇰" },
  { symbol: "^GDAXI", name: "DAX 40",      flag: "🇩🇪" },
  { symbol: "^FTSE",  name: "FTSE 100",    flag: "🇬🇧" },
  { symbol: "^NSEI",  name: "Nifty 50",    flag: "🇮🇳" },
  { symbol: "GC=F",   name: "Gold",        flag: "🥇" },
  { symbol: "CL=F",   name: "Crude Oil",   flag: "🛢️" },
  { symbol: "SI=F",   name: "Silver",      flag: "🥈" },
  { symbol: "BTC-USD", name: "Bitcoin",    flag: "₿" },
];

/**
 * ±3%, not ±2%: measured against how often these instruments actually move,
 * 2% fires most weeks and trains people to swipe the notification away.
 */
export const EXTREME_MOVE_THRESHOLD = 3.0;

export interface MoveRow { name: string; flag: string; changePercent: number }

/** Instruments past the threshold, biggest absolute move first. Pure. */
export function extremeMovers(rows: MoveRow[], threshold = EXTREME_MOVE_THRESHOLD): MoveRow[] {
  return rows
    .filter((r) => Math.abs(r.changePercent) >= threshold)
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
}

function pct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

export function registerExtremeMoveTrigger(): void {
  registerBroadcastTrigger({
    id: "extreme-daily-move",
    intervalMs: 60 * 60_000, // hourly
    cooldownMs: 8 * 60 * 60_000, // at most one "big move" push per 8h
    check: async () => {
      const quotes = await Promise.all(
        HEADLINE_INSTRUMENTS.map(async (inst) => {
          const q = await fetchYahooPrice(inst.symbol).catch(() => null);
          const changePercent = q?.changePercent;
          if (typeof changePercent !== "number") return null;
          return { name: inst.name, flag: inst.flag, changePercent };
        }),
      );
      const rows = quotes.filter((r): r is MoveRow => r !== null);
      if (rows.length === 0) return null;

      const movers = extremeMovers(rows);
      // Date-key the state so the same instrument moving big on two different
      // days notifies twice, but repeated checks within one day do not.
      const day = new Date().toISOString().slice(0, 10);
      if (movers.length === 0) return { state: `${day}:calm`, title: "", body: "" };

      const [lead, ...rest] = movers;
      const alsoText = rest.length
        ? ` Also moving: ${rest.slice(0, 2).map((r) => `${r.name} ${pct(r.changePercent)}`).join(", ")}.`
        : "";
      return {
        state: `${day}:${movers.map((m) => m.name).join("|")}`,
        title: `${lead.flag} ${lead.name} ${pct(lead.changePercent)} today`,
        body: `An outsized move by recent standards.${alsoText}`,
        data: { lead: lead.name, change: lead.changePercent.toFixed(2), count: String(movers.length) },
      };
    },
    shouldNotify: (_from, to) => !to.endsWith(":calm"),
  });
}
