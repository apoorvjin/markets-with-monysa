import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
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

const TABS = ["Dashboard", "Correlation", "Adv Correlation", "Economic Calendar", "Crisis", "Debt"] as const;
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
      {tab === "Correlation" && <CorrelationTab />}
      {tab === "Adv Correlation" && <AdvCorrelationTab />}
      {tab === "Economic Calendar" && <CalendarTab />}
      {tab === "Crisis" && <CrisisTab />}
      {tab === "Debt" && <DebtTab />}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────

function DashboardTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s5)" }}>
      <RegimeSummaryCard />
      <GaugesCard />
      <VixTermStructureCard />
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

function termColor(label: string | null | undefined): string {
  if (label === "strong_contango" || label === "contango") return "var(--positive)";
  if (label === "backwardation") return "var(--danger)";
  return "var(--text-secondary)";
}

function optionsScoreColor(score: number | null | undefined): string {
  if (score == null) return "var(--text-secondary)";
  if (score >= 7) return "var(--positive)";
  if (score >= 4) return "var(--warning)";
  return "var(--danger)";
}

function VixTermStructureCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["vix-term-structure"],
    queryFn: () => api.getVixTermStructure(),
    staleTime: 30 * 60_000,
  });
  return (
    <Card>
      <div className="page-header">
        <strong>VIX Term Structure</strong>
        <FreshnessBar lastUpdated={data?.lastUpdated} />
      </div>
      {isLoading || !data ? (
        <SkeletonList rows={1} height={48} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s4)", marginTop: "var(--s3)" }}>
          <div className="stat-row">
            <Stat label="VIX" value={data.vix != null ? data.vix.toFixed(2) : "—"} />
            <Stat label="VIX3M" value={data.vix3m != null ? data.vix3m.toFixed(2) : "—"} />
            <Stat
              label="Ratio"
              value={data.ratio != null ? data.ratio.toFixed(3) : "—"}
              sub={data.termLabel ?? "—"}
              valueClassName=""
            />
            <Stat
              label="Options Env"
              value={data.optionsEnvScore != null ? `${data.optionsEnvScore.toFixed(1)}/10` : "—"}
              sub={data.optionsEnvLabel ?? "—"}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--s3)" }}>
            <span className="ui-stat-label">Term structure:</span>
            <span style={{ color: termColor(data.termLabel), fontWeight: 600, fontSize: "0.85rem" }}>
              {data.termLabel?.replace("_", " ") ?? "—"}
            </span>
            {data.optionsEnvScore != null && (
              <>
                <span className="ui-stat-label" style={{ marginLeft: "var(--s4)" }}>Options env:</span>
                <span style={{ color: optionsScoreColor(data.optionsEnvScore), fontWeight: 600, fontSize: "0.85rem" }}>
                  {data.optionsEnvLabel ?? "—"}
                </span>
                <div style={{
                  flex: 1, height: 6, background: "var(--surface-2)", borderRadius: 3, maxWidth: 160,
                }}>
                  <div style={{
                    height: "100%",
                    width: `${(data.optionsEnvScore / 10) * 100}%`,
                    background: optionsScoreColor(data.optionsEnvScore),
                    borderRadius: 3,
                    transition: "width 0.3s",
                  }} />
                </div>
              </>
            )}
          </div>
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
        <Stat label="Debt / GDP" value={data.debtToGdpRatio ?? "—"} />
        <Stat label="Daily increase" value={data.dailyIncrease ?? "—"} />
        <Stat label="Deficit (fiscal YTD)" value={data.annualDeficit ?? "—"} />
        <Stat label="Interest payments (YTD)" value={data.interestPayments ?? "—"} />
      </div>
    </Card>
  );
}

// ── Economic Calendar ─────────────────────────────────────────────────────

