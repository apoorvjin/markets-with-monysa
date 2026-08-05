import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type {
  AirspaceEvent,
  MaritimeWarning,
  PredictionMarket,
  Quake,
} from "@monysa/contracts";
import { fmtCompact, timeAgo } from "@monysa/ui";
import { api } from "../../lib/api";

export function IntelligencePage() {
  return (
    <div className="wire-grid intel-grid">
      <SeismicCard />
      <MarketsCard />
      <MaritimeCard />
      <AirspaceCard />
    </div>
  );
}

/* ── shared card shell ───────────────────────────────────────────────────── */

function CardShell<T>(props: {
  title: string;
  query: UseQueryResult<{ items: T[]; lastUpdated?: string | null }>;
  empty: string;
  children: (items: T[]) => ReactNode;
}) {
  const { data, isLoading, error, isFetching } = props.query;
  const items = data?.items ?? [];
  return (
    <section className="wire-col intel-card">
      <div className="wire-col-head">
        <span className="wire-col-name">{props.title}</span>
        <div className="wire-col-meta">
          <span className="wire-status" data-on={error ? "false" : "true"}>
            <span className="wire-status-dot" data-pulse={isFetching ? "true" : "false"} />
            {error ? "OFFLINE" : "LIVE"}
          </span>
          <span className="wire-col-count">{items.length}</span>
        </div>
      </div>
      <div className="wire-col-body">
        {isLoading ? (
          <div className="wire-col-loading">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="wire-skel" />
            ))}
          </div>
        ) : error ? (
          <div className="wire-col-empty">Source unavailable.</div>
        ) : items.length === 0 ? (
          <div className="wire-col-empty">{props.empty}</div>
        ) : (
          props.children(items)
        )}
      </div>
    </section>
  );
}

/* ── Seismic (USGS) ──────────────────────────────────────────────────────── */

function magBand(mag: number | null): "major" | "strong" | "moderate" | "minor" {
  if (mag == null) return "minor";
  if (mag >= 6) return "major";
  if (mag >= 5) return "strong";
  if (mag >= 4) return "moderate";
  return "minor";
}
const BAND_SEV: Record<string, string> = {
  major: "breaking",
  strong: "alert",
  moderate: "caution",
  minor: "normal",
};

function SeismicCard() {
  const query = useQuery({
    queryKey: ["intel-quakes"],
    queryFn: () => api.getIntelQuakes(),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
  return (
    <CardShell<Quake> title="Seismic" query={query} empty="No M2.5+ quakes in the past day.">
      {(items) =>
        items.map((q) => {
          const band = magBand(q.mag);
          return (
            <a
              key={q.id}
              className="wire-card"
              data-sev={BAND_SEV[band]}
              href={q.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="wire-card-meta">
                <span className="intel-mag" data-band={band}>
                  M{q.mag?.toFixed(1) ?? "—"}
                </span>
                {q.tsunami && (
                  <span className="wire-badge" data-sev="breaking">
                    TSUNAMI
                  </span>
                )}
                {q.alert && (
                  <span className="wire-badge" data-sev={q.alert === "red" || q.alert === "orange" ? "alert" : "caution"}>
                    {q.alert.toUpperCase()}
                  </span>
                )}
                <span className="wire-card-time">{timeAgo(q.time)}</span>
              </div>
              <div className="wire-card-title">{q.place || "Unknown location"}</div>
            </a>
          );
        })
      }
    </CardShell>
  );
}

/* ── Prediction Markets (Polymarket) ─────────────────────────────────────── */

function MarketsCard() {
  const query = useQuery({
    queryKey: ["intel-markets"],
    queryFn: () => api.getIntelMarkets(),
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
  });
  return (
    <CardShell<PredictionMarket> title="Prediction Markets" query={query} empty="No relevant markets.">
      {(items) =>
        items.map((m) => {
          const pct = m.yesPrice != null ? Math.round(m.yesPrice * 100) : null;
          return (
            <a
              key={m.id}
              className="wire-card intel-market"
              href={m.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="intel-odds">
                <div className="intel-odds-track">
                  <div className="intel-odds-fill" style={{ width: `${pct ?? 0}%` }} />
                </div>
                <span className="intel-odds-pct">{pct != null ? `${pct}%` : "—"}</span>
              </div>
              <div className="wire-card-title">{m.question}</div>
              {m.volume != null && (
                <div className="wire-card-time">${fmtCompact(m.volume)} volume</div>
              )}
            </a>
          );
        })
      }
    </CardShell>
  );
}

/* ── Maritime Warnings (NGA MSI) ─────────────────────────────────────────── */

function MaritimeCard() {
  const query = useQuery({
    queryKey: ["intel-maritime"],
    queryFn: () => api.getIntelMaritime(),
    staleTime: 30 * 60_000,
    refetchInterval: 30 * 60_000,
  });
  return (
    <CardShell<MaritimeWarning> title="Maritime Warnings" query={query} empty="No active warnings.">
      {(items) =>
        items.map((w) => (
          <div key={w.id} className="wire-card">
            <div className="wire-card-meta">
              <span className="intel-area">NAVAREA {w.navArea}</span>
              {w.subregion && <span className="wire-card-source">{w.subregion}</span>}
              {w.issued && <span className="wire-card-time">{timeAgo(w.issued)}</span>}
            </div>
            <div className="wire-card-title intel-clamp3">{w.summary}</div>
          </div>
        ))
      }
    </CardShell>
  );
}

/* ── Airspace Status (FAA NAS) ───────────────────────────────────────────── */

const KIND_LABEL: Record<string, string> = {
  "ground-stop": "GROUND STOP",
  "ground-delay": "GROUND DELAY",
  closure: "CLOSED",
  delay: "DELAY",
};

function AirspaceCard() {
  const query = useQuery({
    queryKey: ["intel-airspace"],
    queryFn: () => api.getIntelAirspace(),
    staleTime: 3 * 60_000,
    refetchInterval: 3 * 60_000,
  });
  return (
    <CardShell<AirspaceEvent>
      title="Airspace Status"
      query={query}
      empty="No active US airspace disruptions."
    >
      {(items) =>
        items.map((e, i) => (
          <div key={`${e.airport}-${i}`} className="wire-card" data-kind={e.kind}>
            <div className="wire-card-meta">
              <span className="intel-apt">{e.airport}</span>
              <span className="intel-kind" data-kind={e.kind}>
                {KIND_LABEL[e.kind] ?? e.kind.toUpperCase()}
              </span>
            </div>
            <div className="wire-card-title intel-clamp2">{e.reason}</div>
            {e.detail && <div className="wire-card-time">{e.detail}</div>}
          </div>
        ))
      }
    </CardShell>
  );
}
