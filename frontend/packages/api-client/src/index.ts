import type { z } from "zod";
import {
  BacktestResponse,
  BestSetupsResponse,
  BondsResponse,
  BriefingResponse,
  ChartResponse,
  CongressTradesResponse,
  CorrelationResponse,
  CotResponse,
  CrisesResponse,
  EarningsResponse,
  EconomyEventsResponse,
  FearGreedResponse,
  FuturesResponse,
  HeatmapResponse,
  HouseTradesResponse,
  InstitutionalFlowResponse,
  MoversResponse,
  MULTIBAGGER_COUNTRIES,
  NewsResponse,
  OgeResponse,
  QuiverResponse,
  QuotesResponse,
  RegimeSummaryResponse,
  ScannerResponse,
  SearchResponse,
  SectorBestSetupsResponse,
  SectorsResponse,
  TariffsResponse,
  TradingSignal,
  TreemapResponse,
  UsaDebtResponse,
  VolatilityAssetsResponse,
  YieldCurveHistoryResponse,
  type ChartRange,
  type InstitutionalFlowType,
  type MultibaggerCountry,
  type ScannerVersion,
  type TreemapIndexParam,
  type TreemapTimeframe,
} from "@monysa/contracts";

/** Power Moves version → scanner endpoint path. */
const SCANNER_PATHS: Record<ScannerVersion, string> = {
  v1: "/api/trading/scanner/10x/assets",
  v2: "/api/trading/scanner/10x-v2/assets",
  v3: "/api/trading/scanner/10x-v3/assets",
  v3c: "/api/trading/scanner/10x-v3/commodities",
  v3f: "/api/trading/scanner/10x-v3/forex",
  v3crypto: "/api/trading/scanner/10x-v3/crypto",
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly path?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiClientOptions {
  /** e.g. http://localhost:5001 or https://monysa-api.fly.dev */
  baseUrl: string;
  fetchFn?: typeof fetch;
}

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function createApiClient(opts: ApiClientOptions) {
  const fetchFn = opts.fetchFn ?? fetch;
  const baseUrl = opts.baseUrl.replace(/\/$/, "");

  async function get<S extends z.ZodTypeAny>(
    path: string,
    schema: S,
  ): Promise<z.infer<S>> {
    // Plain GET with no custom headers — keeps requests "simple" (no CORS
    // preflight) and lets the browser HTTP cache drive ETag/304 revalidation.
    const res = await fetchFn(`${baseUrl}${path}`);
    if (!res.ok) {
      let code: string | undefined;
      let message = `${res.status} ${res.statusText}`;
      try {
        const body = (await res.json()) as { error?: string; code?: string };
        if (body.error) message = body.error;
        code = body.code;
      } catch {
        // non-JSON error body
      }
      throw new ApiError(message, res.status, code, path);
    }
    return schema.parse(await res.json());
  }

  async function post<S extends z.ZodTypeAny>(
    path: string,
    body: unknown,
    schema: S,
  ): Promise<z.infer<S>> {
    const res = await fetchFn(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new ApiError(`${res.status} ${res.statusText}`, res.status, undefined, path);
    }
    return schema.parse(await res.json());
  }

  return {
    // ── Markets ──────────────────────────────────────────────────────────
    getIndices: () => get("/api/futures/indices", FuturesResponse),
    getCommodities: () => get("/api/futures/commodities", FuturesResponse),
    getForex: () => get("/api/futures/forex", FuturesResponse),
    getChart: (symbol: string, range: ChartRange = "3mo") =>
      get(`/api/chart/${encodeURIComponent(symbol)}${qs({ range })}`, ChartResponse),
    getTreemap: (
      index: TreemapIndexParam,
      timeframe: TreemapTimeframe = "1d",
      limit = 500,
    ) =>
      get(`/api/heatmap/treemap${qs({ index, timeframe, limit })}`, TreemapResponse),
    getHeatmap: () => get("/api/heatmap", HeatmapResponse),

    getCotMetals: () => get("/api/futures/cot-metals", CotResponse),
    getMovers: (index: TreemapIndexParam = "sp500") =>
      get(`/api/heatmap/movers${qs({ index })}`, MoversResponse),

    // ── Trading ──────────────────────────────────────────────────────────
    getQuotes: () => get("/api/trading/quotes", QuotesResponse),
    /** strategy must be the serverParam "1"–"9" — never "S1". */
    getSignal: (symbol: string, strategy: string = "1") =>
      get(
        `/api/trading/signals/${encodeURIComponent(symbol)}${qs({ strategy })}`,
        TradingSignal,
      ),
    getScannerAssets: (version: ScannerVersion) =>
      get(SCANNER_PATHS[version], ScannerResponse),
    getMultibaggers: (country: MultibaggerCountry, version: "v1" | "v2") => {
      const entry = MULTIBAGGER_COUNTRIES.find((c) => c.param === country);
      const path = entry?.scannerPath ?? "stocks";
      const prefix = version === "v2" ? "10x-v2" : "10x";
      return get(`/api/trading/scanner/${prefix}/${path}`, ScannerResponse);
    },
    getBestSetups: (version: "v1" | "v2", type = "assets", minWinRate?: number) =>
      get(
        `/api/trading/scanner/best-setups${qs({ version, type, minWinRate })}`,
        BestSetupsResponse,
      ),
    getSectorBestSetups: (version: "v1" | "v2") =>
      get(`/api/trading/best-setups-sector${qs({ version })}`, SectorBestSetupsResponse),
    getInstitutionalFlow: (type: InstitutionalFlowType = "accumulation") =>
      get(
        `/api/trading/scanner/institutional-flow${qs({ type })}`,
        InstitutionalFlowResponse,
      ),
    getRegimeSummary: () =>
      get("/api/trading/regime-summary", RegimeSummaryResponse),
    getEarningsCalendar: (days = 15) =>
      get(`/api/trading/earnings-calendar${qs({ days })}`, EarningsResponse),
    getBacktest: (symbol: string) =>
      get(`/api/trading/backtest/${encodeURIComponent(symbol)}`, BacktestResponse),
    getNews: (symbol: string) =>
      get(`/api/trading/news/${encodeURIComponent(symbol)}`, NewsResponse),
    search: (q: string) => get(`/api/search${qs({ q })}`, SearchResponse),
    getCorrelation: () => get("/api/trading/correlation", CorrelationResponse),

    // ── Macro ────────────────────────────────────────────────────────────
    getVolatilityAssets: () =>
      get("/api/volatility/assets", VolatilityAssetsResponse),
    getFearGreed: () => get("/api/volatility/fear-greed", FearGreedResponse),
    getBonds: () => get("/api/bonds", BondsResponse),
    getSectors: () => get("/api/sectors", SectorsResponse),
    getCrises: () => get("/api/crises", CrisesResponse),
    getEconomyEvents: () => get("/api/economy/events", EconomyEventsResponse),
    getYieldCurveHistory: () =>
      get("/api/economy/yield-curve-history", YieldCurveHistoryResponse),
    getUsaDebt: () => get("/api/usa-debt", UsaDebtResponse),
    /** params mirror mobile: vix, vixBand, goldPct1M, oilPct1M, dxyPct1M… */
    postBriefing: (params: Record<string, unknown>) =>
      post("/api/volatility/briefing", params, BriefingResponse),

    // ── Investing ────────────────────────────────────────────────────────
    getTariffs: () => get("/api/tariffs", TariffsResponse),
    getQuiverCongress: () => get("/api/quiver/congress", QuiverResponse),
    getQuiverLobbying: () => get("/api/quiver/lobbying", QuiverResponse),
    getQuiverInsider: () => get("/api/quiver/insider", QuiverResponse),
    getCongressTrades: (memberName?: string) =>
      get(`/api/quiver/congress-trades${qs({ memberName })}`, CongressTradesResponse),
    getHouseTrades: () => get("/api/house-trades", HouseTradesResponse),
    getOgeTransactions: () =>
      get("/api/oge/trump-transactions", OgeResponse),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
