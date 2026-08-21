import { useEffect, useMemo, useReducer, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { MarketItem, TreemapStock } from "@monysa/contracts";
import { Sparkline } from "@monysa/charts";
import {
  changeClass,
  ErrorView,
  fmtPct,
  fmtPrice,
  FreshnessBar,
  Skeleton,
  SkeletonList,
} from "@monysa/ui";
import { api } from "../../lib/api";
import { sessionStatuses } from "../../lib/sessions";
import { HoldingsTable } from "../../components/HoldingsTable";

/* ── Section shell ─────────────────────────────────────────────────────── */

function Section(props: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`ov-section ${props.className ?? ""}`}>
      <header className="ov-section-head">
        <h2 className="ov-section-title">{props.title}</h2>
        {props.aside}
      </header>
      {props.children}
    </section>
  );
}

/* ── Session strip ─────────────────────────────────────────────────────── */

/** Which exchanges are trading right now. A global markets page is the one
    place this belongs; it answers "is this price live or last night's close?"
    before the user reads a single number. */
function SessionStrip() {
  const [, retick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const id = setInterval(retick, 30_000);
    return () => clearInterval(id);
  }, []);

  const statuses = sessionStatuses();
  const openCount = statuses.filter((s) => s.open).length;

  return (
    <div className="ov-sessions" role="group" aria-label="Global exchange sessions">
      <span className="ov-sessions-count">
        {openCount > 0 ? `${openCount} of ${statuses.length} open` : "All closed"}
      </span>
      <div className="ov-sessions-list">
        {statuses.map((s) => (
          <span
            key={s.code}
            className="ov-session"
            data-open={s.open ? "true" : "false"}
            title={`${s.city} — ${s.open ? "Open" : "Closed"} (${s.time} local)`}
          >
            <span className="ov-session-dot" aria-hidden="true" />
            <span className="ov-session-code">{s.code}</span>
            <span className="ov-session-time">{s.time}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Index rail ────────────────────────────────────────────────────────── */

/** The headline indices, in a scannable row. Replaces three stacked metric
    cards that showed the same three US names and nothing else. */
// Short display labels: at eight-across each tile is ~130px, and the server's
// full names ("NASDAQ Composite", "Hang Seng Index") would ellipsize to noise.
// Safe to shorten here because the rail is already a curated symbol list, not a
// rendering of whatever the feed returns.
const RAIL = [
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^IXIC", label: "NASDAQ" },
  { symbol: "^DJI", label: "Dow Jones" },
  { symbol: "^FTSE", label: "FTSE 100" },
  { symbol: "^GDAXI", label: "DAX 40" },
  { symbol: "^N225", label: "Nikkei 225" },
  { symbol: "^HSI", label: "Hang Seng" },
  { symbol: "^NSEI", label: "Nifty 50" },
] as const;

function IndexRail({ items, loading }: { items: MarketItem[]; loading: boolean }) {
  const navigate = useNavigate();
  if (loading) {
    return (
      <div className="ov-rail">
        {RAIL.map((r) => (
          <div className="ov-rail-card" key={r.symbol}>
            <Skeleton height={58} />
          </div>
        ))}
      </div>
    );
  }
  const bySymbol = new Map(items.map((i) => [i.symbol, i]));
  const rail: (MarketItem & { label: string })[] = [];
  for (const r of RAIL) {
    const item = bySymbol.get(r.symbol);
    if (item) rail.push({ ...item, label: r.label });
  }
  if (rail.length === 0) return null;

  return (
    <div className="ov-rail">
      {rail.map((i) => (
        <button
          type="button"
          className="ov-rail-card"
          key={i.symbol}
          onClick={() =>
            void navigate({
              to: "/asset/$symbol",
              params: { symbol: i.symbol },
              search: { name: i.name },
            })
          }
        >
          <span className="ov-rail-name" title={i.name}>
            <span aria-hidden="true">{i.flag ?? ""}</span> {i.label}
          </span>
          {/* No currency suffix here: index levels read as levels, and appending
              " GBP"/" JPY" overflowed the card. The Global indices table below
              carries the currency. Mirrors _IndexCard, which passes unit=null. */}
          <span className="ov-rail-value">{fmtPrice(i.price)}</span>
          <span className="ov-rail-foot">
            <span className={`ov-rail-pct ${changeClass(i.changePercent)}`}>
              {fmtPct(i.changePercent)}
            </span>
            {i.sparkline && i.sparkline.length > 1 && (
              <Sparkline
                points={i.sparkline}
                width={48}
                height={18}
                positive={(i.changePercent ?? 0) >= 0}
              />
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

/* ── Sector performance ────────────────────────────────────────────────── */

const SECTOR_WINDOWS = [
  { key: "1D", label: "1D" },
  { key: "1W", label: "1W" },
  { key: "1M", label: "1M" },
] as const;
type SectorWindow = (typeof SECTOR_WINDOWS)[number]["key"];

/** Ranked diverging bars. The old donut gave all 11 sectors `value: 1`, so the
    ring encoded nothing at all — and a donut is the wrong mark for ranked
    signed data regardless. Bars sort by the selected window and are read
    against a shared zero line. */
function SectorBars() {
  const [win, setWin] = useState<SectorWindow>("1D");
  const { data, isLoading } = useQuery({
    queryKey: ["sectors"],
    queryFn: () => api.getSectors(),
    staleTime: 15 * 60_000,
  });

  const rows = useMemo(() => {
    const pick = (s: { changePercent?: number | null; perf1W?: number | null; perf1M?: number | null }) =>
      win === "1D" ? s.changePercent : win === "1W" ? s.perf1W : s.perf1M;
    return (data?.sectors ?? [])
      .map((s) => ({
        name: s.name.replace(/ sector$/i, ""),
        emoji: s.emoji ?? "",
        value: pick(s) ?? null,
      }))
      .filter((s) => s.value != null)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  }, [data, win]);

  const max = Math.max(0.01, ...rows.map((r) => Math.abs(r.value ?? 0)));

  return (
    <Section
      title="Sector performance"
      aside={
        <div className="ov-seg" role="group" aria-label="Sector timeframe">
          {SECTOR_WINDOWS.map((w) => (
            <button
              key={w.key}
              type="button"
              className="ov-seg-btn"
              data-active={win === w.key ? "true" : "false"}
              aria-pressed={win === w.key}
              onClick={() => setWin(w.key)}
            >
              {w.label}
            </button>
          ))}
        </div>
      }
    >
      {isLoading ? (
        <SkeletonList rows={6} height={22} />
      ) : rows.length === 0 ? (
        <p className="cell-sub">No sector data available right now.</p>
      ) : (
        <ul className="ov-bars">
          {rows.map((r) => {
            const v = r.value ?? 0;
            const pct = (Math.abs(v) / max) * 50;
            return (
              <li className="ov-bar-row" key={r.name}>
                <span className="ov-bar-label">
                  <span aria-hidden="true">{r.emoji}</span> {r.name}
                </span>
                <span className="ov-bar-track">
                  <span className="ov-bar-zero" aria-hidden="true" />
                  <span
                    className="ov-bar-fill"
                    data-dir={v >= 0 ? "up" : "down"}
                    style={
                      v >= 0
                        ? { left: "50%", width: `${pct}%` }
                        : { right: "50%", width: `${pct}%` }
                    }
                  />
                </span>
                <span className={`ov-bar-val ${changeClass(v)}`}>{fmtPct(v)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

/* ── Movers ────────────────────────────────────────────────────────────── */

/** The server RANKS gainers/losers by the active session's move, so the card
    must display that same field or the list reads as nonsense (an after-hours
    gainer showing its regular-close loss). Note `session` arrives lowercase
    ("post") while `marketState` is upper ("POST") — normalise before matching. */
function moverPct(session: string | null | undefined, s: TreemapStock): number | null {
  switch ((session ?? "").toUpperCase()) {
    case "OVERNIGHT":
      return s.overnightChangePercent ?? s.changePercent ?? null;
    case "PRE":
    case "PREPRE":
      return s.preMarketChangePercent ?? s.changePercent ?? null;
    case "POST":
    case "POSTPOST":
      return s.postMarketChangePercent ?? s.changePercent ?? null;
    default:
      return s.changePercent ?? null;
  }
}

const SESSION_LABEL: Record<string, string> = {
  REGULAR: "Regular session",
  PRE: "Pre-market",
  PREPRE: "Pre-market",
  POST: "After-hours",
  POSTPOST: "After-hours",
  OVERNIGHT: "Overnight",
};

/** Real S&P 500 constituents. The previous card ranked the 46 world indices,
    so "top gainer" was routinely the VIX — technically true, useless as a
    market mover. */
function MoversCardLive() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["movers", "sp500"],
    queryFn: () => api.getMovers("sp500"),
    staleTime: 5 * 60_000,
  });

  const session = (data?.session ?? data?.marketState ?? "").toUpperCase();

  const render = (rows: TreemapStock[]) => (
    <ul className="ov-movers">
      {rows.slice(0, 5).map((s) => {
        const pct = moverPct(session, s);
        // Direction comes from the number on screen, not from which array the
        // row arrived in — they can disagree at a session boundary.
        const dir = (pct ?? 0) >= 0 ? "up" : "down";
        return (
          <li key={s.symbol}>
            <button
              type="button"
              className="ov-mover"
              onClick={() =>
                void navigate({
                  to: "/asset/$symbol",
                  params: { symbol: s.symbol },
                  search: { name: s.name },
                })
              }
            >
              <span className="ov-mover-arrow" data-dir={dir} aria-hidden="true">
                {dir === "up" ? "▲" : "▼"}
              </span>
              <span className="ov-mover-sym">{s.symbol}</span>
              <span className="ov-mover-name" title={s.name}>
                {s.name}
              </span>
              <span className={`ov-mover-pct ${changeClass(pct)}`}>{fmtPct(pct)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <Section
      title="Movers"
      aside={
        <span className="cell-sub">
          S&amp;P 500{session && SESSION_LABEL[session] ? ` · ${SESSION_LABEL[session]}` : ""}
        </span>
      }
    >
      {isLoading ? (
        <SkeletonList rows={6} height={26} />
      ) : !data || (data.gainers.length === 0 && data.losers.length === 0) ? (
        <p className="cell-sub">No mover data available right now.</p>
      ) : (
        <>
          {render(data.gainers)}
          <div className="ov-movers-split" />
          {render(data.losers)}
        </>
      )}
    </Section>
  );
}

/* ── Breadth ───────────────────────────────────────────────────────────── */

/** How many tracked assets are in a bullish vs bearish regime right now — the
    "what is the market actually doing" line the overview was missing. */
function BreadthCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["regime-summary"],
    queryFn: () => api.getRegimeSummary(),
    staleTime: 15 * 60_000,
  });

  if (isLoading) return <Section title="Breadth"><SkeletonList rows={3} height={26} /></Section>;
  if (!data) return null;

  const total = Math.max(1, data.total);
  const seg = [
    { key: "Bullish", n: data.bullish, dir: "up" as const },
    { key: "Neutral", n: data.neutral, dir: "flat" as const },
    { key: "Bearish", n: data.bearish, dir: "down" as const },
  ];

  return (
    <Section title="Breadth" aside={<span className="cell-sub">{data.total} assets</span>}>
      <div className="ov-breadth-bar" role="img"
        aria-label={`${data.bullish} bullish, ${data.neutral} neutral, ${data.bearish} bearish of ${data.total}`}>
        {seg.map((s) => (
          <span
            key={s.key}
            className="ov-breadth-seg"
            data-dir={s.dir}
            style={{ width: `${(s.n / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="ov-breadth-legend">
        {seg.map((s) => (
          <span key={s.key} className="ov-breadth-item">
            <span className="ov-breadth-key" data-dir={s.dir} aria-hidden="true" />
            {s.key} <strong>{s.n}</strong>
          </span>
        ))}
      </div>
      {(data.topBullish.length > 0 || data.topBearish.length > 0) && (
        <dl className="ov-breadth-lead">
          {data.topBullish.length > 0 && (
            <div>
              <dt>Strongest</dt>
              <dd className="num-up">
                {data.topBullish.slice(0, 3).map((a) => a.symbol).join(" · ")}
              </dd>
            </div>
          )}
          {data.topBearish.length > 0 && (
            <div>
              <dt>Weakest</dt>
              <dd className="num-down">
                {data.topBearish.slice(0, 3).map((a) => a.symbol).join(" · ")}
              </dd>
            </div>
          )}
        </dl>
      )}
    </Section>
  );
}

/* ── Rates & sentiment ─────────────────────────────────────────────────── */

function fearGreedTone(v: number): string {
  if (v < 25) return "num-down";
  if (v < 45) return "num-flat";
  if (v < 55) return "num-flat";
  return "num-up";
}

/** The full curve, not just the two tenors the old chip row happened to show. */
function RatesCard() {
  const bondsQ = useQuery({
    queryKey: ["bonds"],
    queryFn: () => api.getBonds(),
    staleTime: 30 * 60_000,
  });
  const fgQ = useQuery({
    queryKey: ["fear-greed"],
    queryFn: () => api.getFearGreed(),
    staleTime: 30 * 60_000,
  });
  const b = bondsQ.data;
  const fg = fgQ.data;

  const tenors = [
    { label: "3M", v: b?.us3m },
    { label: "5Y", v: b?.us5y },
    { label: "10Y", v: b?.us10y },
    { label: "30Y", v: b?.us30y },
  ];

  return (
    <Section
      title="Rates & sentiment"
      aside={
        b?.curveStatus ? (
          <span className="ov-section-aside">
            <span className="ov-pill" data-tone={b.curveStatus === "inverted" ? "warn" : "ok"}>
              Curve {b.curveStatus}
            </span>
            <span className="cell-sub">
              3M–10Y {b.spread3m10y >= 0 ? "+" : ""}
              {b.spread3m10y.toFixed(0)}bps
            </span>
          </span>
        ) : undefined
      }
    >
      <div className="ov-tenors">
        {tenors.map((t) => (
          <div className="ov-tenor" key={t.label}>
            <span className="ov-tenor-label">US {t.label}</span>
            <span className="ov-tenor-val">{t.v != null ? `${t.v.toFixed(2)}%` : "—"}</span>
          </div>
        ))}
        <div className="ov-tenor">
          <span className="ov-tenor-label">Fear &amp; Greed</span>
          <span className={`ov-tenor-val ${fg ? fearGreedTone(fg.value) : ""}`}>
            {fg ? Math.round(fg.value) : "—"}
          </span>
          {fg?.classification && (
            <span className="cell-sub">{fg.classification}</span>
          )}
        </div>
      </div>
    </Section>
  );
}

/* ── Overview ──────────────────────────────────────────────────────────── */

export function OverviewTab() {
  const indicesQ = useQuery({
    queryKey: ["futures", "indices"],
    queryFn: () => api.getIndices(),
    staleTime: 10 * 60_000,
  });

  if (indicesQ.error) {
    return (
      <ErrorView
        message={(indicesQ.error as Error).message}
        onRetry={() => void indicesQ.refetch()}
      />
    );
  }

  const items = indicesQ.data?.items ?? [];
  // World-spanning sample rather than the first 8 in list order.
  const table = items.filter((i) => i.price != null).slice(0, 12);

  return (
    <div className="ov ui-enter">
      <SessionStrip />
      <IndexRail items={items} loading={indicesQ.isLoading} />

      <div className="ov-grid">
        <div className="ov-col">
          <Section
            title="Global indices"
            aside={<FreshnessBar lastUpdated={indicesQ.data?.lastUpdated} />}
          >
            {indicesQ.isLoading ? (
              <SkeletonList rows={8} height={38} />
            ) : (
              <div className="tbl-wrap">
                <HoldingsTable items={table} />
              </div>
            )}
          </Section>
          <SectorBars />
        </div>

        <div className="ov-col">
          <BreadthCard />
          <MoversCardLive />
          <RatesCard />
        </div>
      </div>
    </div>
  );
}
