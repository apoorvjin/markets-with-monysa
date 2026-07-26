import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import {
  MULTIBAGGER_COUNTRIES,
  type CountryTariff,
  type EtfCategory,
  type EtfItem,
  type MultibaggerCountry,
  type QuiverItem,
  type SectorBestSetupsGroup,
  type TreemapStock,
} from "@monysa/contracts";
import {
  Card,
  changeClass,
  Chip,
  ChipRow,
  ErrorView,
  fmtCompact,
  fmtPct,
  fmtPrice,
  FreshnessBar,
  ProBlur,
  SkeletonList,
} from "@monysa/ui";
import { api } from "../../lib/api";
import { BestSetupsCard } from "../../components/BestSetupsCard";
import { InstitutionalFlowCard } from "../../components/InstitutionalFlowCard";

// Mobile tab order — Exposure is the default landing tab.
// Congress and House Trades were removed (2026-07): their only live data sources
// (Quiver's free congress-trading API, FMP's house/senate-trading plan) are both
// dead — see CLAUDE.md Known Pitfalls. Don't re-add without a working data source.
const TABS = [
  "Exposure",
  "Dashboard",
  "Multibaggers",
  "ETFs",
  "Presidential",
  "Smart $",
  "Earnings Calendar",
] as const;
type Tab = (typeof TABS)[number];

export function InvestingPage() {
  const [tab, setTab] = useState<Tab>("Exposure");

  return (
    <div className="page">
      <div className="page-header ui-enter">
        <h1 className="page-title">Investing</h1>
        <ChipRow>
          {TABS.map((t) => (
            <Chip key={t} label={t} active={tab === t} onClick={() => setTab(t)} />
          ))}
        </ChipRow>
      </div>
      {tab === "Exposure" && <ExposureTab />}
      {tab === "Dashboard" && <DashboardTab />}
      {tab === "Multibaggers" && <MultibaggersTab />}
      {tab === "Presidential" && <PresidentialTab />}
      {tab === "Smart $" && <SmartMoneyTab />}
      {tab === "Earnings Calendar" && <EarningsTab />}
      {tab === "ETFs" && <EtfExplorerTab />}
    </div>
  );
}

// ── Dashboard: Best Setups + sector groups + market movers ───────────────

function DashboardTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s5)" }}>
      <BestSetupsCard />
      <SectorBestSetupsCard />
      <InstitutionalFlowCard />
      <MoversCard />
    </div>
  );
}

