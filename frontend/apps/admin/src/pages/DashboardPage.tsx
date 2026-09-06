import { useQuery } from "@tanstack/react-query";
import { AdminHealthSchema, AdminStatsSchema } from "@monysa/contracts";
import type { ReactNode } from "react";
import { adminApi } from "../lib/api";
import { queryClient } from "../lib/query";
import { IconBell, IconCreditCard, IconUsers } from "../components/Icons";

const INTEGRATION_LABELS: Record<string, string> = {
  finnhub: "Finnhub (crypto WS)",
  openai: "OpenAI (briefings)",
  anthropic: "Anthropic (AI notes)",
  alphaVantage: "Alpha Vantage",
  twelveData: "Twelve Data (spot overlay)",
  fmp: "FMP",
  quiver: "Quiver",
  upstashRedis: "Upstash Redis",
  resend: "Resend (email)",
  aisstream: "AISstream (vessels)",
  revenuecat: "RevenueCat webhook secret",
  appSigning: "App signing (HMAC)",
  firebaseAdmin: "Firebase Admin SDK",
};

export function DashboardPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => adminApi.get("/api/admin/stats", AdminStatsSchema),
    refetchInterval: 60_000,
  });

  const healthQ = useQuery({
    queryKey: ["admin", "health"],
    queryFn: () => adminApi.get("/api/admin/health", AdminHealthSchema),
    refetchInterval: 60_000,
  });

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">Live platform overview</div>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => { void refetch(); }}
          disabled={isFetching}
        >
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && <div className="error-msg">{String(error)}</div>}

      <div className="stats-grid">
        <StatCard
          label="Total Users"
          value={String(data?.userCount ?? 0)}
          icon={<IconUsers size={16} />}
          loading={isLoading}
        />
        <StatCard
          label="Active Alerts"
          value={String(data?.alertCount ?? 0)}
          icon={<IconBell size={16} />}
          loading={isLoading}
        />
        <StatCard
          label="Subscriptions"
          value={String(data?.subscriptionCount ?? 0)}
          icon={<IconCreditCard size={16} />}
          loading={isLoading}
        />
        <StatCard
          label="Free"
          value={String(data?.planCounts.free ?? 0)}
          sub="devices"
          loading={isLoading}
        />
        <StatCard
          label="Pro"
          value={String(data?.planCounts.pro ?? 0)}
          sub="devices"
          accent
          loading={isLoading}
        />
      </div>

      <div className="section">
        <div className="section-header">Leader Status</div>
        <div className="section-body">
          {isLoading ? (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--s3)" }}>
              <span className="skeleton skeleton-text" style={{ width: 200 }} />
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--s3)", fontSize: 13 }}>
              <span
                className={`status-dot ${
                  data?.leaderStatus.isLeader ? "status-dot-pulse" : "status-dot-red"
                }`}
              />
              <span>
                Machine <code style={{ fontFamily: "monospace", fontSize: 11 }}>{data?.leaderStatus.machineId}</code>
                &nbsp;—&nbsp;
                {data?.leaderStatus.isLeader ? "Leader" : "Follower (not leader)"}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          System Health
          {healthQ.data?.build.flyAppName && (
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>
              {healthQ.data.build.flyAppName} · {healthQ.data.build.flyRegion ?? "—"} · machine {healthQ.data.build.flyAllocId?.slice(0, 8) ?? "—"}
            </span>
          )}
        </div>
        <div className="section-body">
          {healthQ.isLoading && <div className="empty">Loading…</div>}
          {healthQ.data && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--s3)" }}>
              {Object.entries(healthQ.data.integrations).map(([key, configured]) => (
                <span
                  key={key}
                  className="badge"
                  style={{
                    background: configured ? "rgba(0,212,170,0.12)" : "rgba(255,77,106,0.12)",
                    color: configured ? "var(--accent)" : "var(--danger)",
                  }}
                >
                  {configured ? "✓" : "✗"} {INTEGRATION_LABELS[key] ?? key}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-header">Quick Actions</div>
        <div className="section-body" style={{ flexDirection: "row", flexWrap: "wrap", gap: "var(--s3)" }}>
          <button
            className="btn btn-ghost"
            onClick={() => void queryClient.invalidateQueries({ queryKey: ["admin"] })}
          >
            Invalidate All Queries
          </button>
        </div>
      </div>
    </>
  );
}

function StatCard({ label, value, sub, accent, warn, icon, loading }: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  warn?: boolean;
  icon?: ReactNode;
  loading?: boolean;
}) {
  const cardClass = `stat-card ${accent ? "stat-card-accent" : warn ? "stat-card-warn" : ""}`;
  return (
    <div className={cardClass}>
      <div className="stat-card-header">
        <div className="stat-label">{label}</div>
        {icon && <span className="stat-card-icon">{icon}</span>}
      </div>
      {loading ? (
        <span className="skeleton skeleton-value" />
      ) : (
        <div
          className="stat-value"
          style={{ color: accent ? "var(--accent)" : warn ? "var(--warning)" : undefined }}
        >
          {value}
        </div>
      )}
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
