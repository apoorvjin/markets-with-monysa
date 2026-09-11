/**
 * server/lib/premarket-sector-notifier.ts
 * Pre-market "which sectors are gaining" trigger, registered into the
 * generic broadcast engine (see broadcast-notifier.ts) — two triggers per
 * market per trading day (early pre-market, near-open).
 *
 * Timing is ratio-based, not a flat "+60min": the US's literal 1hr-after-
 * pre-market-start / 1hr-before-open spec only works because the US has a
 * 5.5-hour pre-market window. Every other market's pre-market window is far
 * shorter (India: 15min, Hong Kong/Taiwan: ~30min, South Korea/UK/Europe:
 * ~60min) — a flat +60min offset would land at or after the market has
 * already opened. Instead, both trigger instants are fixed percentages of
 * EACH market's own window, with the percentages derived from the US's
 * literal numbers so the US reproduces the original spec exactly. See the
 * approved plan (2026-09) for the full derivation and per-market table.
 *
 * NOTE: notification copy below is a placeholder pending mockup sign-off —
 * see the mockup artifact shared alongside this change.
 */

import { registerBroadcastTrigger } from "./broadcast-notifier";
import { fetchYahooQuoteSummaryBatch, fetchSp500Constituents } from "../routes/heatmap";
import {
  NDX_SYMBOLS,
  DJI_SYMBOLS,
  RUSSELL2000_SYMBOLS,
  DAX40_SYMBOLS,
  EUROSTOXX50_SYMBOLS,
  NIFTY50_SYMBOLS,
  HSI_SYMBOLS,
  KOSPI_SYMBOLS,
  TAIEX_SYMBOLS,
  FTSE100_SYMBOLS,
} from "../data/index_constituents";

// US: 60min after a 04:00 start, 60min before a 09:30 open, over a 330min window.
const EARLY_RATIO = 60 / 330;
const LATE_RATIO = (330 - 60) / 330;

const POLL_INTERVAL_MS = 5 * 60_000;
const TOLERANCE_MIN = 5;
const TOP_N = 3;

/** Pure — no I/O. Minutes-since-local-midnight for each trigger, given a market's own pre-market window. */
export function computeTriggerMinutes(
  preMarketStartMin: number,
  regularOpenMin: number,
): { early: number; late: number } {
  const windowMin = regularOpenMin - preMarketStartMin;
  return {
    early: Math.round(preMarketStartMin + windowMin * EARLY_RATIO),
    late: Math.round(preMarketStartMin + windowMin * LATE_RATIO),
  };
}

export interface SectorStock {
  sector: string | null;
  marketCap: number | null;
  preMarketChangePercent: number | null;
}

export interface SectorGain {
  sector: string;
  changePct: number;
}

/**
 * Pure — no I/O. Market-cap-weighted average pre-market % change per sector,
 * ranked descending. Stocks with no resolved sector are dropped, not bucketed
 * as "Unknown" — that reads as meaningless (or worse, misleading) in a push
 * ("Unknown leading +1.5%") and confirmed live 2026-09-09: enough of the
 * ~580-symbol US universe fails Yahoo's per-stock assetProfile sector lookup
 * that an "Unknown" bucket outranked every real sector by weighted %.
 */
export function aggregateSectorGainers(stocks: SectorStock[], topN = TOP_N): SectorGain[] {
  const bySector = new Map<string, { weightedSum: number; capSum: number }>();
  for (const s of stocks) {
    if (s.marketCap == null || s.preMarketChangePercent == null || s.marketCap <= 0) continue;
    if (!s.sector) continue;
    const entry = bySector.get(s.sector) ?? { weightedSum: 0, capSum: 0 };
    entry.weightedSum += s.preMarketChangePercent * s.marketCap;
    entry.capSum += s.marketCap;
    bySector.set(s.sector, entry);
  }
  const results: SectorGain[] = [];
  for (const [sector, { weightedSum, capSum }] of bySector) {
    results.push({ sector, changePct: weightedSum / capSum });
  }
  results.sort((a, b) => b.changePct - a.changePct);
  return results.slice(0, topN);
}

/** Pure — no I/O. "" dateKey means weekend (skip). */
export function nowInMarketTz(tz: string, now: Date = new Date()): { dateKey: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = get("weekday");
  const isWeekend = weekday === "Sat" || weekday === "Sun";
  const dateKey = isWeekend ? "" : `${get("year")}-${get("month")}-${get("day")}`;
  const hour = Number(get("hour")) % 24; // Intl reports midnight as "24"
  const minute = Number(get("minute"));
  return { dateKey, minutes: hour * 60 + minute };
}

