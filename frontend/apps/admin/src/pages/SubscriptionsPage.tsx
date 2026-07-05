import { useMutation, useQuery } from "@tanstack/react-query";
import { AdminOkSchema, AdminSubscriptionsListSchema, type AdminPlan, type AdminSubscription } from "@monysa/contracts";
import { useState } from "react";
import { adminApi } from "../lib/api";
import { queryClient } from "../lib/query";

const PLANS: AdminPlan[] = ["free", "pro"];
const PLAN_FILTER = ["all", ...PLANS] as const;

const SKELETON_WIDTHS = ["65%", "40%", "55%", "50%", "70%"];
function TableSkeleton({ cols, rows = 6 }: { cols: number; rows?: number }) {
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

export function SubscriptionsPage() {
  const [planFilter, setPlanFilter] = useState<"all" | AdminPlan>("all");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allSubs, setAllSubs] = useState<AdminSubscription[]>([]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "subscriptions", cursor],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100" });
      if (cursor) params.set("startAfter", cursor);
      const res = await adminApi.get(`/api/admin/subscriptions?${params}`, AdminSubscriptionsListSchema);
      setAllSubs((prev) => {
        const existing = new Set(prev.map((s) => s.deviceId));
        const fresh = res.subs.filter((s) => !existing.has(s.deviceId));
        return [...prev, ...fresh];
      });
      return res;
    },
  });

  const override = useMutation({
    mutationFn: ({ deviceId, plan }: { deviceId: string; plan: AdminPlan }) =>
      adminApi.patch(`/api/admin/subscriptions/${deviceId}`, { plan }, AdminOkSchema),
    onSuccess: (_data, vars) => {
      setAllSubs((prev) => prev.map((s) => s.deviceId === vars.deviceId ? { ...s, plan: vars.plan } as AdminSubscription : s));
      void queryClient.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
    },
  });

  const remove = useMutation({
    mutationFn: (deviceId: string) => adminApi.delete(`/api/admin/subscriptions/${deviceId}`, AdminOkSchema),
    onSuccess: (_data, deviceId) => {
      setAllSubs((prev) => prev.filter((s) => s.deviceId !== deviceId));
      void queryClient.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
    },
  });

  const filtered = allSubs.filter((s) => planFilter === "all" || s.plan === planFilter);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Subscriptions</div>
          <div className="page-subtitle">Device plan assignments — override or audit</div>
        </div>
      </div>

      {error && <div className="error-msg">{String(error)}</div>}

      <div className="chips">
        {PLAN_FILTER.map((f) => (
          <button
            key={f}
            className={`chip ${planFilter === f ? "active" : ""}`}
            onClick={() => setPlanFilter(f as typeof planFilter)}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== "all" && (
              <span style={{ marginLeft: 4, opacity: 0.7 }}>
                ({allSubs.filter((s) => s.plan === f).length})
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Device ID</th>
                <th>Plan</th>
                <th>Last Event</th>
                <th>Updated</th>
                <th>Override</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && allSubs.length === 0 && <TableSkeleton cols={6} />}
              {filtered.length === 0 && !isLoading && (
                <tr><td colSpan={6} className="empty">No subscriptions found.</td></tr>
              )}
              {filtered.map((s) => (
                <tr key={s.deviceId}>
                  <td className="mono">{s.deviceId.slice(0, 20)}…</td>
                  <td>
                    <span className={`badge badge-${s.plan}`}>{s.plan}</span>
                  </td>
                  <td style={{ color: "var(--text-muted)" }}>{s.event ?? "—"}</td>
                  <td style={{ color: "var(--text-muted)" }}>
                    {s.updatedAt ? new Date(s.updatedAt).toLocaleDateString() : "—"}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <select
                      className="select"
                      value={s.plan}
                      disabled={override.isPending}
                      onChange={(e) => override.mutate({ deviceId: s.deviceId, plan: e.target.value as AdminPlan })}
                    >
                      {PLANS.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button
                      className="btn btn-danger btn-sm"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(s.deviceId)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>{filtered.length} of {allSubs.length} total</span>
          {data?.hasMore && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                const last = allSubs[allSubs.length - 1];
                if (last) setCursor(last.deviceId);
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
