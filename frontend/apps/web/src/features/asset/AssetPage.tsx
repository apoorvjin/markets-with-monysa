import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  STRATEGIES,
  type ChartRange,
  type IndicatorPoint,
  type IndicatorSeries,
} from "@monysa/contracts";
import {
  CandlestickChart,
  OscillatorPane,
  type ChartOverlay,
  type ChartPriceLine,
} from "@monysa/charts";
import {
  Card,
  changeClass,
  Chip,
  ChipRow,
  ErrorView,
  fmtPct,
  fmtPrice,
  SignalBadge,
  Skeleton,
  SkeletonList,
  Stat,
  timeAgo,
} from "@monysa/ui";
import { api } from "../../lib/api";

const RANGES: ChartRange[] = ["1mo", "3mo", "6mo", "1y", "5y"];

// Indicator chips → server ?indicators= spec entries. Colors mirror the
// mobile in-house chart defaults (indicator_prefs_provider.dart).
const INDICATOR_CHIPS: { label: string; spec: string; color: string }[] = [
  { label: "SMA 20", spec: "sma:20", color: "#8fcbff" },
  { label: "SMA 50", spec: "sma:50", color: "#5b9cff" },
  { label: "SMA 200", spec: "sma:200", color: "#8b5cf6" },
  { label: "EMA 21", spec: "ema:21", color: "#6e7bf6" },
  { label: "BB", spec: "bb:20:2", color: "#9c88ff" },
  { label: "Pivots", spec: "pivots:classic", color: "#8b5cf6" },
  { label: "RSI", spec: "rsi:14", color: "#ffa56b" },
  { label: "MACD", spec: "macd:12:26:9", color: "#5b9cff" },
  { label: "Stoch", spec: "stoch:14:3:3", color: "#5b9cff" },
  { label: "ATR", spec: "atr:14", color: "#9c88ff" },
  { label: "ADX", spec: "adx:14", color: "#ffb84d" },
];

const isLine = (s: IndicatorSeries): s is IndicatorPoint[] =>
  Array.isArray(s) && (s.length === 0 || "value" in s[0]!);
const isPivots = (
  s: IndicatorSeries,
): s is { label: string; price: number }[] =>
  Array.isArray(s) && s.length > 0 && "price" in s[0]!;

