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

/** UI display "S1"–"S9"; always send serverParam ("1"–"9") to the API.
    S9 ("Silver Liquidity Sweep") applies to SI=F only — mirror mobile and
    filter the asset list to silver when S9 is selected. */
export const STRATEGIES = Array.from({ length: 9 }, (_, i) => ({
  label: `S${i + 1}`,
  serverParam: String(i + 1),
})) as ReadonlyArray<{ label: string; serverParam: string }>;
export type Strategy = (typeof STRATEGIES)[number];
