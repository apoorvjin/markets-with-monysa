import { useMutation, useQuery } from "@tanstack/react-query";
import { AdminAlertsListSchema, AdminOkSchema } from "@monysa/contracts";
import { useState } from "react";
import { adminApi } from "../lib/api";
import { queryClient } from "../lib/query";

type Filter = "all" | "active" | "triggered";

const SKELETON_WIDTHS = ["70%", "45%", "65%", "40%", "55%"];
function TableSkeleton({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i}>
          {Array.from({ length: cols }, (_, j) => (
            <td key={j}>
              <span
                className="skeleton skeleton-text"
                style={{ width: SKELETON_WIDTHS[(i * cols + j) % SKELETON_WIDTHS.length] }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function AlertsPage() {
  const [filter, setFilter] = useState<Filter>("active");
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const triggeredParam = filter === "all" ? undefined : filter === "active" ? "false" : "true";

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "alerts", filter, cursor],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "100" });
      if (triggeredParam) params.set("triggered", triggeredParam);
      if (cursor) params.set("startAfter", cursor);
      return adminApi.get(`/api/admin/alerts?${params}`, AdminAlertsListSchema);
    },
  });

  const deleteAlert = useMutation({
    mutationFn: ({ uid, alertId }: { uid: string; alertId: string }) =>
      adminApi.delete(`/api/admin/users/${uid}/alerts/${alertId}`, AdminOkSchema),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "alerts"] });
    },
  });

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Alerts</div>
          <div className="page-subtitle">Global price alert board across all users</div>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => void queryClient.invalidateQueries({ queryKey: ["admin", "alerts"] })}
        >
          Refresh
        </button>
      </div>

      {error && <div className="error-msg">{String(error)}</div>}

      <div className="chips">
        {(["active", "all", "triggered"] as Filter[]).map((f) => (
          <button
            key={f}
            className={`chip ${filter === f ? "active" : ""}`}
            onClick={() => { setFilter(f); setCursor(undefined); }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>UID</th>
                <th>Symbol</th>
                <th>Name</th>
                <th>Direction</th>
                <th>Target Price</th>
                <th>Status</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <TableSkeleton cols={8} />}
              {!isLoading && data?.alerts.length === 0 && (
                <tr><td colSpan={8} className="empty">No alerts found.</td></tr>
              )}
              {data?.alerts.map((a) => (
                <tr key={`${a.uid}-${a.id}`}>
                  <td className="mono">{(a.uid ?? "").slice(0, 12)}…</td>
                  <td style={{ fontWeight: 600 }}>{a.symbol}</td>
                  <td style={{ color: "var(--text-muted)" }}>{a.name ?? "—"}</td>
                  <td><span className={`badge badge-${a.direction}`}>{a.direction}</span></td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>
                    ${Number(a.targetPrice).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </td>
                  <td>
                    <span className={`badge ${a.triggered ? "badge-triggered" : "badge-active"}`}>
                      {a.triggered ? "triggered" : "active"}
                    </span>
                  </td>
                  <td style={{ color: "var(--text-muted)" }}>
                    {a.createdAt ? new Date(a.createdAt).toLocaleDateString() : "—"}
                  </td>
                  <td>
                    <button
                      className="btn btn-danger btn-sm"
                      disabled={deleteAlert.isPending || !a.uid}
                      onClick={() => a.uid && deleteAlert.mutate({ uid: a.uid, alertId: a.id })}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>{data?.alerts.length ?? 0} shown</span>
          {data?.hasMore && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                const last = data.alerts[data.alerts.length - 1];
                if (last?.docPath) setCursor(last.docPath);
              }}
            >
              Load more
            </button>
          )}
        </div>
      </div>
    </>
  );
}
