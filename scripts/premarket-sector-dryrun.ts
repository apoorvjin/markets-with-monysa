/**
 * Dry-run for the pre-market sector-gainers trigger. Run anytime with:
 *   npx tsx --env-file=.env scripts/premarket-sector-dryrun.ts <marketId>
 *   npx tsx --env-file=.env scripts/premarket-sector-dryrun.ts        (lists valid ids)
 *
 * Read-only — makes no writes, sends no FCM push. Bypasses the clock-window
 * gate in premarket-sector-notifier.ts entirely (so it runs regardless of
 * what time it is) and calls the real Yahoo fetch + aggregateSectorGainers()
 * directly, using the exact same MARKETS config the live triggers use.
 *
 * Exists to answer two things without waiting on a scheduled fire or a real
 * push: (1) does the sector math look sane for a given market right now, and
 * (2) critically, is `preMarketChangePercent` actually populated by Yahoo for
 * non-US tickers — unconfirmed as of 2026-09, see CLAUDE.md's
 * premarket-sector-notifier.ts entry. Run this DURING a market's real
 * pre-open window (not just any time) to get a meaningful answer to (2).
 */
import { MARKETS, aggregateSectorGainers, nowInMarketTz, type SectorStock } from "../server/lib/premarket-sector-notifier";
import { fetchYahooQuoteSummaryBatch } from "../server/routes/heatmap";

async function main() {
  const marketId = process.argv[2];
  const market = MARKETS.find((m) => m.id === marketId);
  if (!market) {
    console.error(`Usage: npx tsx --env-file=.env scripts/premarket-sector-dryrun.ts <marketId>`);
    console.error(`Valid ids: ${MARKETS.map((m) => m.id).join(", ")}`);
    process.exit(1);
  }

  const { dateKey, minutes } = nowInMarketTz(market.tz);
  console.log(`${market.flag} ${market.label} (${market.tz})`);
  console.log(`  now: ${dateKey || "WEEKEND"} ${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")} local`);
  console.log(`  pre-market window: ${fmt(market.preMarketStartMin)}–${fmt(market.regularOpenMin)}`);

  const symbols = await market.getSymbols();
  console.log(`  universe: ${symbols.length} symbols`);

  console.log(`  fetching live quotes from Yahoo...`);
  const quotes = await fetchYahooQuoteSummaryBatch(symbols, { includeAssetProfile: true });
  console.log(`  resolved: ${quotes.size}/${symbols.length}`);

  const marketStateCounts = new Map<string, number>();
  let withPreMarketPct = 0;
  let withRegularPct = 0;
  for (const q of quotes.values()) {
    const state = q.marketState ?? "null";
    marketStateCounts.set(state, (marketStateCounts.get(state) ?? 0) + 1);
    if (q.preMarketChangePercent != null) withPreMarketPct++;
    if (q.changePercent != null) withRegularPct++;
  }
  console.log(`  marketState breakdown: ${JSON.stringify(Object.fromEntries(marketStateCounts))}`);
  console.log(`  preMarketChangePercent populated: ${withPreMarketPct}/${quotes.size}`);
  console.log(`  regularMarket changePercent populated: ${withRegularPct}/${quotes.size}`);

  const preMarketStocks: SectorStock[] = Array.from(quotes.values()).map((q) => ({
    sector: q.sector,
    marketCap: q.marketCap,
    preMarketChangePercent: q.preMarketChangePercent,
  }));
  const preMarketGainers = aggregateSectorGainers(preMarketStocks);

  console.log(`\n  --- sector gainers, PRE-MARKET field (what the real trigger uses) ---`);
  if (preMarketGainers.length === 0) {
    console.log(`  (none — preMarketChangePercent is null/missing for every stock in this universe right now)`);
  } else {
    for (const g of preMarketGainers) console.log(`  ${g.sector}: ${g.changePct >= 0 ? "+" : ""}${g.changePct.toFixed(2)}%`);
  }

  // Fallback view using regular changePercent, purely to sanity-check the
  // weighting math independent of whether pre-market data exists right now.
  const regularStocks: SectorStock[] = Array.from(quotes.values()).map((q) => ({
    sector: q.sector,
    marketCap: q.marketCap,
    preMarketChangePercent: q.changePercent,
  }));
  const regularGainers = aggregateSectorGainers(regularStocks);
  console.log(`\n  --- sector gainers, REGULAR-SESSION field (sanity check only, NOT what ships) ---`);
  for (const g of regularGainers) console.log(`  ${g.sector}: ${g.changePct >= 0 ? "+" : ""}${g.changePct.toFixed(2)}%`);

  if (preMarketGainers.length === 0 && regularGainers.length > 0) {
    console.log(
      `\n  VERDICT: the aggregation math works (regular-session numbers came through fine) but preMarketChangePercent is EMPTY for this market's universe right now.`,
    );
  } else if (preMarketGainers.length > 0) {
    console.log(`\n  VERDICT: preMarketChangePercent IS populated for this market right now — the real trigger would produce a real notification.`);
  }
}

function fmt(minOfDay: number): string {
  return `${String(Math.floor(minOfDay / 60)).padStart(2, "0")}:${String(minOfDay % 60).padStart(2, "0")}`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
