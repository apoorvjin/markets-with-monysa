import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { ApiMetricRow, AiUsageRow } from "@monysa/contracts";
import { adminApi } from "../lib/api";

// ── Shared helpers ────────────────────────────────────────────────────────────

type SortDir = "asc" | "desc";

function timeAgo(iso: string | undefined | null): string {
  if (!iso) return "—";
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// ── API Perf tab ──────────────────────────────────────────────────────────────

type PerfSortKey = keyof Pick<ApiMetricRow, "count" | "avgMs" | "p50Ms" | "p95Ms" | "minMs" | "maxMs" | "successRate">;

const WINDOWS = ["1h", "6h", "24h"] as const;
type Window = (typeof WINDOWS)[number];

function avgColor(ms: number): string {
  if (ms < 200) return "var(--green, #16a34a)";
  if (ms < 1000) return "var(--yellow, #ca8a04)";
  return "var(--red, #dc2626)";
}

function ApiPerfTab() {
  const [win, setWin] = useState<Window>("1h");
  const [sortKey, setSortKey] = useState<PerfSortKey>("avgMs");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["api-metrics", win],
    queryFn: () => adminApi.getApiMetrics(win),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  function handleSort(key: PerfSortKey) {
    if (key === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const sortedMetrics = [...(data?.metrics ?? [])].sort((a, b) => {
    const diff = (a[sortKey] as number) - (b[sortKey] as number);
    return sortDir === "desc" ? -diff : diff;
  });

  const arrow = (key: PerfSortKey) =>
    sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : "";

  return (
    <>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
        {WINDOWS.map((w) => (
          <button key={w} type="button" className={`chip${win === w ? " chip--active" : ""}`} onClick={() => setWin(w)}>
            {w}
          </button>
        ))}
        <button type="button" className="btn btn--ghost" onClick={() => void refetch()} disabled={isLoading}>
          ↻ Refresh
        </button>
      </div>

      {error && <div className="alert alert--error">Failed to load metrics: {(error as Error).message}</div>}

      {!isLoading && data && !data.available && (
        <div className="card">
          <p style={{ color: "var(--text-secondary)" }}><strong>Fly.io credentials not configured.</strong></p>
          <p style={{ color: "var(--text-muted)", marginTop: 8, fontSize: "0.85rem" }}>
            Add these two lines to your <code>.env</code> file, then restart the server:
          </p>
          <pre style={{ marginTop: 8, padding: "10px 14px", background: "var(--surface-2, #111)", borderRadius: 6, fontSize: "0.82rem", color: "var(--text-primary)" }}>
{`FLY_APP_NAME=monysa-api
FLY_API_TOKEN=<run: fly auth token>`}
          </pre>
        </div>
      )}

      {(isLoading || sortedMetrics.length > 0) && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Route</th>
                <th>Pages / tabs</th>
                <th className="num sortable" onClick={() => handleSort("count")}>Count{arrow("count")}</th>
                <th className="num sortable" onClick={() => handleSort("avgMs")}>Avg ms{arrow("avgMs")}</th>
                <th className="num sortable" onClick={() => handleSort("p50Ms")}>P50{arrow("p50Ms")}</th>
                <th className="num sortable" onClick={() => handleSort("p95Ms")}>P95{arrow("p95Ms")}</th>
                <th className="num sortable" onClick={() => handleSort("minMs")}>Min{arrow("minMs")}</th>
                <th className="num sortable" onClick={() => handleSort("maxMs")}>Max{arrow("maxMs")}</th>
                <th className="num sortable" onClick={() => handleSort("successRate")}>Success %{arrow("successRate")}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 9 }).map((__, j) => (
                      <td key={j}><div className="skel" style={{ height: 14, width: j === 0 ? 200 : 48 }} /></td>
                    ))}</tr>
                  ))
                : sortedMetrics.map((row) => (
                    <tr key={row.key}>
                      <td>
                        <span className="badge" data-method={row.method.toLowerCase()} style={{ marginRight: 6, fontSize: "0.7rem" }}>{row.method}</span>
                        <code style={{ fontSize: "0.8rem" }}>{row.path}</code>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {row.pages.length > 0
                            ? row.pages.map((p) => <span key={p} className="tag">{p}</span>)
                            : <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>—</span>}
                        </div>
                      </td>
                      <td className="num">{row.count.toLocaleString()}</td>
                      <td className="num" style={{ color: avgColor(row.avgMs), fontWeight: 600 }}>{row.avgMs}</td>
                      <td className="num">{row.p50Ms}</td>
                      <td className="num">{row.p95Ms}</td>
                      <td className="num">{row.minMs}</td>
                      <td className="num">{row.maxMs}</td>
                      <td className="num" style={{ color: row.successRate < 95 ? "var(--red, #dc2626)" : undefined }}>{row.successRate}%</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}

      {data?.available && data.metrics?.length === 0 && !isLoading && (
        <div className="card">
          <p style={{ color: "var(--text-secondary)" }}>No timing data found in the last {win}. Make some API calls and check back.</p>
        </div>
      )}

      {data?.available && (
        <p style={{ marginTop: 12, fontSize: "0.78rem", color: "var(--text-muted)" }}>
          Sourced from Fly.io logs · <code>[TIMING]</code> prefix · window: {win} ·{" "}
          {sortedMetrics.length} routes · refreshed {timeAgo(new Date(dataUpdatedAt).toISOString())}
          {data.linesScanned != null ? ` · ${data.linesScanned.toLocaleString()} log lines scanned` : ""}
        </p>
      )}
    </>
  );
}