export interface MarketConfig {
  id: string;
  label: string;
  flag: string;
  tz: string;
  preMarketStartMin: number;
  regularOpenMin: number;
  getSymbols: () => Promise<string[]>;
  /**
   * Optional symbol -> sector hints from a source better than Yahoo's
   * per-stock assetProfile lookup, which is failure-prone at this batch size
   * (confirmed live 2026-09-09: enough S&P 500 names came back with no sector
   * that an "Unknown" bucket outranked every real one). Only "us" sets this,
   * reusing the sector already present in the S&P 500 CSV — free, reliable,
   * and covers the largest chunk of the combined universe. A hint always
   * wins over Yahoo's own value for that symbol.
   */
  getSectorHints?: () => Promise<Map<string, string>>;
  /**
   * Optional per-market source for pre-market % change, for exchanges where
   * Yahoo's `preMarketChangePercent` is structurally always null. Confirmed
   * 2026-09-09 after 3 real trading days: every call-auction market (India,
   * HK, Taiwan, Korea, UK, Europe) returns null there, because those
   * pre-opens accumulate orders without executing — there is no traded price
   * for Yahoo to report. Only the US's continuously-quoted ECN pre-market
   * works out of the box.
   *
   * Returns symbol -> % change, keyed by the SAME symbol form `getSymbols()`
   * uses, and replaces Yahoo's value for matching symbols. Sector and market
   * cap still come from Yahoo (those work fine everywhere) — this only fills
   * the one field that doesn't.
   */
  getPreMarketChanges?: () => Promise<Map<string, number>>;
}

function dedupe(symbols: string[]): string[] {
  return Array.from(new Set(symbols));
}

/**
 * NSE's own pre-open endpoint — the alternative source for India, since Yahoo
 * never populates `preMarketChangePercent` for it (call-auction pre-open, no
 * executions before the 9:15 open). NSE publishes the Indicative Equilibrium
 * Price during the 9:08-9:12 matching phase, and `pChange` on this endpoint is
 * that IEP measured against the previous close — exactly the number we want.
 *
 * Same keyless, header-only pattern as `fetchNseFiiDiiFlows()` in
 * routes/markets.ts, which has been live for the Regional Flows section — this
 * is NSE's unofficial-but-public site API, so it fails soft (empty map) rather
 * than throwing if the shape changes or anti-bot tightens.
 *
 * Returns Yahoo-suffixed symbols (`RELIANCE` -> `RELIANCE.NS`) so it joins
 * against `NIFTY50_SYMBOLS` without a translation layer at the call site.
 */
export async function fetchNsePreOpenChanges(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    // `key=ALL` — NOT `key=NIFTY`, which is not a valid value and silently
    // returns {"data":[],"msg":"No Data Found"} at HTTP 200 forever. That cost
    // a full India window on 2026-09-10 before the logging below made it
    // obvious. Valid keys seen: ALL / FO / OTHERS / SME (also BANKNIFTY and
    // NIFTY, both of which return the same empty no-data body). `ALL` is
    // ~2,200 rows covering every NSE equity; the caller joins against its own
    // universe, so no server-side filtering is needed.
    const resp = await fetch("https://www.nseindia.com/api/market-data-pre-open?key=ALL", {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) {
      console.log(`[nse-preopen] HTTP ${resp.status} — no pre-open changes this tick`);
      return out;
    }
    const raw = (await resp.json()) as {
      data?: { metadata?: { symbol?: string; pChange?: number } }[];
      msg?: string;
    };
    const rows = raw.data ?? [];
    for (const row of rows) {
      const symbol = row.metadata?.symbol;
      const pChange = row.metadata?.pChange;
      if (!symbol || typeof pChange !== "number" || !Number.isFinite(pChange)) continue;
      out.set(`${symbol}.NS`, pChange);
    }
    if (out.size === 0) {
      // Distinguishable from a thrown error, which logs separately below —
      // the previous version swallowed both into an indistinguishable zero.
      console.log(`[nse-preopen] 0 usable rows from ${rows.length} returned${raw.msg ? ` (msg: ${raw.msg})` : ""}`);
    }
  } catch (e) {
    console.log(`[nse-preopen] fetch failed: ${(e as Error).name} ${(e as Error).message}`);
  }
  return out;
}

