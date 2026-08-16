/**
 * Forward signal ledger — captures live BUY/SELL signals as they fire and
 * resolves them against real subsequent price action, building a genuine,
 * accruing live track record per strategy. Complements the historical
 * backtest (server/trading.ts), which can only ever answer "did this edge
 * exist in aggregate, across history" — this answers "is it still alive now."
 *
 * Self-contained by design: the whole feature can be removed by deleting this
 * file + exit-detection.ts and reverting a handful of lines in trading.ts
 * (see the implementation plan's "Designed for removal" section).
 */

import { FieldValue } from "firebase-admin/firestore";
import { adminFirestore } from "./firebase-admin";
import { isLeader } from "./leader";
import { getRemoteConfigFlag } from "./remote-config-flags";
import { checkExit } from "./exit-detection";
import {
  TRADING_ASSETS,
  generateSignal,
  fetchHistory,
  btMaxHold,
  CROSS_ASSET_PAIRS,
  CROSS_ASSET_PAIRS_PLUS,
  NEWS_STRATEGY_IDS,
  APEX_STRATEGY_IDS,
  type Timeframe,
  type StrategyId,
  type OHLCV,
} from "../trading";

// ── Versioning ─────────────────────────────────────────────────────────────
// Bump for a strategy id whenever its scoring/threshold/SL-TP logic changes
// (NOT for display-name changes — the Aug-2026 S1-S9 rename did not touch
// this). Bumping starts a brand-new track record for that id from zero via a
// new seriesKey; the old version's entries and rollup are frozen in place,
// never blended in. The resolution job never reads this constant — it only
// ever acts on whatever seriesKey is already stored on each open entry, so a
// bump needs no migration step anywhere else.
export const STRATEGY_LOGIC_VERSION: Record<StrategyId, number> = {
  "1": 1, "2": 1, "3": 1, "4": 1, "5": 1, "6": 1, "7": 1, "8": 1, "9": 1,
  "10": 1, "11": 1, "12": 1, "13": 1, "14": 1, "15": 1, "16": 1, "17": 1, "18": 1,
};

const LEDGER_TF: Timeframe = "1d"; // V1 scope — see plan for reasoning

// All strategies except the Silver-specific S9 family.
const GENERAL_STRATEGIES: StrategyId[] = ["1","2","3","4","5","6","7","8","10","11","12","13","14","15","16","17"];
// S9/S9+ mirror the UI's SI=F-only convention rather than the server's raw capability.
const S9_FAMILY: StrategyId[] = ["9","18"];

function ledgerSeriesKey(id: StrategyId, tf: Timeframe, v: number): string {
  return `${id}|${tf}|${v}`;
}

function ledgerDocId(symbol: string, id: StrategyId, tf: Timeframe, barDate: string): string {
  return `${symbol.replace(/\//g, "_")}|${id}|${tf}|${barDate}`;
}

interface SignalLedgerEntry {
  symbol: string;
  strategyId: string;
  strategyVersion: number;
  timeframe: string;
  seriesKey: string;
  direction: "BUY" | "SELL";
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
  barDate: string;
  capturedAt: string;
  maxHoldBars: number;
  status: "open" | "resolved";
  resolvedAt: string | null;
  exitPrice: number | null;
  exitReason: "SL" | "TP" | "TIMEOUT" | null;
  holdBars: number | null;
  returnPct: number | null;
  win: boolean | null;
}

// ── Capture job ──────────────────────────────────────────────────────────
// Sweeps TRADING_ASSETS x GENERAL_STRATEGIES (+ SI=F x S9_FAMILY), capturing
// one open ledger entry per (symbol, strategy) pair that fires BUY/SELL on
// the most recently closed daily bar. Mirrors the live /signals/:symbol
// route's call to generateSignal exactly, with one deliberate exception:
// news-blended strategies (3/6/12/15) are captured on price action alone —
// see the plan for the Alpha Vantage daily-budget reasoning.

