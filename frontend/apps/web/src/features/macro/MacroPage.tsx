import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { Sector } from "@monysa/contracts";
import { PERF_TIMEFRAMES, perfFor, type PerfTimeframe } from "@monysa/contracts";
import { MultiLineChart, Sparkline } from "@monysa/charts";
import {
  Card,
  changeClass,
  Chip,
  ChipRow,
  ErrorView,
  fmtPct,
  fmtPrice,
  FreshnessBar,
  SkeletonList,
  Stat,
} from "@monysa/ui";
import { api } from "../../lib/api";
import { Gauge } from "../../components/Gauge";
import { HeatmapGrid } from "../../components/HeatmapGrid";

const TABS = ["Dashboard", "Crisis", "Debt", "Calendar", "Correlation"] as const;
type Tab = (typeof TABS)[number];

export function MacroPage() {
  const [tab, setTab] = useState<Tab>("Dashboard");
  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Macro</h1>
        <ChipRow>
          {TABS.map((t) => (
            <Chip key={t} label={t} active={tab === t} onClick={() => setTab(t)} />
          ))}
        </ChipRow>
      </div>
      {tab === "Dashboard" && <DashboardTab />}
      {tab === "Crisis" && <CrisisTab />}
      {tab === "Debt" && <DebtTab />}
      {tab === "Calendar" && <CalendarTab />}
      {tab === "Correlation" && <CorrelationTab />}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────

function DashboardTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s5)" }}>
      <RegimeSummaryCard />
      <GaugesCard />
      <MarketHeatmapsCard />
      <YieldsCard />
      <SectorRotationCard />
      <AiBriefingCard />
    </div>
  );
}

function RegimeSummaryCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["regime-summary"],
    queryFn: () => api.getRegimeSummary(),
    staleTime: 10 * 60_000,
  });
  return (
    <Card>
      <div className="page-header">
        <strong>Market Regime</strong>
        <FreshnessBar lastUpdated={data?.lastUpdated} />
      </div>
      {isLoading || !data ? (
        <SkeletonList rows={2} height={36} />
      ) : (
        <>
          <div className="stat-row" style={{ marginTop: "var(--s3)" }}>
            <Stat label="Bullish" value={data.bullish} valueClassName="num-up" sub={`of ${data.total} assets`} />
            <Stat label="Neutral" value={data.neutral} sub=" " />
            <Stat label="Bearish" value={data.bearish} valueClassName="num-down" sub=" " />
            {Object.entries(data.regimeBreakdown ?? {}).map(([k, v]) => (
              <Stat key={k} label={k.replace("_", " ")} value={v} sub=" " />
            ))}
          </div>
          <div className="grid-2" style={{ marginTop: "var(--s4)" }}>
            <div>
              <span className="ui-stat-label">Top bullish</span>
              {data.topBullish.map((a) => (
                <div key={a.symbol} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>
                    {a.flag ?? ""} {a.name}
                  </span>
                  <span className="num-up">{a.confidence ?? "—"}%</span>
                </div>
              ))}
            </div>
            <div>
              <span className="ui-stat-label">Top bearish</span>
              {data.topBearish.map((a) => (
                <div key={a.symbol} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>
                    {a.flag ?? ""} {a.name}
                  </span>
                  <span className="num-down">{a.confidence ?? "—"}%</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function stressOf(vix: number): { label: string; value: number } {
  // Same banding as mobile _StressMeter: VIX → 0-100 stress scale
  const value = Math.max(0, Math.min(100, ((vix - 10) / 40) * 100));
  const label = vix < 15 ? "Calm" : vix < 20 ? "Normal" : vix < 30 ? "Elevated" : "Crisis";
  return { label, value };
}

function GaugesCard() {
  const vol = useQuery({
    queryKey: ["volatility-assets"],
    queryFn: () => api.getVolatilityAssets(),
    staleTime: 10 * 60_000,
  });
  const fg = useQuery({
    queryKey: ["fear-greed"],
    queryFn: () => api.getFearGreed(),
    staleTime: 10 * 60_000,
  });
  const vix = vol.data?.vix?.price;
  const stress = vix != null ? stressOf(vix) : null;
  return (
    <Card>
      {vol.isLoading && fg.isLoading ? (
        <SkeletonList rows={2} height={48} />
      ) : (
        <div className="stat-row" style={{ justifyContent: "space-around" }}>
          {vix != null && (
            <Gauge value={vix} min={10} max={50} label="VIX" sub={vol.data?.vix?.bandLabel ?? vol.data?.vix?.band ?? ""} />
          )}
          {stress && (
            <Gauge value={stress.value} min={0} max={100} label="Market stress" sub={stress.label} />
          )}
          {fg.data && (
            <Gauge
              value={fg.data.value}
              min={0}
              max={100}
              label="Fear & Greed"
              sub={fg.data.classification}
              invert
            />
          )}
        </div>
      )}
    </Card>
  );
}

function MarketHeatmapsCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["perf-heatmap"],
    queryFn: () => api.getHeatmap(),
    staleTime: 15 * 60_000,
  });
  return (
    <Card>
      {isLoading || !data ? (
        <SkeletonList rows={4} height={48} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s6)" }}>
          {data.regions.length > 0 && <HeatmapGrid title="Regions" tiles={data.regions} />}
          {data.assetClasses.length > 0 && (
            <HeatmapGrid title="Asset classes" tiles={data.assetClasses} />
          )}
        </div>
      )}
    </Card>
  );
}

function YieldsCard() {
  const bonds = useQuery({
    queryKey: ["bonds"],
    queryFn: () => api.getBonds(),
    staleTime: 30 * 60_000,
  });
  const history = useQuery({
    queryKey: ["yield-curve-history"],
    queryFn: () => api.getYieldCurveHistory(),
    staleTime: 6 * 3600_000,
  });

  const series = useMemo(() => {
    const s = history.data?.series ?? [];
    const mk = (key: "us3m" | "us5y" | "us10y" | "us30y", label: string, color: string) => ({
      label,
      color,
      points: s
        .filter((p) => p[key] != null)
        .map((p) => ({ time: p.date, value: p[key] as number })),
    });
    return [
      mk("us3m", "3M", "#ffb84d"),
      mk("us5y", "5Y", "#6366f1"),
      mk("us10y", "10Y", "#00d4aa"),
      mk("us30y", "30Y", "#ff4d6a"),
    ].filter((x) => x.points.length > 1);
  }, [history.data]);

  return (
    <Card>
      <div className="page-header">
        <strong>US Treasury yield curve</strong>
        {bonds.data && (
          <span
            className="ui-badge"
            data-tone={bonds.data.curveStatus.toLowerCase().includes("invert") ? "sell" : "buy"}
          >
            {bonds.data.curveStatus}
          </span>
        )}
      </div>
      {bonds.data && (
        <div className="stat-row" style={{ margin: "var(--s4) 0" }}>
          <Stat label="3M" value={`${bonds.data.us3m.toFixed(2)}%`} />
          <Stat label="5Y" value={`${bonds.data.us5y.toFixed(2)}%`} />
          <Stat label="10Y" value={`${bonds.data.us10y.toFixed(2)}%`} />
          <Stat label="30Y" value={`${bonds.data.us30y.toFixed(2)}%`} />
          <Stat label="3M/10Y spread" value={bonds.data.spread3m10y.toFixed(2)} />
        </div>
      )}
      {history.isLoading ? (
        <SkeletonList rows={3} height={60} />
      ) : series.length > 0 ? (
        <MultiLineChart series={series} height={280} />
      ) : (
        <ErrorView message="Yield history unavailable." />
      )}
    </Card>
  );
}

// ── Sector rotation: RRG quadrant cards + perf table w/ full timeframes ──

const QUADRANTS = [
  { id: "leading", label: "Leading", tone: "buy", test: (s: Sector) => (s.rsRatio ?? 100) >= 100 && (s.rsMomentum ?? 100) >= 100 },
  { id: "weakening", label: "Weakening", tone: "hold", test: (s: Sector) => (s.rsRatio ?? 100) >= 100 && (s.rsMomentum ?? 100) < 100 },
  { id: "improving", label: "Improving", tone: "hold", test: (s: Sector) => (s.rsRatio ?? 100) < 100 && (s.rsMomentum ?? 100) >= 100 },
  { id: "lagging", label: "Lagging", tone: "sell", test: (s: Sector) => (s.rsRatio ?? 100) < 100 && (s.rsMomentum ?? 100) < 100 },
] as const;

function SectorRotationCard() {
  const [tf, setTf] = useState<PerfTimeframe>("1D");
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sectors"],
    queryFn: () => api.getSectors(),
    staleTime: 15 * 60_000,
  });
  if (error)
    return <ErrorView message={(error as Error).message} onRetry={() => void refetch()} />;
  const sectors = data?.sectors ?? [];
  const withRrg = sectors.filter((s) => s.rsRatio != null && s.rsMomentum != null);
  return (
    <Card>
      <div className="page-header">
        <strong>Sector rotation (RRG vs SPX)</strong>
        <FreshnessBar lastUpdated={data?.lastUpdated} />
      </div>
      {isLoading || !data ? (
        <SkeletonList rows={6} />
      ) : (
        <>
          <div className="grid-2" style={{ marginTop: "var(--s3)" }}>
            {QUADRANTS.map((qd) => {
              const members = withRrg.filter(qd.test);
              return (
                <div
                  key={qd.id}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r-sm)",
                    padding: "var(--s4)",
                  }}
                >
                  <span className="ui-badge" data-tone={qd.tone}>
                    {qd.label}
                  </span>
                  <div style={{ marginTop: "var(--s3)", display: "flex", flexDirection: "column", gap: 4 }}>
                    {members.length === 0 ? (
                      <span className="cell-sub">—</span>
                    ) : (
                      members.map((s) => (
                        <div key={s.name} style={{ display: "flex", justifyContent: "space-between" }}>
                          <span>
                            {s.emoji ?? ""} {s.name}
                          </span>
                          <span className="cell-sub">
                            {s.rsRatio!.toFixed(1)} / {s.rsMomentum!.toFixed(1)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="toolbar" style={{ marginTop: "var(--s5)" }}>
            <strong>Sector performance</strong>
            <ChipRow>
              {PERF_TIMEFRAMES.map((t) => (
                <Chip key={t.key} label={t.label} active={tf === t.key} onClick={() => setTf(t.key)} />
              ))}
            </ChipRow>
          </div>
          <div className="tbl-wrap" style={{ marginTop: "var(--s3)" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Sector</th>
                  <th className="num">{tf} perf</th>
                  <th className="num">RS-Ratio</th>
                  <th className="num">RS-Momentum</th>
                </tr>
              </thead>
              <tbody>
                {[...sectors]
                  .sort((a, b) => (perfFor(b, tf) ?? -999) - (perfFor(a, tf) ?? -999))
                  .map((s) => {
                    const v = perfFor(s, tf);
                    return (
                      <tr key={s.name}>
                        <td className="cell-main">
                          {s.emoji ?? ""} {s.name}
                        </td>
                        <td className={`num ${changeClass(v)}`}>{fmtPct(v)}</td>
                        <td className="num">{s.rsRatio?.toFixed(1) ?? "—"}</td>
                        <td className="num">{s.rsMomentum?.toFixed(1) ?? "—"}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

function AiBriefingCard() {
  const vol = useQuery({
    queryKey: ["volatility-assets"],
    queryFn: () => api.getVolatilityAssets(),
    staleTime: 10 * 60_000,
  });
  const [requested, setRequested] = useState(false);

  const briefing = useQuery({
    queryKey: ["briefing"],
    enabled: requested && !!vol.data,
    staleTime: 30 * 60_000,
    queryFn: () => {
      const items = vol.data?.items ?? [];
      const pct1M = (sym: string) =>
        items.find((a) => a.symbol === sym)?.changePercent1M ?? null;
      return api.postBriefing({
        vix: vol.data?.vix?.price ?? null,
        vixBand: vol.data?.vix?.band ?? null,
        goldPct1M: pct1M("GC=F"),
        oilPct1M: pct1M("CL=F"),
        dxyPct1M: pct1M("DX-Y.NYB"),
      });
    },
  });

  return (
    <Card>
      <div className="page-header">
        <strong>AI Macro Briefing</strong>
        {!requested && (
          <button type="button" className="ui-chip" data-active="true" onClick={() => setRequested(true)}>
            Generate briefing
          </button>
        )}
      </div>
      {requested &&
        (briefing.isLoading ? (
          <SkeletonList rows={4} height={18} />
        ) : briefing.error ? (
          <div className="cell-sub">Briefing unavailable: {(briefing.error as Error).message}</div>
        ) : (
          <p style={{ color: "var(--text-secondary)", whiteSpace: "pre-wrap", marginTop: "var(--s3)" }}>
            {briefing.data?.briefing}
          </p>
        ))}
    </Card>
  );
}

// ── Crisis: playbook + crisis assets ──────────────────────────────────────

function CrisisTab() {
  const [view, setView] = useState<"playbook" | "assets">("playbook");
  return (
    <>
      <ChipRow>
        <Chip label="Crisis Playbook" active={view === "playbook"} onClick={() => setView("playbook")} />
        <Chip label="Crisis Assets" active={view === "assets"} onClick={() => setView("assets")} />
      </ChipRow>
      {view === "playbook" ? <CrisisPlaybook /> : <CrisisAssets />}
    </>
  );
}

function CrisisPlaybook() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["crises"],
    queryFn: () => api.getCrises(),
    staleTime: 24 * 3600_000,
  });
  if (error)
    return <ErrorView message={(error as Error).message} onRetry={() => void refetch()} />;
  if (isLoading || !data) return <SkeletonList rows={8} height={60} />;
  return (
    <>
      <span className="ui-freshness">Reviewed {data.dataAsOf ?? "—"}</span>
      <div className="grid-2">
        {data.crises.map((cr) => (
          <Card key={cr.id ?? cr.name}>
            <div className="page-header">
              <strong>{cr.name}</strong>
              {cr.vixPeak != null && (
                <span className="ui-badge" data-tone="sell">
                  VIX peak {cr.vixPeak}
                </span>
              )}
            </div>
            <div className="cell-sub">{cr.period ?? ""}</div>
            {cr.description && (
              <p style={{ color: "var(--text-secondary)", marginTop: "var(--s3)" }}>{cr.description}</p>
            )}
            {cr.outcome && (
              <p style={{ color: "var(--text-muted)", marginTop: "var(--s2)" }}>
                <strong>Outcome:</strong> {cr.outcome}
              </p>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}

function CrisisAssets() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["volatility-assets"],
    queryFn: () => api.getVolatilityAssets(),
    staleTime: 10 * 60_000,
  });
  if (error)
    return <ErrorView message={(error as Error).message} onRetry={() => void refetch()} />;
  if (isLoading || !data) return <SkeletonList rows={10} />;
  return (
    <div className="tbl-wrap" style={{ maxHeight: "70vh" }}>
      <table className="tbl">
        <thead>
          <tr>
            <th>Asset</th>
            <th className="num">Price</th>
            <th className="num">1D</th>
            <th className="num">1W</th>
            <th className="num">1M</th>
            <th className="num">3M</th>
            <th>Trend</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((a) => (
            <tr key={a.symbol}>
              <td>
                <span style={{ marginRight: 8 }}>{a.flag ?? ""}</span>
                <span className="cell-main">{a.name}</span>{" "}
                <span className="cell-sub">{a.symbol}</span>
              </td>
              <td className="num">{fmtPrice(a.price)}</td>
              <td className={`num ${changeClass(a.changePercent)}`}>{fmtPct(a.changePercent)}</td>
              <td className={`num ${changeClass(a.changePercent1W)}`}>{fmtPct(a.changePercent1W)}</td>
              <td className={`num ${changeClass(a.changePercent1M)}`}>{fmtPct(a.changePercent1M)}</td>
              <td className={`num ${changeClass(a.changePercent3M)}`}>{fmtPct(a.changePercent3M)}</td>
              <td>{a.sparkline && a.sparkline.length > 1 && <Sparkline points={a.sparkline} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Debt ──────────────────────────────────────────────────────────────────

function DebtTab() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["usa-debt"],
    queryFn: () => api.getUsaDebt(),
    staleTime: 12 * 3600_000,
  });
  if (error)
    return <ErrorView message={(error as Error).message} onRetry={() => void refetch()} />;
  if (isLoading || !data) return <SkeletonList rows={6} height={48} />;
  return (
    <Card>
      <div className="page-header">
        <strong>US National Debt</strong>
        <span className="cell-sub">as of {data.recordDate ?? "—"}</span>
      </div>
      <div className="stat-row" style={{ marginTop: "var(--s4)" }}>
        <Stat label="Total debt" value={data.totalDebtFormatted ?? "—"} valueClassName="num-down" />
        <Stat label="Per citizen" value={data.debtPerCitizen ?? "—"} />
        <Stat label="Per taxpayer" value={data.debtPerTaxpayer ?? "—"} />
        <Stat label="Debt / GDP" value={data.debtToGdpRatio ?? "—"} />
        <Stat label="Daily increase" value={data.dailyIncrease ?? "—"} />
        <Stat label="Annual deficit" value={data.annualDeficit ?? "—"} />
        <Stat label="Interest payments" value={data.interestPayments ?? "—"} />
      </div>
    </Card>
  );
}

// ── Calendar ──────────────────────────────────────────────────────────────

function CalendarTab() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["economy-events"],
    queryFn: () => api.getEconomyEvents(),
    staleTime: 12 * 3600_000,
  });
  if (error)
    return <ErrorView message={(error as Error).message} onRetry={() => void refetch()} />;
  if (isLoading || !data) return <SkeletonList rows={10} />;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Date</th>
            <th>Time</th>
            <th>Event</th>
            <th>Impact</th>
            <th className="num">Forecast</th>
            <th className="num">Previous</th>
          </tr>
        </thead>
        <tbody>
          {data.events.map((e, i) => (
            <tr key={i}>
              <td className="cell-main">{e.date}</td>
              <td className="cell-sub">{e.time ?? ""}</td>
              <td style={{ whiteSpace: "normal" }}>{e.event}</td>
              <td>
                <span
                  className="ui-badge"
                  data-tone={(e.impact ?? "").toLowerCase() === "high" ? "sell" : "hold"}
                >
                  {e.impact ?? "—"}
                </span>
              </td>
              <td className="num">{e.forecast ?? "—"}</td>
              <td className="num">{e.previous ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Correlation matrix ────────────────────────────────────────────────────

function corrBg(v: number): string {
  const t = Math.max(-1, Math.min(1, v));
  return t >= 0
    ? `rgba(0, 212, 170, ${Math.abs(t) * 0.55})`
    : `rgba(255, 77, 106, ${Math.abs(t) * 0.55})`;
}

function CorrelationTab() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["correlation"],
    queryFn: () => api.getCorrelation(),
    staleTime: 3600_000,
  });
  if (error)
    return <ErrorView message={(error as Error).message} onRetry={() => void refetch()} />;
  if (isLoading || !data) return <SkeletonList rows={10} />;
  return (
    <>
      <FreshnessBar lastUpdated={data.lastUpdated} />
      <div className="tbl-wrap">
        <table className="tbl" style={{ fontSize: "var(--fs-sm)" }}>
          <thead>
            <tr>
              <th />
              {data.symbols.map((s) => (
                <th key={s.symbol} className="num" title={s.name}>
                  {s.flag ?? s.symbol}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.symbols.map((row, i) => (
              <tr key={row.symbol}>
                <td className="cell-main" title={row.name}>
                  {row.flag ?? ""} {row.symbol}
                </td>
                {(data.matrix[i] ?? []).map((v, j) => (
                  <td
                    key={j}
                    className="num"
                    style={{ background: corrBg(v), color: "var(--text-primary)" }}
                  >
                    {v.toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