/**
 * TWSE's MIS (Market Information System) quote feed — the alternative source
 * candidate for Taiwan. TWSE documents disclosing *simulated* transaction
 * prices roughly every 5 seconds during the 08:30-09:00 opening call auction,
 * which is exactly the indicative number we want; this endpoint is the one
 * TWSE's own site uses, and it's free and keyless.
 *
 * UNPROVEN: whether `z` (last price) actually carries that simulated price
 * during the auction, or just echoes the previous session's close. The `d`
 * (date) field settles it at runtime — a row is only used when its date
 * matches today in Taipei, so a stale echo is rejected and the trigger stays
 * silent rather than publishing a fabricated 0%-everywhere reading. Verified
 * 2026-09-11 (weekend): rows come back with `d: 20260911`, correctly rejected.
 */
export async function fetchTwseAuctionChanges(now: Date = new Date()): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const today = nowInMarketTz("Asia/Taipei", now).dateKey.replace(/-/g, ""); // YYYYMMDD
  if (!today) return out; // weekend

  // MIS takes pipe-separated channels; chunked to keep each URL sane.
  const CHUNK = 20;
  const codes = TAIEX_SYMBOLS.map((s) => s.replace(/\.TW$/i, ""));
  for (let i = 0; i < codes.length; i += CHUNK) {
    const chunk = codes.slice(i, i + CHUNK);
    const exCh = chunk.map((c) => `tse_${c}.tw`).join("|");
    try {
      const resp = await fetch(
        `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(exCh)}&json=1&delay=0`,
        {
          headers: {
            Accept: "application/json",
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          },
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!resp.ok) {
        console.log(`[twse-auction] HTTP ${resp.status} on chunk ${i / CHUNK}`);
        continue;
      }
      const raw = (await resp.json()) as {
        msgArray?: { c?: string; z?: string; y?: string; d?: string }[];
      };
      let stale = 0;
      for (const row of raw.msgArray ?? []) {
        const code = row.c;
        if (!code) continue;
        if (row.d !== today) {
          stale++;
          continue; // previous session's echo — not an auction price
        }
        const last = Number(row.z);
        const prevClose = Number(row.y);
        if (!Number.isFinite(last) || !Number.isFinite(prevClose) || prevClose <= 0) continue;
        out.set(`${code}.TW`, ((last - prevClose) / prevClose) * 100);
      }
      if (stale > 0) {
        console.log(`[twse-auction] ${stale} rows rejected as stale (not dated ${today}) in chunk ${i / CHUNK}`);
      }
    } catch (e) {
      console.log(`[twse-auction] fetch failed: ${(e as Error).name} ${(e as Error).message}`);
    }
  }
  return out;
}

/**
 * Naver Finance's polling feed — the alternative source candidate for Korea.
 * Keyless, batches via comma-separated codes, and carries an
 * `overMarketPriceInfo` block with its OWN `fluctuationsRatio` for the
 * extended session, which is the number we want during KRX's 08:00-09:00
 * pre-market. Verified reachable from Fly (not geo-blocked) 2026-09-11.
 *
 * UNPROVEN: what `tradingSessionType` reads during the real pre-market.
 * Observed `AFTER_MARKET` outside hours. Rather than guess the pre-market
 * enum value, the guard is negative — reject AFTER_MARKET, require the quote
 * to be dated today in Seoul — and the actual value is logged, so one real
 * window tells us the truth instead of another round of speculation.
 */