export async function captureSignalsForLedger(): Promise<void> {
  const db = adminFirestore();
  if (!db) return; // degrade gracefully — same convention as every other Firestore caller in this app
  if (await getRemoteConfigFlag("signal_ledger_capture_paused")) {
    console.log("[SignalLedger] capture paused via remote config");
    return;
  }

  let captured = 0, skipped = 0, errored = 0;

  for (const asset of TRADING_ASSETS) {
    const symbol = asset.symbol;
    const strategyIds = symbol === "SI=F" ? [...GENERAL_STRATEGIES, ...S9_FAMILY] : GENERAL_STRATEGIES;
    const needsApex = strategyIds.some(s => APEX_STRATEGY_IDS.includes(s));

    let crossAssetCandles: OHLCV[] | null = null;
    let crossAssetInverse = false;
    if (needsApex) {
      const crossPair = CROSS_ASSET_PAIRS_PLUS[symbol] ?? CROSS_ASSET_PAIRS[symbol];
      if (crossPair) {
        try {
          crossAssetCandles = await fetchHistory(crossPair.symbol, LEDGER_TF);
          crossAssetInverse = crossPair.inverse;
        } catch {
          // Non-critical — APEX-family strategies just run without cross-asset confirmation this cycle.
        }
      }
    }

    for (const strategyId of strategyIds) {
      const isApex = APEX_STRATEGY_IDS.includes(strategyId);
      try {
        const signal = await generateSignal(
          symbol, LEDGER_TF, strategyId,
          0, false, [],                                  // newsSentiment/newsArticles — deliberate, see module comment above
          [],                                             // htfCandles — never needed at tf="1d" (HTF_MAP["1d"] is null)
          isApex ? crossAssetCandles : null,
          isApex ? crossAssetInverse : false,
        );
        if (!signal || signal.direction === "HOLD") { skipped++; continue; }

        const candles = await fetchHistory(symbol, LEDGER_TF); // cache hit after the first strategy for this symbol
        if (candles.length === 0) { skipped++; continue; }
        const barDate = new Date(candles[candles.length - 1].time * 1000).toISOString().slice(0, 10);
        const version = STRATEGY_LOGIC_VERSION[strategyId];

        const entry: SignalLedgerEntry = {
          symbol, strategyId, strategyVersion: version, timeframe: LEDGER_TF,
          seriesKey: ledgerSeriesKey(strategyId, LEDGER_TF, version),
          direction: signal.direction as "BUY" | "SELL",
          entryPrice: signal.entry, stopLoss: signal.stopLoss, takeProfit: signal.takeProfit,
          confidence: signal.confidence,
          barDate, capturedAt: new Date().toISOString(),
          maxHoldBars: btMaxHold(LEDGER_TF),
          status: "open",
          resolvedAt: null, exitPrice: null, exitReason: null, holdBars: null, returnPct: null, win: null,
        };

        await db.collection("signal_ledger").doc(ledgerDocId(symbol, strategyId, LEDGER_TF, barDate)).create(entry);
        captured++;
      } catch {
        // A rejected create() (already captured today) is the expected, common case —
        // treated as a non-fatal no-op either way, same as any other transient failure here.
        skipped++;
      }
    }
  }

  console.log(`[SignalLedger] capture: ${captured} captured, ${skipped} skipped, ${errored} errored`);
}

// ── Resolution job ───────────────────────────────────────────────────────
// Walks every open ledger entry, groups by symbol to fetch candles once per
// symbol regardless of how many open entries reference it, and resolves each
// via the shared checkExit() helper — the exact same hit-detection logic the
// historical backtest trusts.