// ── AI Usage tab ──────────────────────────────────────────────────────────────

type AiSortKey = keyof Pick<AiUsageRow, "openaiCalls" | "anthropicCalls">;

function providerBadge(provider: "openai" | "anthropic") {
  const colors: Record<string, string> = {
    openai:    "var(--green, #16a34a)",
    anthropic: "var(--accent, #00D4AA)",
  };
  return (
    <span style={{
      display: "inline-block", padding: "1px 7px", borderRadius: 4, fontSize: "0.7rem",
      fontWeight: 600, background: colors[provider] + "22", color: colors[provider], marginRight: 4,
    }}>
      {provider === "openai" ? "OpenAI" : "Anthropic"}
    </span>
  );
}

function AiUsageTab() {
  const [sortKey, setSortKey] = useState<AiSortKey>("openaiCalls");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["ai-usage"],
    queryFn: () => adminApi.getAiUsage(),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  function handleSort(key: AiSortKey) {
    if (key === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const sorted = [...(data?.rows ?? [])].sort((a, b) => {
    const diff = (a[sortKey] as number) - (b[sortKey] as number);
    return sortDir === "desc" ? -diff : diff;
  });

  const arrow = (key: AiSortKey) =>
    sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : "";

  return (
    <>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
          Counts every AI button tap · stored in Firestore · persists across restarts
        </span>
        <button type="button" className="btn btn--ghost" onClick={() => void refetch()} disabled={isLoading} style={{ marginLeft: "auto" }}>
          ↻ Refresh
        </button>
      </div>

      {error && <div className="alert alert--error">Failed to load AI usage: {(error as Error).message}</div>}

      {(isLoading || sorted.length > 0) && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th className="num sortable" onClick={() => handleSort("openaiCalls")}>
                  {providerBadge("openai")} Calls{arrow("openaiCalls")}
                </th>
                <th className="num sortable" onClick={() => handleSort("anthropicCalls")}>
                  {providerBadge("anthropic")} Calls{arrow("anthropicCalls")}
                </th>
                <th className="num">Total</th>
                <th>Breakdown</th>
                <th>Last active</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 6 }).map((__, j) => (
                      <td key={j}><div className="skel" style={{ height: 14, width: j === 0 ? 180 : 48 }} /></td>
                    ))}</tr>
                  ))
                : sorted.map((row) => {
                    const total = row.openaiCalls + row.anthropicCalls;
                    const displayName = row.email ?? `device:${row.deviceId.slice(0, 8)}`;
                    const routeEntries = Object.entries(row.routes).sort((a, b) => b[1] - a[1]);
                    return (
                      <tr key={row.deviceId}>
                        <td>
                          <div style={{ fontWeight: 500, fontSize: "0.85rem" }}>{displayName}</div>
                          {row.email && (
                            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 2 }}>
                              {row.deviceId.slice(0, 12)}…
                            </div>
                          )}
                        </td>
                        <td className="num" style={{ color: row.openaiCalls > 0 ? "var(--green, #16a34a)" : undefined, fontWeight: 600 }}>
                          {row.openaiCalls}
                        </td>
                        <td className="num" style={{ color: row.anthropicCalls > 0 ? "var(--accent, #00D4AA)" : undefined, fontWeight: 600 }}>
                          {row.anthropicCalls}
                        </td>
                        <td className="num" style={{ fontWeight: 700 }}>{total}</td>
                        <td>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {routeEntries.length > 0
                              ? routeEntries.map(([route, count]) => (
                                  <span key={route} className="tag" style={{ fontSize: "0.7rem" }}>
                                    {route.replace("/api/", "")} ×{count}
                                  </span>
                                ))
                              : <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>—</span>}
                          </div>
                        </td>
                        <td style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                          {timeAgo(row.lastSeen)}
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && sorted.length === 0 && (
        <div className="card">
          <p style={{ color: "var(--text-secondary)" }}>
            No AI calls recorded yet. Tap the AI Briefing button in Macro or an Analyst Note in Trading to generate the first entry.
          </p>
        </div>
      )}

      {data && (
        <p style={{ marginTop: 12, fontSize: "0.78rem", color: "var(--text-muted)" }}>
          {sorted.length} device{sorted.length !== 1 ? "s" : ""} · refreshed {timeAgo(new Date(dataUpdatedAt).toISOString())}
        </p>
      )}
    </>
  );
}

// ── Page shell ────────────────────────────────────────────────────────────────

type Tab = "perf" | "ai";

export function PerformancePage() {
  const [tab, setTab] = useState<Tab>("perf");

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Performance</h1>
          <p className="page-subtitle">API latency · AI usage per user</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border, #222)" }}>
        {([ ["perf", "API Latency"], ["ai", "AI Usage"] ] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              padding: "6px 16px", fontSize: "0.85rem", fontWeight: tab === t ? 600 : 400,
              background: "none", border: "none", cursor: "pointer",
              color: tab === t ? "var(--text-primary)" : "var(--text-muted)",
              borderBottom: tab === t ? "2px solid var(--accent, #00D4AA)" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "perf" ? <ApiPerfTab /> : <AiUsageTab />}
    </div>
  );
}
