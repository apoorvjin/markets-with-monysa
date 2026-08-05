import { z } from "zod";

export const QuoteItem = z
  .object({
    symbol: z.string(),
    name: z.string(),
    category: z.string(),
    flag: z.string().nullish(),
    currency: z.string().nullish(),
    price: z.number(),
    change: z.number().nullish(),
    changePercent: z.number().nullish(),
    updatedAt: z.string().nullish(),
    preMarketPrice: z.number().nullish(),
    preMarketChangePercent: z.number().nullish(),
    // "spot" = real spot feed (commodities Yahoo only serves as futures); "futures" = a =F
    // contract; null = index/crypto/forex (no tag). Drives the Trading-tab Spot/Futures chip.
    priceType: z.enum(["spot", "futures"]).nullish(),
  })
  .passthrough();
export type QuoteItem = z.infer<typeof QuoteItem>;

/** NOTE: key is `quotes`, not `items` — verified against the live server. */
export const QuotesResponse = z.object({
  quotes: z.array(QuoteItem),
  timestamp: z.string().nullish(),
});
export type QuotesResponse = z.infer<typeof QuotesResponse>;

export const SignalDirection = z.enum(["BUY", "SELL", "HOLD"]).catch("HOLD");
export type SignalDirection = z.infer<typeof SignalDirection>;

export const TradingSignal = z
  .object({
    symbol: z.string(),
    name: z.string().nullish(),
    direction: SignalDirection,
    confidence: z.number().nullish(),
    entry: z.number().nullish(),
    stopLoss: z.number().nullish(),
    takeProfit: z.number().nullish(),
    riskReward: z.number().nullish(),
    reasoning: z.array(z.string()).default([]),
    indicators: z.record(z.number().nullable()).nullish(),
    strategy: z.string().nullish(),
    timeframe: z.string().nullish(),
    timestamp: z.string().nullish(),
    ivPercentile: z.number().nullish(),
    vwap: z.number().nullable().nullish(),
    vwapDeviation: z.number().nullable().nullish(),
    vixAtSignal: z.number().nullable().nullish(),
    dynamicThreshold: z.number().nullable().nullish(),
    // Whether entry/SL/TP were computed on spot vs futures — see QuoteItem.priceType.
    priceType: z.enum(["spot", "futures"]).nullish(),
  })
  .passthrough();
export type TradingSignal = z.infer<typeof TradingSignal>;

export const NewsArticle = z
  .object({
    title: z.string(),
    publisher: z.string().nullish(),
    publishedAt: z.string().nullish(),
    // field is `url`, NOT `link`
    url: z.string(),
    sentiment: z.number().nullish(),
  })
  .passthrough();
export type NewsArticle = z.infer<typeof NewsArticle>;

export const NewsResponse = z.object({
  symbol: z.string().nullish(),
  articles: z.array(NewsArticle),
  aggregateSentiment: z.number().nullish(),
});
export type NewsResponse = z.infer<typeof NewsResponse>;

/** Official company press releases from Nasdaq (unofficial keyless endpoint). */
export const NasdaqPressRelease = z
  .object({
    title: z.string(),
    url: z.string(),
    publisher: z.string().nullish(),
    /** Coarse date string as Nasdaq gives it, e.g. "Aug 4, 2026". */
    created: z.string().nullish(),
    ago: z.string().nullish(),
    description: z.string().nullish(),
  })
  .passthrough();
export type NasdaqPressRelease = z.infer<typeof NasdaqPressRelease>;

export const NasdaqPressReleasesResponse = z.object({
  symbol: z.string().nullish(),
  items: z.array(NasdaqPressRelease),
  lastUpdated: z.string().nullish(),
});
export type NasdaqPressReleasesResponse = z.infer<typeof NasdaqPressReleasesResponse>;

/** Insider (Form 4) transaction from Nasdaq. All fields are display strings. */
export const InsiderTrade = z
  .object({
    insider: z.string(),
    relation: z.string().nullish(),
    date: z.string().nullish(),
    type: z.string().nullish(),
    ownType: z.string().nullish(),
    shares: z.string().nullish(),
    price: z.string().nullish(),
    sharesHeld: z.string().nullish(),
    url: z.string().nullish(),
  })
  .passthrough();
export type InsiderTrade = z.infer<typeof InsiderTrade>;

export const InsiderTradesResponse = z.object({
  symbol: z.string().nullish(),
  numberOfTrades: z.string().nullish(),
  numberOfSharesTraded: z.string().nullish(),
  trades: z.array(InsiderTrade),
  lastUpdated: z.string().nullish(),
});
export type InsiderTradesResponse = z.infer<typeof InsiderTradesResponse>;

/** Institutional (13F) holder from Nasdaq. */
export const InstitutionalHolder = z
  .object({
    owner: z.string(),
    date: z.string().nullish(),
    sharesHeld: z.string().nullish(),
    sharesChange: z.string().nullish(),
    sharesChangePct: z.string().nullish(),
    marketValue: z.string().nullish(),
    url: z.string().nullish(),
  })
  .passthrough();
export type InstitutionalHolder = z.infer<typeof InstitutionalHolder>;

export const InstitutionalHoldingsResponse = z.object({
  symbol: z.string().nullish(),
  sharesOutstandingPct: z.string().nullish(),
  totalHoldingsValue: z.string().nullish(),
  holders: z.array(InstitutionalHolder),
  lastUpdated: z.string().nullish(),
});
export type InstitutionalHoldingsResponse = z.infer<typeof InstitutionalHoldingsResponse>;