export function AssetPage(props: { symbol: string; name?: string }) {
  const { symbol } = props;
  const [range, setRange] = useState<ChartRange>("3mo");
  // serverParam ("1"–"9") — label is for display only
  const [strategy, setStrategy] = useState(STRATEGIES[0]!);
  const [activeInds, setActiveInds] = useState<Set<string>>(new Set());
  const [showSignalLines, setShowSignalLines] = useState(true);

  const indicatorSpec = useMemo(
    () =>
      INDICATOR_CHIPS.filter((c) => activeInds.has(c.spec))
        .map((c) => c.spec)
        .join(","),
    [activeInds],
  );

  const chart = useQuery({
    queryKey: ["chart", symbol, range, indicatorSpec],
    queryFn: () => api.getChart(symbol, range, indicatorSpec || undefined),
    staleTime: 5 * 60_000,
  });

  const signal = useQuery({
    queryKey: ["signal", symbol, strategy.serverParam],
    queryFn: () => api.getSignal(symbol, strategy.serverParam),
    staleTime: 30_000,
  });

  const news = useQuery({
    queryKey: ["news", symbol],
    queryFn: () => api.getNews(symbol),
    staleTime: 10 * 60_000,
  });

  const backtest = useQuery({
    queryKey: ["backtest", symbol],
    queryFn: () => api.getBacktest(symbol),
    staleTime: 30 * 60_000,
  });

  // Server-computed indicator series → overlays / price lines / sub-panes.
  const inds = chart.data?.indicators ?? {};
  const overlays: ChartOverlay[] = [];
  const priceLines: ChartPriceLine[] = [];
  const panes: {
    key: string;
    lines: { label: string; color: string; points: IndicatorPoint[] }[];
    guides?: { value: number; color: string }[];
    range?: [number, number];
  }[] = [];

  for (const chip of INDICATOR_CHIPS) {
    const series = inds[chip.spec];
    if (!series) continue;
    const kind = chip.spec.split(":")[0];
    if ((kind === "sma" || kind === "ema") && isLine(series)) {
      overlays.push({ label: chip.label, color: chip.color, points: series });
    } else if (kind === "bb" && "upper" in series) {
      overlays.push(
        { label: "BB+", color: chip.color, points: series.upper },
        { label: "BB", color: chip.color, points: series.mid, dashed: true },
        { label: "BB-", color: chip.color, points: series.lower },
      );
    } else if (kind === "pivots" && isPivots(series)) {
      for (const p of series) {
        priceLines.push({ label: p.label, price: p.price, color: chip.color });
      }
    } else if (kind === "rsi" && isLine(series)) {
      panes.push({
        key: chip.spec,
        lines: [{ label: "RSI", color: chip.color, points: series }],
        guides: [
          { value: 70, color: "#d22b2b" },
          { value: 30, color: "#77c412" },
        ],
        range: [0, 100],
      });
    } else if (kind === "macd" && "macd" in series) {
      panes.push({
        key: chip.spec,
        lines: [
          { label: "MACD", color: "#5b9cff", points: series.macd },
          { label: "Signal", color: "#ffa56b", points: series.signal },
        ],
        guides: [{ value: 0, color: "rgba(255,255,255,0.2)" }],
      });
    } else if (kind === "stoch" && "k" in series) {
      panes.push({
        key: chip.spec,
        lines: [
          { label: "%K", color: "#5b9cff", points: series.k },
          { label: "%D", color: "#ffa56b", points: series.d },
        ],
        guides: [
          { value: 80, color: "#d22b2b" },
          { value: 20, color: "#77c412" },
        ],
        range: [0, 100],
      });
    } else if (kind === "atr" && isLine(series)) {
      panes.push({
        key: chip.spec,
        lines: [{ label: "ATR", color: chip.color, points: series }],
      });
    } else if (kind === "adx" && "adx" in series) {
      panes.push({
        key: chip.spec,
        lines: [
          { label: "ADX", color: chip.color, points: series.adx },
          { label: "DI+", color: "#00d4aa", points: series.plusDi },
          { label: "DI-", color: "#ff4d6a", points: series.minusDi },
        ],
        guides: [{ value: 25, color: "rgba(255,255,255,0.2)" }],
      });
    }
  }

  // Signal entry/SL/TP lines — same rule as mobile: BUY/SELL only.
  if (
    showSignalLines &&
    signal.data &&
    signal.data.direction !== "HOLD" &&
    signal.data.entry != null &&
    signal.data.stopLoss != null &&
    signal.data.takeProfit != null
  ) {
    priceLines.push(
      { label: "ENTRY", price: signal.data.entry, color: "#00d4aa" },
      { label: "SL", price: signal.data.stopLoss, color: "#ff4d6a" },
      { label: "TP", price: signal.data.takeProfit, color: "#4ade80" },
    );
  }

  const toggleInd = (spec: string) =>
    setActiveInds((prev) => {
      const next = new Set(prev);
      if (next.has(spec)) next.delete(spec);
      else next.add(spec);
      return next;
    });

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">
          {props.name ?? symbol}{" "}
          <span style={{ color: "var(--text-faint)", fontWeight: 500 }}>
            {symbol}
          </span>
        </h1>
        <ChipRow>
          {RANGES.map((r) => (
            <Chip
              key={r}
              label={r.toUpperCase()}
              active={range === r}
              onClick={() => setRange(r)}
            />
          ))}
        </ChipRow>
      </div>

      <ChipRow>
        <Chip
          label={`Signal ${strategy.label}`}
          active={showSignalLines}
          onClick={() => setShowSignalLines((v) => !v)}
        />
        {INDICATOR_CHIPS.map((c) => (
          <Chip
            key={c.spec}
            label={c.label}
            active={activeInds.has(c.spec)}
            onClick={() => toggleInd(c.spec)}
          />
        ))}
      </ChipRow>

      {chart.error ? (
        <ErrorView
          message={(chart.error as Error).message}
          onRetry={() => void chart.refetch()}
        />
      ) : chart.isLoading || !chart.data ? (
        <Skeleton height={380} />
      ) : (
        <>
          <CandlestickChart
            candles={chart.data.candles}
            height={380}
            withVwap
            overlays={overlays}
            priceLines={priceLines}
          />
          {panes.map((p) => (
            <OscillatorPane
              key={p.key}
              lines={p.lines}
              guides={p.guides}
              range={p.range}
              height={110}
            />
          ))}
        </>
      )}

      <div className="grid-2">
        <Card>
          <div className="page-header" style={{ marginBottom: "var(--s4)" }}>
            <strong>AI Signal</strong>
            <ChipRow>
              {STRATEGIES.map((s) => (
                <Chip
                  key={s.serverParam}
                  label={s.label}
                  active={strategy.serverParam === s.serverParam}
                  onClick={() => setStrategy(s)}
                />
              ))}
            </ChipRow>
          </div>
          {signal.isLoading ? (
            <SkeletonList rows={4} height={24} />
          ) : signal.error ? (
            <ErrorView
              message={(signal.error as Error).message}
              onRetry={() => void signal.refetch()}
            />
          ) : signal.data ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--s4)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--s4)" }}>
                <SignalBadge direction={signal.data.direction} />
                {signal.data.confidence != null && (
                  <span className="cell-sub">
                    {Math.round(signal.data.confidence)}% confidence ·{" "}
                    {signal.data.timeframe ?? ""}
                  </span>
                )}
              </div>
              <div className="stat-row">
                <Stat label="Entry" value={fmtPrice(signal.data.entry)} />
                <Stat
                  label="Stop loss"
                  value={fmtPrice(signal.data.stopLoss)}
                  valueClassName="num-down"
                />
                <Stat
                  label="Take profit"
                  value={fmtPrice(signal.data.takeProfit)}
                  valueClassName="num-up"
                />
                <Stat
                  label="R / R"
                  value={signal.data.riskReward?.toFixed(2) ?? "—"}
                />
              </div>
              {signal.data.reasoning.length > 0 && (
                <ul style={{ paddingLeft: 18, color: "var(--text-secondary)" }}>
                  {signal.data.reasoning.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </Card>

        <Card>
          <strong>Backtest (walk-forward)</strong>
          {backtest.isLoading ? (
            <SkeletonList rows={3} height={24} />
          ) : backtest.error ? (
            <div className="cell-sub" style={{ marginTop: "var(--s3)" }}>
              Backtest unavailable for this symbol.
            </div>
          ) : backtest.data ? (
            <table className="tbl" style={{ marginTop: "var(--s4)" }}>
              <thead>
                <tr>
                  <th>Strategy</th>
                  <th className="num">Win rate</th>
                  <th className="num">Return</th>
                  <th className="num">Max DD</th>
                  <th className="num">Sharpe</th>
                  <th className="num">Trades</th>
                </tr>
              </thead>
              <tbody>
                {STRATEGIES.map((s) => {
                  const r = backtest.data.strategies[s.serverParam];
                  if (!r) return null;
                  return (
                    <tr key={s.serverParam}>
                      <td className="cell-main">{s.label}</td>
                      <td className="num">{fmtPct(r.winRate, false)}</td>
                      <td className={`num ${changeClass(r.totalReturn)}`}>
                        {fmtPct(r.totalReturn)}
                      </td>
                      <td className="num num-down">{fmtPct(r.maxDrawdown, false)}</td>
                      <td className="num">{r.sharpe?.toFixed(2) ?? "—"}</td>
                      <td className="num">{r.trades ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </Card>
      </div>

      <Card>
        <strong>News & Sentiment</strong>
        {news.isLoading ? (
          <SkeletonList rows={5} height={24} />
        ) : news.error || !news.data ? (
          <div className="cell-sub" style={{ marginTop: "var(--s3)" }}>
            No news available.
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--s3)",
              marginTop: "var(--s4)",
            }}
          >
            {news.data.articles.slice(0, 12).map((a, i) => (
              <a
                key={i}
                href={a.url}
                target="_blank"
                rel="noreferrer"
                style={{ display: "flex", gap: "var(--s3)", alignItems: "baseline" }}
              >
                <span
                  className={
                    (a.sentiment ?? 0) > 0.1
                      ? "num-up"
                      : (a.sentiment ?? 0) < -0.1
                        ? "num-down"
                        : "num-flat"
                  }
                >
                  ●
                </span>
                <span className="cell-main" style={{ whiteSpace: "normal" }}>
                  {a.title}
                </span>
                <span className="cell-sub" style={{ marginLeft: "auto", flexShrink: 0 }}>
                  {a.publisher ?? ""} {timeAgo(a.publishedAt)}
                </span>
              </a>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
