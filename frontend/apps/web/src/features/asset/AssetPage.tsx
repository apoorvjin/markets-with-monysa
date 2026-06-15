import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { STRATEGIES, type ChartRange } from "@monysa/contracts";
import { CandlestickChart } from "@monysa/charts";
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

export function AssetPage(props: { symbol: string; name?: string }) {
  const { symbol } = props;
  const [range, setRange] = useState<ChartRange>("3mo");
  // serverParam ("1"–"9") — label is for display only
  const [strategy, setStrategy] = useState(STRATEGIES[0]!);

  const chart = useQuery({
    queryKey: ["chart", symbol, range],
    queryFn: () => api.getChart(symbol, range),
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

      {chart.error ? (
        <ErrorView
          message={(chart.error as Error).message}
          onRetry={() => void chart.refetch()}
        />
      ) : chart.isLoading || !chart.data ? (
        <Skeleton height={380} />
      ) : (
        <CandlestickChart candles={chart.data.candles} height={380} />
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