/** One row of Nasdaq's dividend calendar. */
export const DividendRow = z
  .object({
    symbol: z.string(),
    companyName: z.string().nullish(),
    exDate: z.string().nullish(),
    paymentDate: z.string().nullish(),
    recordDate: z.string().nullish(),
    rate: z.string().nullish(),
    annualDividend: z.string().nullish(),
    announcementDate: z.string().nullish(),
  })
  .passthrough();
export type DividendRow = z.infer<typeof DividendRow>;

export const DividendsResponse = z.object({
  date: z.string().nullish(),
  rows: z.array(DividendRow),
  lastUpdated: z.string().nullish(),
});
export type DividendsResponse = z.infer<typeof DividendsResponse>;

export const SearchResult = z
  .object({
    symbol: z.string(),
    name: z.string(),
    exchange: z.string().nullish(),
    type: z.string().nullish(),
  })
  .passthrough();
export type SearchResult = z.infer<typeof SearchResult>;

export const SearchResponse = z.object({ results: z.array(SearchResult) });
export type SearchResponse = z.infer<typeof SearchResponse>;

/** field names are `sharpe` and `trades` — not sharpeRatio/totalTrades. */
export const BacktestStrategyResult = z
  .object({
    winRate: z.number().nullish(),
    totalReturn: z.number().nullish(),
    maxDrawdown: z.number().nullish(),
    sharpe: z.number().nullish(),
    trades: z.number().nullish(),
    tradeLog: z.array(z.unknown()).nullish(),
  })
  .passthrough();
export type BacktestStrategyResult = z.infer<typeof BacktestStrategyResult>;

/** results are nested under `strategies` keyed "1"/"2"/"3". */
export const BacktestResponse = z.object({
  strategies: z.record(BacktestStrategyResult),
});
export type BacktestResponse = z.infer<typeof BacktestResponse>;

export const CorrelationResponse = z.object({
  symbols: z.array(
    z
      .object({
        symbol: z.string(),
        name: z.string(),
        flag: z.string().nullish(),
        category: z.string().nullish(),
      })
      .passthrough(),
  ),
  matrix: z.array(z.array(z.number())),
  lastUpdated: z.string().nullish(),
});
export type CorrelationResponse = z.infer<typeof CorrelationResponse>;

/** New, additive "Adv Correlation" tab — separate endpoint/contract from
    CorrelationResponse above, which is untouched. */
export const AdvCorrelationResponse = z.object({
  symbols: z.array(
    z
      .object({
        symbol: z.string(),
        name: z.string(),
        flag: z.string().nullish(),
        category: z.string().nullish(),
      })
      .passthrough(),
  ),
  matrix: z.array(z.array(z.number())),
  window: z.string().nullish(),
  cacheWarm: z.boolean().nullish(),
  staleSymbols: z.array(z.string()).nullish(),
  lastUpdated: z.string().nullish(),
});
export type AdvCorrelationResponse = z.infer<typeof AdvCorrelationResponse>;

export const AdvCorrelationHistoryResponse = z.object({
  a: z.object({ symbol: z.string() }),
  b: z.object({ symbol: z.string() }),
  points: z.array(z.object({ date: z.string(), r: z.number() })),
  windowDays: z.number(),
  lastUpdated: z.string().nullish(),
});
export type AdvCorrelationHistoryResponse = z.infer<typeof AdvCorrelationHistoryResponse>;

/** UI display "S1"–"S9"; always send serverParam ("1"–"9") to the API.
    S9 ("Silver Liquidity Sweep") applies to SI=F only — mirror mobile and
    filter the asset list to silver when S9 is selected.
    Enhanced S1+–S9+ use serverParams "10"–"18". */
// Compact descriptor shown under the S-code on the picker chips (mirrors mobile
// TradingStrategy.shortName). Full names live in /api/trading/strategies titles.
const STRATEGY_SHORT_NAMES = [
  "Core", "Vol-Adj", "News", "Dual", "Quant", "Adapt News", "APEX", "Consensus", "Silver",
] as const;

export const STRATEGIES: ReadonlyArray<{ label: string; name: string; serverParam: string; isEnhanced: boolean }> = [
  // Base strategies (S1–S9)
  ...Array.from({ length: 9 }, (_, i) => ({
    label: `S${i + 1}`,
    name: STRATEGY_SHORT_NAMES[i]!,
    serverParam: String(i + 1),
    isEnhanced: false,
  })),
  // Enhanced strategies (S1+–S9+)
  ...Array.from({ length: 9 }, (_, i) => ({
    label: `S${i + 1}+`,
    name: `${STRATEGY_SHORT_NAMES[i]!}+`,
    serverParam: String(i + 10),
    isEnhanced: true,
  })),
];
export type Strategy = (typeof STRATEGIES)[number];

export const SignalsCompareResponse = z.object({
  symbol: z.string(),
  timeframe: z.string(),
  pairs: z.array(z.object({
    baseId: z.string(),
    enhancedId: z.string(),
    base: z.unknown().nullable(),
    enhanced: z.unknown().nullable(),
  })),
  timestamp: z.string(),
});
export type SignalsCompareResponse = z.infer<typeof SignalsCompareResponse>;