export async function fetchNaverPreMarketChanges(now: Date = new Date()): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const today = nowInMarketTz("Asia/Seoul", now).dateKey; // YYYY-MM-DD, "" on weekends
  if (!today) return out;

  const codes = KOSPI_SYMBOLS.map((s) => s.replace(/\.KS$/i, ""));
  const CHUNK = 12;
  const seenSessionTypes = new Set<string>();
  for (let i = 0; i < codes.length; i += CHUNK) {
    const chunk = codes.slice(i, i + CHUNK);
    try {
      const resp = await fetch(
        `https://polling.finance.naver.com/api/realtime/domestic/stock/${chunk.join(",")}`,
        {
          headers: {
            Accept: "application/json",
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            Referer: "https://finance.naver.com/",
          },
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!resp.ok) {
        console.log(`[naver-premarket] HTTP ${resp.status} on chunk ${i / CHUNK}`);
        continue;
      }
      const raw = (await resp.json()) as {
        datas?: {
          itemCode?: string;
          overMarketPriceInfo?: {
            tradingSessionType?: string;
            fluctuationsRatio?: string;
            localTradedAt?: string;
          };
        }[];
      };
      for (const row of raw.datas ?? []) {
        const code = row.itemCode;
        const omp = row.overMarketPriceInfo;
        if (!code || !omp) continue;
        if (omp.tradingSessionType) seenSessionTypes.add(omp.tradingSessionType);
        // Negative guard: anything but the after-hours session, dated today.
        if (omp.tradingSessionType === "AFTER_MARKET") continue;
        if (!omp.localTradedAt?.startsWith(today)) continue;
        const ratio = Number(omp.fluctuationsRatio);
        if (!Number.isFinite(ratio)) continue;
        out.set(`${code}.KS`, ratio);
      }
    } catch (e) {
      console.log(`[naver-premarket] fetch failed: ${(e as Error).name} ${(e as Error).message}`);
    }
  }
  if (out.size === 0 && seenSessionTypes.size > 0) {
    console.log(`[naver-premarket] 0 usable rows — observed tradingSessionType(s): ${[...seenSessionTypes].join(", ")}`);
  }
  return out;
}

// Exported so scripts/premarket-sector-dryrun.ts can exercise the exact same
// market definitions the live triggers use — no separate, driftable copy.
export const MARKETS: MarketConfig[] = [
  {
    id: "us",
    label: "US",
    flag: "🇺🇸",
    tz: "America/New_York",
    preMarketStartMin: 4 * 60,
    regularOpenMin: 9 * 60 + 30,
    getSymbols: async () => {
      const sp500 = (await fetchSp500Constituents()).map((c) => c.symbol);
      return dedupe([...sp500, ...NDX_SYMBOLS, ...DJI_SYMBOLS, ...RUSSELL2000_SYMBOLS]);
    },
    getSectorHints: async () => {
      const sp500 = await fetchSp500Constituents();
      const hints = new Map<string, string>();
      for (const c of sp500) if (c.sector) hints.set(c.symbol, c.sector);
      return hints;
    },
  },
  {
    id: "india",
    label: "India",
    flag: "🇮🇳",
    tz: "Asia/Kolkata",
    preMarketStartMin: 9 * 60,
    regularOpenMin: 9 * 60 + 15,
    getSymbols: async () => NIFTY50_SYMBOLS,
    // Yahoo never populates preMarketChangePercent for NSE — NSE's own
    // pre-open IEP feed is the working source. See fetchNsePreOpenChanges().
    getPreMarketChanges: fetchNsePreOpenChanges,
  },
  {
    id: "hongkong",
    label: "Hong Kong",
    flag: "🇭🇰",
    tz: "Asia/Hong_Kong",
    preMarketStartMin: 9 * 60,
    regularOpenMin: 9 * 60 + 30,
    getSymbols: async () => HSI_SYMBOLS,
  },
  {
    id: "taiwan",
    label: "Taiwan",
    flag: "🇹🇼",
    tz: "Asia/Taipei",
    // TWSE's official pre-opening order-entry period runs 08:00-08:30, THEN a
    // call auction 08:30-09:00 sets the open — the real pre-market window is
    // 08:00-09:00 (60min), not just the 08:30-09:00 auction leg.
    preMarketStartMin: 8 * 60,
    regularOpenMin: 9 * 60,
    getSymbols: async () => TAIEX_SYMBOLS,
    // Yahoo never populates preMarketChangePercent for TWSE. MIS *may* carry
    // the auction's simulated price — guarded by a same-day date check so a
    // stale echo can't produce a fake reading. See fetchTwseAuctionChanges().
    getPreMarketChanges: () => fetchTwseAuctionChanges(),
  },
  {
    id: "southkorea",
    label: "South Korea",
    flag: "🇰🇷",
    tz: "Asia/Seoul",
    preMarketStartMin: 8 * 60,
    regularOpenMin: 9 * 60,
    getSymbols: async () => KOSPI_SYMBOLS,
    // Yahoo never populates preMarketChangePercent for KRX. Naver Finance's
    // overMarketPriceInfo may carry the pre-market move — guarded so an
    // after-hours echo can't leak through. See fetchNaverPreMarketChanges().
    getPreMarketChanges: () => fetchNaverPreMarketChanges(),
  },
  {
    id: "uk",
    label: "UK",
    flag: "🇬🇧",
    tz: "Europe/London",
    // LSE's own "Pre-Trading Session" officially starts 05:05, well before
    // the 07:50-08:00 opening auction call — not 07:00 as originally guessed.
    preMarketStartMin: 5 * 60 + 5,
    regularOpenMin: 8 * 60,
    getSymbols: async () => FTSE100_SYMBOLS,
  },
  {
    id: "europe",
    label: "Europe",
    flag: "🇩🇪",
    tz: "Europe/Berlin",
    preMarketStartMin: 8 * 60,
    regularOpenMin: 9 * 60,
    getSymbols: async () => dedupe([...DAX40_SYMBOLS, ...EUROSTOXX50_SYMBOLS]),
  },
];