const CATEGORY_COLOR: Record<string, string> = {
  Fed: "var(--accent)",
  Inflation: "var(--warning)",
  Jobs: "var(--positive)",
  GDP: "#5b8def",
  Other: "#a78bfa",
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function CalendarTab() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["economy-events"],
    queryFn: () => api.getEconomyEvents(),
    staleTime: 12 * 3600_000,
  });
  if (error)
    return <ErrorView message={(error as Error).message} onRetry={() => void refetch()} />;
  if (isLoading || !data) return <SkeletonList rows={10} />;

  const byMonth = new Map<string, typeof data.events>();
  for (const e of data.events) {
    const key = e.date.slice(0, 7);
    byMonth.set(key, [...(byMonth.get(key) ?? []), e]);
  }
  const months = [...byMonth.keys()].sort();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s5)" }}>
      <FreshnessBar lastUpdated={data.lastUpdated} />
      <ChipRow>
        {(["Fed", "Inflation", "Jobs", "GDP", "Other"] as const).map((cat) => (
          <span key={cat} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: CATEGORY_COLOR[cat], display: "inline-block" }} />
            {cat}
          </span>
        ))}
      </ChipRow>
      {months.map((month) => {
        const [y, m] = month.split("-");
        const label = `${MONTH_NAMES[Number(m) - 1]} ${y}`;
        const events = [...byMonth.get(month)!].sort((a, b) => a.date.localeCompare(b.date));
        return (
          <Card key={month}>
            <strong>{label}</strong>
            <div style={{ display: "flex", flexDirection: "column", marginTop: "var(--s3)" }}>
              {events.map((e, i) => {
                const isHigh = (e.impact ?? "").toLowerCase() === "high";
                const day = Number(e.date.slice(8, 10));
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--s3)",
                      padding: "var(--s3) 0",
                      borderBottom: i < events.length - 1 ? "1px solid var(--border)" : "none",
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: CATEGORY_COLOR[e.category ?? "Other"] ?? CATEGORY_COLOR.Other, flexShrink: 0 }} />
                    <span className="cell-sub" style={{ width: 84, flexShrink: 0 }}>
                      {e.estimated ? e.dateLabel ?? "Est." : `${(MONTH_NAMES[Number(m) - 1] ?? "").slice(0, 3)} ${day}`}
                    </span>
                    <span style={{ flex: 1 }}>{e.event}</span>
                    {(e.forecast || e.previous) && (
                      <span className="cell-sub" style={{ flexShrink: 0 }}>
                        {e.forecast ? `Fcst: ${e.forecast}` : ""} {e.previous ? `Prev: ${e.previous}` : ""}
                      </span>
                    )}
                    <span
                      className="ui-badge"
                      data-tone={isHigh ? "sell" : "hold"}
                      style={{ flexShrink: 0 }}
                    >
                      {e.impact ?? "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
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

// ── Adv Correlation (new, additive — see CorrelationTab above, untouched) ──

const ADV_WINDOWS = ["1m", "3m", "6m", "1y"] as const;
type AdvWindow = (typeof ADV_WINDOWS)[number];
const ADV_WINDOW_LABELS: Record<AdvWindow, string> = { "1m": "1M", "3m": "3M", "6m": "6M", "1y": "1Y" };

const ADV_CATEGORIES = ["All", "Commodities", "Indices", "Crypto", "Forex", "Stocks"] as const;
type AdvCategory = (typeof ADV_CATEGORIES)[number];

const ADV_CUSTOM_SYMBOLS_KEY = "monysa.advCorrelation.customSymbols";

function loadCustomSymbols(): string[] {
  try {
    const raw = localStorage.getItem(ADV_CUSTOM_SYMBOLS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function AdvCorrelationTab() {
  const [window_, setWindow] = useState<AdvWindow>("3m");
  const [category, setCategory] = useState<AdvCategory>("All");
  const [customSymbols, setCustomSymbols] = useState<string[]>(() => loadCustomSymbols());
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [drillDown, setDrillDown] = useState<{ a: string; b: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const persistCustomSymbols = (next: string[]) => {
    setCustomSymbols(next);
    try {
      localStorage.setItem(ADV_CUSTOM_SYMBOLS_KEY, JSON.stringify(next));
    } catch {
      // localStorage unavailable (private mode etc.) — in-memory state still works this session
    }
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["adv-correlation", window_],
    queryFn: () => api.getAdvCorrelation(window_),
    staleTime: 900_000,
  });

  const { data: searchResults } = useQuery({
    queryKey: ["search", debouncedQuery],
    queryFn: () => api.search(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 5 * 60_000,
  });

  const { data: customData, isFetching: customLoading } = useQuery({
    queryKey: ["adv-correlation-custom", customSymbols, window_],
    queryFn: () => api.getAdvCorrelationCustom(customSymbols, window_),
    enabled: customSymbols.length > 0,
    staleTime: 45 * 60_000,
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["adv-correlation-history", drillDown?.a, drillDown?.b],
    queryFn: () => api.getAdvCorrelationHistory(drillDown!.a, drillDown!.b),
    enabled: !!drillDown,
    staleTime: 900_000,
  });

  const visibleIdx = useMemo(() => {
    if (!data) return [];
    return data.symbols
      .map((s, i) => i)
      .filter((i) => category === "All" || data.symbols[i]!.category === category);
  }, [data, category]);

  const addCustomSymbol = (symbol: string) => {
    if (customSymbols.includes(symbol) || customSymbols.length >= 12) return;
    persistCustomSymbols([...customSymbols, symbol]);
    setSearchQuery("");
    setDebouncedQuery("");
  };
  const removeCustomSymbol = (symbol: string) => {
    persistCustomSymbols(customSymbols.filter((s) => s !== symbol));
  };

  if (error) return <ErrorView message={(error as Error).message} onRetry={() => void refetch()} />;
  if (isLoading || !data) return <SkeletonList rows={10} />;

  return (
    <>
      <FreshnessBar lastUpdated={data.lastUpdated} />
      {!!data.staleSymbols?.length && (
        <div className="ui-freshness" style={{ color: "var(--warning, #e6952a)" }}>
          Data delayed for: {data.staleSymbols.join(", ")}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--s3)", marginBottom: "var(--s4)" }}>
        <ChipRow>
          {ADV_WINDOWS.map((w) => (
            <Chip key={w} label={ADV_WINDOW_LABELS[w]} active={window_ === w} onClick={() => setWindow(w)} />
          ))}
        </ChipRow>
        <ChipRow>
          {ADV_CATEGORIES.map((c) => (
            <Chip key={c} label={c} active={category === c} onClick={() => setCategory(c)} />
          ))}
        </ChipRow>
      </div>

      <div className="tbl-wrap">
        <table className="tbl" style={{ fontSize: "var(--fs-sm)" }}>
          <thead>
            <tr>
              <th />
              {visibleIdx.map((i) => (
                <th key={data.symbols[i]!.symbol} className="num" title={data.symbols[i]!.name}>
                  {data.symbols[i]!.flag || data.symbols[i]!.symbol}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleIdx.map((i) => {
              const row = data.symbols[i]!;
              return (
                <tr key={row.symbol}>
                  <td className="cell-main" title={row.name}>
                    {row.flag ?? ""} {row.symbol}
                  </td>
                  {visibleIdx.map((j) => (
                    <td
                      key={j}
                      className="num"
                      style={{
                        background: corrBg(data.matrix[i]?.[j] ?? 0),
                        color: "var(--text-primary)",
                        cursor: i === j ? "default" : "pointer",
                      }}
                      onClick={() => {
                        if (i !== j) setDrillDown({ a: row.symbol, b: data.symbols[j]!.symbol });
                      }}
                    >
                      {(data.matrix[i]?.[j] ?? 0).toFixed(2)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Card className="adv-corr-custom" style={{ marginTop: "var(--s5)" }}>
        <div style={{ marginBottom: "var(--s3)", fontWeight: 600 }}>Your Custom Picks</div>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search any symbol to add (max 12)…"
          style={{ width: "100%", padding: "var(--s3)", marginBottom: "var(--s3)" }}
        />
        {debouncedQuery.length >= 2 && (searchResults?.results?.length ?? 0) > 0 && (
          <div style={{ marginBottom: "var(--s3)", display: "flex", flexDirection: "column", gap: 4 }}>
            {searchResults!.results.slice(0, 8).map((r) => (
              <div
                key={`${r.symbol}-${r.exchange ?? ""}`}
                onClick={() => addCustomSymbol(r.symbol)}
                style={{ cursor: "pointer", padding: "4px 0" }}
              >
                <span style={{ color: "var(--text-primary)" }}>{r.symbol}</span>{" "}
                <span style={{ color: "var(--text-faint)" }}>{r.name}</span>
              </div>
            ))}
          </div>
        )}
        <ChipRow>
          {customSymbols.map((s) => (
            <Chip key={s} label={`${s} ✕`} onClick={() => removeCustomSymbol(s)} />
          ))}
        </ChipRow>
        {customSymbols.length > 0 && (customLoading || !customData) && <SkeletonList rows={3} />}
        {customData && (
          <div className="tbl-wrap" style={{ marginTop: "var(--s3)" }}>
            <table className="tbl" style={{ fontSize: "var(--fs-sm)" }}>
              <thead>
                <tr>
                  <th />
                  {customData.symbols.map((s) => (
                    <th key={s.symbol} className="num" title={s.name}>
                      {s.flag || s.symbol}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {customData.symbols.map((row, i) => (
                  <tr key={row.symbol}>
                    <td className="cell-main" title={row.name}>
                      {row.flag ?? ""} {row.symbol}
                    </td>
                    {(customData.matrix[i] ?? []).map((v, j) => (
                      <td key={j} className="num" style={{ background: corrBg(v), color: "var(--text-primary)" }}>
                        {v.toFixed(2)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {drillDown && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={() => setDrillDown(null)}
        >
          <Card style={{ width: "min(640px, 90vw)" }}>
            <div
              style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--s3)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ fontWeight: 600 }}>
                {drillDown.a} vs {drillDown.b} — 30d rolling correlation
              </div>
              <button type="button" onClick={() => setDrillDown(null)}>
                ✕
              </button>
            </div>
            <div onClick={(e) => e.stopPropagation()}>
              {historyLoading || !historyData ? (
                <SkeletonList rows={4} />
              ) : (
                <MultiLineChart
                  series={[
                    {
                      label: `${drillDown.a} vs ${drillDown.b}`,
                      color: "#00d4aa",
                      points: historyData.points.map((p) => ({ time: p.date, value: p.r })),
                    },
                  ]}
                />
              )}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