export async function resolveOpenLedgerEntries(): Promise<void> {
  const db = adminFirestore();
  if (!db) return;
  if (await getRemoteConfigFlag("signal_ledger_capture_paused")) return; // shared kill switch

  const openSnap = await db.collection("signal_ledger").where("status", "==", "open").get();
  if (openSnap.empty) {
    console.log("[SignalLedger] resolve: nothing open");
    return;
  }

  const bySymbol = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  for (const doc of openSnap.docs) {
    const symbol = doc.get("symbol") as string;
    const list = bySymbol.get(symbol);
    if (list) list.push(doc);
    else bySymbol.set(symbol, [doc]);
  }

  let resolved = 0, stillOpen = 0, errored = 0;

  for (const [symbol, docs] of bySymbol) {
    let candles: OHLCV[];
    try {
      candles = await fetchHistory(symbol, LEDGER_TF);
    } catch {
      errored += docs.length;
      continue;
    }
    if (candles.length === 0) { stillOpen += docs.length; continue; }

    const dateIndex = new Map<string, number>();
    candles.forEach((c, i) => dateIndex.set(new Date(c.time * 1000).toISOString().slice(0, 10), i));

    for (const doc of docs) {
      try {
        const d = doc.data() as SignalLedgerEntry;
        const idx = dateIndex.get(d.barDate);
        if (idx === undefined) { stillOpen++; continue; } // entry's bar not in this fetch's window yet

        const result = checkExit(candles.slice(idx + 1), d.direction, d.stopLoss, d.takeProfit, d.maxHoldBars);
        if (!result) { stillOpen++; continue; } // not enough bars elapsed yet — check again next pass

        const entryPrice = d.entryPrice;
        const returnPct = Math.round((d.direction === "BUY"
          ? (result.exitPrice - entryPrice) / entryPrice
          : (entryPrice - result.exitPrice) / entryPrice) * 10000) / 100;
        const win = returnPct > 0;

        // Source-of-truth write first. If the process dies before the rollup
        // increment below, worst case is a rollup under-counted by one
        // (bounded, self-limiting) — never a double-count, because a resolved
        // entry is never re-selected by the status=="open" query again.
        await doc.ref.update({
          status: "resolved",
          resolvedAt: new Date().toISOString(),
          exitPrice: result.exitPrice,
          exitReason: result.exitReason,
          holdBars: result.holdBars,
          returnPct,
          win,
        });
        await db.collection("signal_ledger_stats").doc(d.seriesKey).set({
          trades: FieldValue.increment(1),
          wins: FieldValue.increment(win ? 1 : 0),
          sumReturnPct: FieldValue.increment(returnPct),
          lastResolvedAt: new Date().toISOString(),
        }, { merge: true });
        resolved++;
      } catch (e) {
        console.error(`[SignalLedger] resolve failed for ${doc.id}:`, e);
        errored++;
      }
    }
  }

  console.log(`[SignalLedger] resolve: ${resolved} resolved, ${stillOpen} still open, ${errored} errored`);
}

// ── Scheduling ───────────────────────────────────────────────────────────
// Mirrors trading.ts's BacktestWarm/AdvCorrelationWarm shape exactly (boot
// setTimeout + isLeader()-gated nightly setInterval), staggered after both:
// capture at 00:25 UTC (20 min after BacktestWarm's 00:05 slot), resolution
// at 00:40 UTC (15 min after capture, giving its writes room to land first).
// Boot offsets take the next slots after BacktestWarm's 2 min / AdvCorrelation
// Warm's 2.5 min. Called once, explicitly, from trading.ts — not fired as an
// import side effect — so it's easy to find and disable.

export function startSignalLedgerJobs(): void {
  setTimeout(() => {
    if (!isLeader()) { console.log("[SignalLedger] skipping startup capture — follower"); return; }
    captureSignalsForLedger().catch(e => console.error("[SignalLedger] startup capture failed:", e));
  }, 3 * 60_000);

  setTimeout(() => {
    if (!isLeader()) { console.log("[SignalLedger] skipping startup resolve — follower"); return; }
    resolveOpenLedgerEntries().catch(e => console.error("[SignalLedger] startup resolve failed:", e));
  }, 3.5 * 60_000);

  scheduleAtUtc(0, 25, () => {
    if (isLeader()) captureSignalsForLedger().catch(e => console.error("[SignalLedger] nightly capture failed:", e));
  });
  scheduleAtUtc(0, 40, () => {
    if (isLeader()) resolveOpenLedgerEntries().catch(e => console.error("[SignalLedger] nightly resolve failed:", e));
  });
}

function scheduleAtUtc(hour: number, minute: number, fn: () => void): void {
  const now = new Date();
  const next = new Date();
  next.setUTCHours(hour, minute, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  setTimeout(() => {
    fn();
    setInterval(fn, 24 * 60 * 60_000);
  }, next.getTime() - now.getTime());
}