function pctText(changePct: number): string {
  return `${changePct >= 0 ? "+" : ""}${changePct.toFixed(1)}%`;
}

/** Style A (early trigger): "🇺🇸 US Pre-Market · Sectors Update" / "Technology leading (+1.8%) · Energy +1.2% · Financials +0.6%" */
function formatEarly(market: MarketConfig, gainers: SectorGain[]): { title: string; body: string } {
  const [first, ...rest] = gainers;
  const restText = rest.map((g) => `${g.sector} ${pctText(g.changePct)}`).join(" · ");
  return {
    title: `${market.flag} ${market.label} Pre-Market · Sectors Update`,
    body: `${first.sector} leading (${pctText(first.changePct)})${restText ? ` · ${restText}` : ""}`,
  };
}

/** Style D (near-open trigger): "🇺🇸 US opens in 1 hour" / "Sectors leading premarket: Technology +1.8%, Energy +1.2%, Financials +0.6%" */
function formatNearOpen(market: MarketConfig, gainers: SectorGain[], minutesUntilOpen: number): { title: string; body: string } {
  const countdown = minutesUntilOpen >= 55 ? "in 1 hour" : `in ${Math.max(1, minutesUntilOpen)} min`;
  const sectorText = gainers.map((g) => `${g.sector} ${pctText(g.changePct)}`).join(", ");
  return {
    title: `${market.flag} ${market.label} opens ${countdown}`,
    body: `Sectors leading premarket: ${sectorText}`,
  };
}

function registerMarketTrigger(market: MarketConfig, which: "early" | "late", targetMin: number): void {
  registerBroadcastTrigger({
    id: `premarket-sectors-${market.id}-${which}`,
    intervalMs: POLL_INTERVAL_MS,
    check: async () => {
      const { dateKey, minutes } = nowInMarketTz(market.tz);
      if (!dateKey) return null; // weekend
      if (Math.abs(minutes - targetMin) > TOLERANCE_MIN) return null;

      const symbols = await market.getSymbols();
      const [quotes, sectorHints, changeOverrides] = await Promise.all([
        fetchYahooQuoteSummaryBatch(symbols, { includeAssetProfile: true }),
        market.getSectorHints?.() ?? Promise.resolve(new Map<string, string>()),
        market.getPreMarketChanges?.() ?? Promise.resolve(new Map<string, number>()),
      ]);
      const stocks: SectorStock[] = Array.from(quotes.entries()).map(([symbol, q]) => ({
        sector: sectorHints.get(symbol) ?? q.sector,
        marketCap: q.marketCap,
        preMarketChangePercent: changeOverrides.get(symbol) ?? q.preMarketChangePercent,
      }));
      const gainers = aggregateSectorGainers(stocks);
      if (gainers.length === 0) {
        const withPreMarketData = stocks.filter((s) => s.preMarketChangePercent != null).length;
        const withSector = stocks.filter((s) => s.sector != null).length;
        console.log(
          `[premarket-sector] ${market.id}-${which}: in window (${dateKey} ${minutes}min) but no gainers — ${withPreMarketData}/${quotes.size} symbols had preMarketChangePercent (${changeOverrides.size} from an alternative source), ${withSector}/${quotes.size} had a sector`,
        );
        return null;
      }

      const { title, body } =
        which === "early"
          ? formatEarly(market, gainers)
          : formatNearOpen(market, gainers, market.regularOpenMin - minutes);

      return {
        state: `${dateKey}:${market.id}:${which}`,
        title,
        body,
        data: { market: market.id, phase: which, sectors: JSON.stringify(gainers) },
      };
    },
  });
}

export function registerPremarketSectorTriggers(): void {
  for (const market of MARKETS) {
    const { early, late } = computeTriggerMinutes(market.preMarketStartMin, market.regularOpenMin);
    registerMarketTrigger(market, "early", early);
    registerMarketTrigger(market, "late", late);
  }
}