function SectorGroupList(props: { title: string; groups: SectorBestSetupsGroup[] }) {
  return (
    <div>
      <strong>{props.title}</strong>
      {props.groups.length === 0 ? (
        <div className="cell-sub" style={{ marginTop: "var(--s2)" }}>
          No sectors currently qualify.
        </div>
      ) : (
        props.groups.map((g) => (
          <div key={g.sector} style={{ marginTop: "var(--s3)" }}>
            <div className="cell-main">
              {g.emoji ?? ""} {g.sector}
            </div>
            <table className="tbl">
              <tbody>
                {g.stocks.map((s) => (
                  <tr key={s.symbol}>
                    <td>
                      <span className="cell-main">{s.symbol}</span>{" "}
                      <span className="cell-sub">{s.name}</span>
                    </td>
                    <td className="num">{fmtPrice(s.price)}</td>
                    <td className={`num ${changeClass(s.changePercent)}`}>
                      {fmtPct(s.changePercent)}
                    </td>
                    <td className="num cell-sub">{s.signalsActive ?? 0} signals</td>
                    <td className="num cell-sub">
                      {s.winRate1m != null ? `${s.winRate1m.toFixed(0)}% 1M` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}

function SectorBestSetupsCard() {
  // Cold cache returns a cacheWarm:false skeleton — poll every 30s (max 10),
  // never block. Mirrors _sectorBestSetupsProvider in investing_screen.dart.
  const { data, isLoading, failureCount } = useQuery({
    queryKey: ["sector-best-setups", "v1"],
    queryFn: () => api.getSectorBestSetups("v1"),
    staleTime: 30 * 60_000,
    refetchInterval: (q) => {
      const d = q.state.data;
      if (!d || d.cacheWarm) return false;
      return q.state.dataUpdateCount <= 10 ? 30_000 : false;
    },
  });
  void failureCount;

  return (
    <Card>
      <div className="page-header">
        <strong>Sector Best Setups</strong>
        <FreshnessBar lastUpdated={data?.lastUpdated} />
      </div>
      {isLoading || !data ? (
        <SkeletonList rows={5} height={28} />
      ) : !data.cacheWarm && data.leading.length === 0 && data.improving.length === 0 ? (
        <div className="cell-sub">
          Server is computing sector setups (~minutes on cold cache) — this
          section refreshes automatically.
        </div>
      ) : (
        <div className="grid-2">
          <SectorGroupList title="Leading sectors" groups={data.leading} />
          <SectorGroupList title="Improving sectors" groups={data.improving} />
        </div>
      )}
    </Card>
  );
}

// Mirrors _MoversCard in moby/lib/features/investing/investing_screen.dart —
// /api/heatmap/movers only supports these three US indices.
const MOVER_INDICES = [
  { param: "sp500", label: "S&P 500" },
  { param: "ndx", label: "Nasdaq" },
  { param: "dji", label: "Dow Jones" },
  { param: "russell2000", label: "Russell 2000" },
] as const;
type MoverIndex = (typeof MOVER_INDICES)[number]["param"];

// Session-aware display values: during PRE/POST the regular `price` and
// `changePercent` are still the last close — show the extended-session quote.
function moverDisplay(s: TreemapStock, session: string | null | undefined) {
  if (session === "pre") {
    return { price: s.preMarketPrice ?? s.price, pct: s.preMarketChangePercent };
  }
  if (session === "post") {
    return { price: s.postMarketPrice ?? s.price, pct: s.postMarketChangePercent };
  }
  return { price: s.price, pct: s.changePercent };
}

function MoversCard() {
  const [index, setIndex] = useState<MoverIndex>("sp500");
  const { data, isLoading } = useQuery({
    queryKey: ["movers", index],
    queryFn: () => api.getMovers(index),
    staleTime: 5 * 60_000,
  });
  const session = data?.session;
  const moverTable = (rows: NonNullable<typeof data>["gainers"]) => (
    <table className="tbl">
      <tbody>
        {rows.slice(0, 8).map((s) => {
          const d = moverDisplay(s, session);
          return (
            <tr key={s.symbol}>
              <td>
                <span className="cell-main">{s.symbol}</span>{" "}
                <span className="cell-sub">{s.name}</span>
              </td>
              <td className="num">{fmtPrice(d.price)}</td>
              <td className={`num ${changeClass(d.pct)}`}>{fmtPct(d.pct)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
  const sessionBadge =
    session === "pre"
      ? { label: "Pre-market", tone: "hold" }
      : session === "post"
        ? { label: "After-hours", tone: "neutral" }
        : { label: "Today", tone: "buy" };
  return (
    <Card>
      <div className="page-header">
        <strong>Movers</strong>
        {session && (
          <span className="ui-badge" data-tone={sessionBadge.tone}>
            {sessionBadge.label}
          </span>
        )}
      </div>
      <ChipRow>
        {MOVER_INDICES.map((i) => (
          <Chip
            key={i.param}
            label={i.label}
            active={index === i.param}
            onClick={() => setIndex(i.param)}
          />
        ))}
      </ChipRow>
      {isLoading || !data ? (
        <SkeletonList rows={6} height={26} />
      ) : (
        <div className="grid-2">
          <div>
            <strong className="num-up">Gainers</strong>
            {moverTable(data.gainers)}
          </div>
          <div>
            <strong className="num-down">Losers</strong>
            {moverTable(data.losers)}
          </div>
        </div>
      )}
      {data?.lastUpdated && <FreshnessBar lastUpdated={data.lastUpdated} />}
    </Card>
  );
}

// ── Multibaggers: country-specific 10X stock scanner ─────────────────────

function MultibaggersTab() {
  const [country, setCountry] = useState<MultibaggerCountry>("us");
  const [version, setVersion] = useState<"v1" | "v2">("v1");
  const [minSignals, setMinSignals] = useState(0);
  const [query, setQuery] = useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["multibaggers", country, version],
    queryFn: () => api.getMultibaggers(country, version),
    staleTime: 30 * 60_000,
  });

  const rows = useMemo(() => {
    let assets = data?.assets ?? [];
    const q = query.trim().toLowerCase();
    if (q)
      assets = assets.filter(
        (a) => a.name.toLowerCase().includes(q) || a.symbol.toLowerCase().includes(q),
      );
    return assets
      .filter((a) => a.signalsActive >= minSignals)
      .sort((a, b) => b.signalsActive - a.signalsActive);
  }, [data, minSignals, query]);

  return (
    <>
      <ChipRow>
        {MULTIBAGGER_COUNTRIES.map((c) => (
          <Chip
            key={c.param}
            label={c.label}
            active={country === c.param}
            onClick={() => {
              setCountry(c.param);
              setMinSignals(0);
            }}
          />
        ))}
      </ChipRow>
      <div className="toolbar">
        <ChipRow>
          <Chip label="v1" active={version === "v1"} onClick={() => setVersion("v1")} />
          <Chip label="v2" active={version === "v2"} onClick={() => setVersion("v2")} />
        </ChipRow>
        <ChipRow>
          {[0, 1, 2, 3].map((n) => (
            <Chip
              key={n}
              label={n === 0 ? "All" : `${n}+ signals`}
              active={minSignals === n}
              onClick={() => setMinSignals(n)}
            />
          ))}
        </ChipRow>
        <input
          className="search-input"
          placeholder="Filter results…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {error ? (
        <ErrorView message={(error as Error).message} onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <SkeletonList rows={10} />
      ) : (
        <>
          <FreshnessBar lastUpdated={data.lastUpdated} />
          <div className="tbl-wrap" style={{ maxHeight: "66vh" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Stock</th>
                  <th className="num">Price</th>
                  <th className="num">1D %</th>
                  <th className="num">Vol ratio</th>
                  <th className="num">Signals active</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.symbol}>
                    <td>
                      <span className="cell-main">{a.name}</span>{" "}
                      <span className="cell-sub">{a.symbol}</span>
                    </td>
                    <td className="num">{fmtPrice(a.price)}</td>
                    <td className={`num ${changeClass(a.changePercent)}`}>
                      {fmtPct(a.changePercent)}
                    </td>
                    <td className="num">
                      {a.volumeRatio != null ? `${a.volumeRatio.toFixed(2)}×` : "—"}
                    </td>
                    <td className="num cell-main">{a.signalsActive}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

// ── Earnings calendar ─────────────────────────────────────────────────────

// 🌅 before open (BMO) / 🌙 after close (AMC)
function earningsTimeIcon(time?: string | null): { icon: string; label: string } | null {
  if (time === "pre-market") return { icon: "🌅", label: "Before open" };
  if (time === "after-hours") return { icon: "🌙", label: "After close" };
  return null;
}

const EARNINGS_SECTOR_EMOJI: Record<string, string> = {
  "Information Technology": "💻",
  Financials: "🏦",
  "Health Care": "💊",
  "Consumer Discretionary": "🛍️",
  "Consumer Staples": "🛒",
  Energy: "⚡",
  Industrials: "🏭",
  "Communication Services": "📡",
  Materials: "⛏️",
  "Real Estate": "🏠",
  Utilities: "🔌",
};

function EarningsTab() {
  const navigate = useNavigate();
  const [days, setDays] = useState(15);
  const [query, setQuery] = useState("");
  const [megaOnly, setMegaOnly] = useState(false);
  const [sector, setSector] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["earnings", days],
    queryFn: () => api.getEarningsCalendar(days),
    staleTime: 6 * 3600_000,
  });

  // Sectors present in the window (for the filter chips).
  const sectors = useMemo(() => {
    const s = new Set<string>();
    for (const e of data?.items ?? []) if (e.sector) s.add(e.sector);
    return Array.from(s).sort();
  }, [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.items ?? []).filter((e) => {
      if (megaOnly && (e.marketCap ?? 0) < 100e9) return false;
      if (sector && e.sector !== sector) return false;
      if (!q) return true;
      return e.symbol.toLowerCase().includes(q) || (e.name ?? "").toLowerCase().includes(q);
    });
  }, [data, query, megaOnly, sector]);

  const grouped = useMemo(() => {
    const byDate = new Map<string, typeof filtered>();
    for (const item of filtered) {
      const d = item.earningsDate ?? "TBD";
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d)!.push(item);
    }
    return Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  // Busiest day in the filtered window.
  const busiest = useMemo(() => {
    let top: { date: string; n: number } | null = null;
    for (const [date, items] of grouped) {
      if (!top || items.length > top.n) top = { date, n: items.length };
    }
    return top;
  }, [grouped]);

  if (error)
    return <ErrorView message={(error as Error).message} onRetry={() => void refetch()} />;
  return (
    <>
      <div className="toolbar">
        <ChipRow>
          {[7, 15, 30].map((d) => (
            <Chip key={d} label={`${d} days`} active={days === d} onClick={() => setDays(d)} />
          ))}
          <Chip label="Mega-caps" active={megaOnly} onClick={() => setMegaOnly((v) => !v)} />
        </ChipRow>
        {sectors.length > 0 ? (
          <ChipRow>
            <Chip label="All sectors" active={sector === null} onClick={() => setSector(null)} />
            {sectors.map((s) => (
              <Chip
                key={s}
                label={`${EARNINGS_SECTOR_EMOJI[s] ?? "📊"} ${s}`}
                active={sector === s}
                onClick={() => setSector((cur) => (cur === s ? null : s))}
              />
            ))}
          </ChipRow>
        ) : null}
        <input
          className="search-input"
          placeholder="Filter by symbol or name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <FreshnessBar lastUpdated={data?.lastUpdated} />
      </div>
      {isLoading || !data ? (
        <SkeletonList rows={10} />
      ) : grouped.length === 0 ? (
        <Card>
          <div className="cell-sub">
            {query || megaOnly || sector
              ? "No earnings match your filter."
              : `No earnings scheduled in the next ${days} days.`}
          </div>
        </Card>
      ) : (
        <>
          <div className="cell-sub" style={{ margin: "var(--s2) 0" }}>
            {filtered.length} companies reporting · S&P 500
            {busiest ? ` · Busiest: ${busiest.date} (${busiest.n})` : ""}
          </div>
          <div className="tbl-wrap" style={{ maxHeight: "70vh" }}>
            {grouped.map(([date, items]) => (
              <div key={date}>
                <div
                  style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                    background: "var(--surface)",
                    padding: "var(--s2) var(--s1)",
                    fontWeight: 700,
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  {date} <span className="cell-sub">· {items.length}</span>
                </div>
                <table className="tbl">
                  <tbody>
                    {items.map((e) => {
                      const t = earningsTimeIcon(e.time);
                      const g = e.epsGrowthPct;
                      return (
                        <tr
                          key={e.symbol}
                          className="clickable"
                          onClick={() =>
                            void navigate({
                              to: "/asset/$symbol",
                              params: { symbol: e.symbol },
                              search: { name: e.name ?? undefined },
                            })
                          }
                        >
                          <td className="cell-main">
                            {t ? <span title={t.label} style={{ marginRight: 6 }}>{t.icon}</span> : null}
                            {e.symbol}
                          </td>
                          <td>{e.name ?? "—"}</td>
                          <td className="cell-sub">{e.marketCapFormatted ?? ""}</td>
                          <td className="cell-sub">
                            {e.epsForecast ? `est. ${e.epsForecast}` : ""}
                            {e.lastYearEps ? ` · last year ${e.lastYearEps}` : ""}
                            {typeof g === "number" ? (
                              <span
                                style={{
                                  marginLeft: 6,
                                  fontWeight: 700,
                                  color: g >= 0 ? "var(--positive)" : "var(--danger)",
                                }}
                              >
                                {g >= 0 ? "▲" : "▼"} {g > 0 ? "+" : ""}
                                {g}% YoY
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ── Exposure: US tariff browser (free, mirrors mobile Exposure tab) ──────

type TariffSort = "rate" | "name";

function ExposureTab() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<TariffSort>("rate");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["tariffs"],
    queryFn: () => api.getTariffs(),
    staleTime: 24 * 3600_000,
  });

  const countries = useMemo(() => {
    let list: CountryTariff[] = data?.countries ?? [];
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((c) => c.countryName.toLowerCase().includes(q));
    return [...list].sort((a, b) =>
      sort === "rate"
        ? b.tariffRate - a.tariffRate
        : a.countryName.localeCompare(b.countryName),
    );
  }, [data, query, sort]);

  if (error) {
    return (
      <ErrorView message={(error as Error).message} onRetry={() => void refetch()} />
    );
  }
  if (isLoading || !data) return <SkeletonList rows={12} />;

  return (
    <>
      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Search 113+ countries…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <ChipRow>
          <Chip label="By rate" active={sort === "rate"} onClick={() => setSort("rate")} />
          <Chip label="By name" active={sort === "name"} onClick={() => setSort("name")} />
        </ChipRow>
        <span className="ui-freshness">Data as of {data.dataAsOf ?? "—"}</span>
      </div>
      <div className="tbl-wrap" style={{ maxHeight: "70vh" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Country</th>
              <th className="num">US tariff rate</th>
              <th className="num">Impact score</th>
              <th>Sectors</th>
            </tr>
          </thead>
          <tbody>
            {countries.map((c) => (
              <Fragment key={c.countryCode}>
                <tr
                  className="clickable"
                  onClick={() =>
                    setExpanded(expanded === c.countryCode ? null : c.countryCode)
                  }
                >
                  <td className="cell-main">{c.countryName}</td>
                  <td
                    className="num"
                    style={{
                      color: c.tariffRate >= 25 ? "var(--danger)" : c.tariffRate >= 10 ? "var(--warning)" : "var(--text-primary)",
                      fontWeight: 600,
                    }}
                  >
                    {c.tariffRate}%
                  </td>
                  <td className="num">
                    {c.impactScore != null ? (
                      <span
                        style={{
                          color: c.impactScore >= 70 ? "var(--danger)" : c.impactScore >= 40 ? "var(--warning)" : "var(--positive)",
                          fontWeight: 600,
                        }}
                      >
                        {c.impactScore}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="cell-sub">
                    {c.sectors.length} sectors {expanded === c.countryCode ? "▾" : "▸"}
                  </td>
                </tr>
                {expanded === c.countryCode && (
                  <tr>
                    <td colSpan={4} style={{ background: "var(--surface)" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "var(--s2)", padding: "var(--s2) 0" }}>
                        {c.laymanExplanation && (
                          <p style={{ color: "var(--text-secondary)", whiteSpace: "normal", maxWidth: 720 }}>
                            {c.laymanExplanation}
                          </p>
                        )}
                        {c.sectors.map((s) => (
                          <div key={s.sectorName} style={{ display: "flex", justifyContent: "space-between", maxWidth: 420 }}>
                            <span>{s.sectorName}</span>
                            <span className="cell-main">{s.tariffRate}%</span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Smart $ (Quiver top-10 portfolios) ────────────────────────────────────

function QuiverTable(props: { items: QuiverItem[] }) {
  const showLobbying = props.items.some((i) => i.lobbyingGrowth);
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>#</th>
          <th>Stock</th>
          <th className="num">Price</th>
          <th className="num">Change %</th>
          <th className="num">Weight</th>
          {showLobbying && <th className="num">Lobbying</th>}
        </tr>
      </thead>
      <tbody>
        {props.items.map((i) => (
          <tr key={i.symbol}>
            <td className="cell-sub">{i.rank ?? "—"}</td>
            <td>
              <span className="cell-main">{i.symbol}</span>{" "}
              <span className="cell-sub">{i.name}</span>
            </td>
            <td className="num">{fmtPrice(i.price)}</td>
            <td className={`num ${changeClass(i.changePercent)}`}>
              {fmtPct(i.changePercent)}
            </td>
            <td className="num">{i.weight != null ? `${i.weight.toFixed(1)}%` : "—"}</td>
            {showLobbying && (
              <td className="num">
                {i.lobbyingGrowth ? (
                  <span style={{ color: "var(--warning)", fontWeight: 600 }}>{i.lobbyingGrowth} QoQ</span>
                ) : (
                  "—"
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SmartMoneyTab() {
  const [strategy, setStrategy] = useState<"lobbying" | "insider">("lobbying");
  const insider = useQuery({
    queryKey: ["quiver", "insider"],
    queryFn: () => api.getQuiverInsider(),
    staleTime: 4 * 3600_000,
  });
  const lobbying = useQuery({
    queryKey: ["quiver", "lobbying"],
    queryFn: () => api.getQuiverLobbying(),
    staleTime: 4 * 3600_000,
  });
  const active = strategy === "lobbying" ? lobbying : insider;
  return (
    <>
      <ChipRow>
        <Chip
          label="Lobbying Growth"
          active={strategy === "lobbying"}
          onClick={() => setStrategy("lobbying")}
        />
        <Chip
          label="Insider Buys"
          active={strategy === "insider"}
          onClick={() => setStrategy("insider")}
        />
      </ChipRow>
      <Card>
        <strong>
          {active.data?.meta?.label ??
            (strategy === "lobbying" ? "Lobbying growth" : "Insider buying")}
        </strong>
        {active.isLoading || !active.data ? (
          <SkeletonList rows={10} height={28} />
        ) : (
          <QuiverTable items={active.data.items} />
        )}
      </Card>
    </>
  );
}

// ── Presidential (OGE Form 278-T) ────────────────────────────────────────

function PresidentialTab() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["oge"],
    queryFn: () => api.getOgeTransactions(),
    staleTime: 24 * 3600_000,
    // server sets loading=true while its PDF pipeline runs — poll until done
    refetchInterval: (q) => (q.state.data?.loading ? 15_000 : false),
  });
  if (error)
    return <ErrorView message={(error as Error).message} onRetry={() => void refetch()} />;
  if (isLoading || !data) return <SkeletonList rows={10} />;

  // Newest filing is Pro-gated (teaser-only on web); every earlier filing is
  // free. Mirrors mobile's presidential_latest_filing gate. The whole gated
  // batch collapses into a single compact teaser row instead of blurring
  // each record — that batch alone can be hundreds of rows.
  const latestFilingDate = data.transactions.reduce<string | null>(
    (max, t) => (t.filingDate && (!max || t.filingDate > max) ? t.filingDate : max),
    null,
  );
  const gatedCount = data.transactions.filter((t) => t.filingDate === latestFilingDate).length;
  const visible = data.transactions.filter((t) => t.filingDate !== latestFilingDate);

  return (
    <Card>
      <div className="page-header">
        <strong>Presidential transactions ≥ $100K (OGE Form 278-T)</strong>
        <FreshnessBar lastUpdated={data.lastUpdated} />
      </div>
      {data.loading && (
        <div className="cell-sub" style={{ marginBottom: "var(--s3)" }}>
          Server is still processing filings — list may grow.
        </div>
      )}
      <table className="tbl">
        <thead>
          <tr>
            <th>Description</th>
            <th>Type</th>
            <th>Date</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {gatedCount > 0 && (
            <tr>
              <td colSpan={4} style={{ padding: 0 }}>
                <div className="presidential-teaser">
                  <span className="presidential-teaser-lock">🔒</span>
                  <div>
                    <div className="cell-main">
                      {gatedCount} latest filing{gatedCount === 1 ? "" : "s"}
                      {latestFilingDate ? ` · Filed ${latestFilingDate}` : ""}
                    </div>
                    <div className="cell-sub">Upgrade to Pro to see the newest disclosures</div>
                  </div>
                </div>
              </td>
            </tr>
          )}
          {visible.map((t, i) => (
            <tr key={i}>
              <td className="cell-main" style={{ whiteSpace: "normal" }}>
                {t.description}
              </td>
              <td>
                <span
                  className="ui-badge"
                  data-tone={t.type === "purchase" ? "buy" : t.type === "sale" ? "sell" : "hold"}
                >
                  {(t.type ?? "—").toUpperCase()}
                </span>
              </td>
              <td className="cell-sub">{t.date ?? "—"}</td>
              <td className="num">{t.amount ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ── ETF Explorer ──────────────────────────────────────────────────────────

const ETF_CATEGORIES: { id: EtfCategory | ""; label: string }[] = [
  { id: "", label: "All" },
  { id: "sector", label: "Sector" },
  { id: "broad", label: "Broad Market" },
  { id: "international", label: "International" },
  { id: "fixed_income", label: "Fixed Income" },
  { id: "commodity", label: "Commodity" },
  { id: "thematic", label: "Thematic" },
  { id: "leveraged", label: "Leveraged/Inverse" },
];

const RRG_QUADRANTS = ["Leading", "Improving", "Weakening", "Lagging"] as const;

function EtfExplorerTab() {
  const [category, setCategory] = useState<EtfCategory | "">("");
  const [view, setView] = useState<"list" | "rotation">("list");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s4)" }}>
      {/* Each filter dimension gets its own labeled row — a single row sharing
          space between 8 category chips and the view toggle left most
          categories cramped or wrapping unpredictably. */}
      <Card>
        <div className="cell-sub" style={{ marginBottom: "var(--s2)" }}>
          Category
        </div>
        <ChipRow>
          {ETF_CATEGORIES.map((c) => (
            <Chip
              key={c.id || "all"}
              label={c.label}
              active={category === c.id}
              onClick={() => setCategory(c.id)}
            />
          ))}
        </ChipRow>
        <div className="cell-sub" style={{ margin: "var(--s3) 0 var(--s2)" }}>
          View
        </div>
        <ChipRow>
          <Chip label="List" active={view === "list"} onClick={() => setView("list")} />
          <Chip
            label="Rotation"
            active={view === "rotation"}
            // Rotation only covers 4 of 7 categories — reset to All so
            // switching views never lands on an empty view.
            onClick={() => {
              setView("rotation");
              setCategory("");
            }}
          />
        </ChipRow>
      </Card>
      {view === "list" ? (
        <EtfListView category={category} />
      ) : (
        <EtfRotationView category={category} />
      )}
    </div>
  );
}

/** Rolling-window returns (not calendar-quarter-aligned): MoM = trailing
    1mo, QoQ = trailing 3mo, YoY = trailing 1y. Pro-gated teaser (permanent
    on web — no purchase flow): only one ETF in the whole list has
    `revealed` true (picked by the parent list); every other row's strip is
    blurred as a single unit. */
function EtfPerfStrip({ item, revealed }: { item: EtfItem; revealed: boolean }) {
  const metrics: [string, number | null | undefined][] = [
    ["MoM", item.perf1M],
    ["QoQ", item.perf3M],
    ["YoY", item.perf1Y],
  ];
  const strip = (
    <div className="cell-sub" style={{ marginTop: 2 }}>
      {metrics.map(([label, value], i) => (
        <span key={label} style={{ marginLeft: i > 0 ? 10 : 0 }}>
          {label} <span className={changeClass(value)}>{fmtPct(value)}</span>
        </span>
      ))}
    </div>
  );
  if (revealed) return strip;

  const values = metrics.map(([, v]) => v).filter((v): v is number => v != null);
  const avg = values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
  return (
    <ProBlur positive={avg >= 0} className="etf-perf-blur">
      {strip}
    </ProBlur>
  );
}

function EtfListView(props: { category: EtfCategory | "" }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["etf", "list", props.category],
    queryFn: () => api.getEtfList(props.category || undefined),
    staleTime: 10 * 60_000,
  });
  // Exactly one ETF in the list gets its MoM/QoQ/YoY strip revealed; every
  // other row's strip is blurred as a single unit (permanent teaser — web
  // has no purchase flow). Picked once per data load, not on every render.
  // That ETF is moved to the top of the list so it's visible without
  // scrolling.
  const revealSymbol = useMemo(
    () =>
      data && data.items.length > 0
        ? (data.items[Math.floor(Math.random() * data.items.length)]?.symbol ?? null)
        : null,
    [data],
  );
  const orderedItems = useMemo(() => {
    if (!data) return [];
    const idx = revealSymbol ? data.items.findIndex((i) => i.symbol === revealSymbol) : -1;
    const picked = idx > 0 ? data.items[idx] : undefined;
    if (!picked) return data.items;
    return [picked, ...data.items.slice(0, idx), ...data.items.slice(idx + 1)];
  }, [data, revealSymbol]);

  if (error)
    return <ErrorView message={(error as Error).message} onRetry={() => void refetch()} />;
  if (isLoading || !data) return <SkeletonList rows={10} />;

  return (
    <Card>
      <div className="page-header">
        <strong>{data.items.length} ETFs</strong>
        <FreshnessBar lastUpdated={data.lastUpdated} />
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>ETF</th>
            <th className="num">Price</th>
            <th className="num">Change %</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {orderedItems.map((item) => (
            <Fragment key={item.symbol}>
              <tr
                className="clickable"
                onClick={() =>
                  void navigate({
                    to: "/asset/$symbol",
                    params: { symbol: item.symbol },
                    search: { name: item.name },
                  })
                }
              >
                <td>
                  <span style={{ marginRight: 8 }}>{item.emoji}</span>
                  <span className="cell-main">{item.symbol}</span>{" "}
                  <span className="cell-sub">{item.name}</span>
                  {item.risk === "leveraged" && (
                    <span className="ui-badge" data-tone="sell" style={{ marginLeft: 6 }}>
                      LEV
                    </span>
                  )}
                  <EtfPerfStrip item={item} revealed={item.symbol === revealSymbol} />
                </td>
                <td className="num cell-main">
                  {item.price != null ? `$${fmtPrice(item.price)}` : "—"}
                </td>
                <td className={`num ${changeClass(item.changePercent)}`}>{fmtPct(item.changePercent)}</td>
                <td>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpanded(expanded === item.symbol ? null : item.symbol);
                    }}
                  >
                    {expanded === item.symbol ? "Hide" : "Fund data"}
                  </button>
                </td>
              </tr>
              {expanded === item.symbol && (
                <tr>
                  <td colSpan={4}>
                    <EtfProfilePanel item={item} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function EtfProfilePanel(props: { item: EtfItem }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["etf", "profile", props.item.symbol],
    queryFn: () => api.getEtfProfile(props.item.symbol),
    staleTime: 24 * 3600_000,
  });

  if (isLoading || !data) return <SkeletonList rows={3} height={20} />;
  if (error) return <div className="cell-sub">Fund data unavailable right now.</div>;

  const topSectors = [...data.sectorWeightings]
    .filter((s) => s.weightPct != null)
    .sort((a, b) => (b.weightPct ?? 0) - (a.weightPct ?? 0))
    .slice(0, 8);

  return (
    <div style={{ display: "flex", gap: "var(--s6)", flexWrap: "wrap", padding: "var(--s3) 0" }}>
      <div>
        <div className="cell-sub">Expense Ratio</div>
        <div className="cell-main">
          {data.expenseRatio != null ? `${data.expenseRatio.toFixed(2)}%` : "—"}
        </div>
      </div>
      <div>
        <div className="cell-sub">AUM</div>
        <div className="cell-main">{data.aum != null ? `$${fmtCompact(data.aum)}` : "—"}</div>
      </div>
      {data.family && (
        <div>
          <div className="cell-sub">Issuer</div>
          <div className="cell-main">{data.family}</div>
        </div>
      )}
      {topSectors.length > 0 && (
        <div>
          <div className="cell-sub">Sector Weights</div>
          {topSectors.map((s) => (
            <div key={s.sector} className="cell-sub">
              {s.sector}: {s.weightPct?.toFixed(1)}%
            </div>
          ))}
        </div>
      )}
      {data.holdings.length > 0 && (
        <div>
          <div className="cell-sub">Top Holdings</div>
          {data.holdings.map((h) => (
            <div key={h.symbol ?? h.name} className="cell-sub">
              {h.symbol}: {h.weightPct?.toFixed(1)}%
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Must match ETF_ROTATION_CATEGORIES in server/data/etf_universe.ts.
const RRG_ELIGIBLE_CATEGORIES = new Set<EtfCategory>([
  "sector",
  "broad",
  "international",
  "thematic",
]);

function EtfRotationView(props: { category: EtfCategory | "" }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["etf", "rotation"],
    queryFn: () => api.getEtfRotation(),
    staleTime: 15 * 60_000,
  });

  if (props.category && !RRG_ELIGIBLE_CATEGORIES.has(props.category)) {
    return (
      <Card>
        <div className="cell-sub" style={{ textAlign: "center", padding: "var(--s4) 0" }}>
          RRG rotation only applies to Sector, Broad Market, International, and Thematic
          ETFs — not available for this category.
        </div>
      </Card>
    );
  }

  if (error)
    return <ErrorView message={(error as Error).message} onRetry={() => void refetch()} />;
  if (isLoading || !data) return <SkeletonList rows={6} />;

  const filtered = props.category
    ? data.items.filter((i) => i.category === props.category)
    : data.items;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s4)" }}>
      {RRG_QUADRANTS.map((q) => {
        const items = filtered.filter((i) => i.quadrant === q);
        if (items.length === 0) return null;
        return (
          <Card key={q}>
            <strong>{q}</strong>
            <table className="tbl">
              <tbody>
                {items.map((item) => (
                  <tr key={item.symbol}>
                    <td>
                      <span style={{ marginRight: 8 }}>{item.emoji}</span>
                      <span className="cell-main">{item.symbol}</span>{" "}
                      <span className="cell-sub">{item.name}</span>
                    </td>
                    <td className="num cell-sub">rsRatio {item.rsRatio?.toFixed(1) ?? "—"}</td>
                    <td className="num cell-sub">rsMomentum {item.rsMomentum?.toFixed(1) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        );
      })}
    </div>
  );
}
