/**
 * Deterministic signal-ledger readiness check. Run anytime with:
 *   npx tsx --env-file=.env scripts/signal-ledger-status.ts
 *
 * Read-only — makes no writes. Pulls signal_ledger_stats + the open-entry
 * count from Firestore and hands them to server/lib/signal-ledger-report.ts
 * (unit tested — see server/lib/signal-ledger-report.test.ts), so the
 * filtering/math here can't silently drift the way the ad-hoc routine script
 * did on 2026-08-28.
 */
import { adminFirestore } from "../server/lib/firebase-admin";
import {
  splitByVersion,
  summarizeSeries,
  readinessVerdict,
  estimateTimeoutEta,
  type SeriesStatsDoc,
} from "../server/lib/signal-ledger-report";

const CAPTURE_START_DATE = new Date("2026-08-20T00:00:00Z"); // when v2 anchoring went live
const MAX_HOLD_BARS = 20; // 1d timeframe, see btMaxHold()

async function main() {
  const db = adminFirestore();
  if (!db) {
    console.error("No Firestore connection — check FIREBASE_SERVICE_ACCOUNT_JSON / FIRESTORE_DATABASE_ID in .env");
    process.exit(1);
  }

  const statsSnap = await db.collection("signal_ledger_stats").get();
  const docs: SeriesStatsDoc[] = statsSnap.docs.map(d => {
    const v = d.data();
    return {
      seriesKey: d.id,
      trades: v.trades ?? 0,
      wins: v.wins ?? 0,
      sumReturnPct: v.sumReturnPct ?? 0,
      exitSL: v.exitSL ?? 0,
      exitTP: v.exitTP ?? 0,
      exitTIMEOUT: v.exitTIMEOUT ?? 0,
    };
  });

  const openCountSnap = await db.collection("signal_ledger").where("status", "==", "open").count().get();
  const openCount = openCountSnap.data().count;

  const { current, legacy, maxVersion } = splitByVersion(docs);
  const rows = summarizeSeries(current);
  const verdict = readinessVerdict({ currentDocs: current });
  const legacyTrades = legacy.reduce((s, d) => s + d.trades, 0);

  console.log(`\nForward Signal Ledger — Status Check (${new Date().toISOString().slice(0, 10)})\n`);
  console.log(`Current version: v${maxVersion} | Legacy excluded: ${legacyTrades} trades across ${legacy.length} series\n`);
  console.log(`Resolved (current): ${verdict.totalTrades}  |  Still open: ${openCount}`);
  console.log(`Exits — SL: ${verdict.totalExitSL}  TP: ${verdict.totalExitTP}  TIMEOUT: ${verdict.totalExitTIMEOUT}\n`);

  console.log("Strategy | Trades | Win% | AvgReturn%");
  for (const r of rows) {
    const avg = r.avgReturnPct === null ? "⚠ BUG (>20% magnitude)" : `${r.avgReturnPct}%`;
    console.log(`  ${r.strategyId.padEnd(8)} | ${String(r.trades).padEnd(6)} | ${String(r.winRatePct).padEnd(4)} | ${avg}`);
  }

  console.log(`\nReadiness: ${verdict.ready ? "✅ READY" : "❌ NOT READY"}`);
  console.log(`  Trade volume (>=300): ${verdict.gates.tradeVolume ? "pass" : "fail"} (${verdict.totalTrades})`);
  console.log(`  Strategy breadth (>=10): ${verdict.gates.strategyBreadth ? "pass" : "fail"} (${verdict.strategyCount})`);
  console.log(`  TIMEOUT movement (>0): ${verdict.gates.timeoutMovement ? "pass" : "fail"} (${verdict.totalExitTIMEOUT})`);
  if (verdict.notes.length) console.log(`\nNotes:\n  - ${verdict.notes.join("\n  - ")}`);

  const eta = estimateTimeoutEta(CAPTURE_START_DATE, MAX_HOLD_BARS);
  console.log(`\nEarliest possible TIMEOUT completion: ~${eta.toISOString().slice(0, 10)}`);

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
