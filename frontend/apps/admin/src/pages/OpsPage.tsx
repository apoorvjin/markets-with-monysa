import { useMutation, useQuery } from "@tanstack/react-query";
import { AdminLeaderSchema, AdminOkSchema } from "@monysa/contracts";
import { z } from "zod";

const BroadcastResultSchema = AdminOkSchema.extend({ sent: z.number().optional(), failed: z.number().optional() });
import { useState } from "react";
import { adminApi } from "../lib/api";
import { queryClient } from "../lib/query";

type CacheTarget = "bonds" | "sectors" | "tariffs" | "briefing" | "fear-greed" | "oge" | "heatmap" | "treemap" | "market-quotes";

const CACHE_TARGETS: { key: CacheTarget; label: string }[] = [
  { key: "market-quotes", label: "Indices / Commodities / Forex" },
  { key: "heatmap",       label: "Heatmap (regions + assets)" },
  { key: "treemap",       label: "Treemap (all indices)" },
  { key: "sectors",       label: "Sector ETFs + RRG" },
  { key: "bonds",         label: "Bonds / Yield Curve" },
  { key: "tariffs",       label: "Tariffs" },
  { key: "briefing",      label: "AI Briefing" },
  { key: "fear-greed",    label: "Fear & Greed" },
  { key: "oge",           label: "OGE Cache + Redis" },
];

export function OpsPage() {
  const [bustResult, setBustResult] = useState<Record<string, string>>({});
  const [ogeResult, setOgeResult] = useState<string | null>(null);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [broadcastUids, setBroadcastUids] = useState("");
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null);

  const leaderQ = useQuery({
    queryKey: ["admin", "leader"],
    queryFn: () => adminApi.get("/api/admin/leader", AdminLeaderSchema),
    refetchInterval: 30_000,
  });

  const bustMutation = useMutation({
    mutationFn: (target: CacheTarget) =>
      adminApi.post("/api/admin/cache/bust", { target }, AdminOkSchema),
    onSuccess: (_data, target) => {
      setBustResult((prev) => ({ ...prev, [target]: `Busted at ${new Date().toLocaleTimeString()}` }));
      void queryClient.invalidateQueries();
    },
    onError: (e, target) => {
      setBustResult((prev) => ({ ...prev, [target]: `Error: ${String(e)}` }));
    },
  });

  const ogeMutation = useMutation({
    mutationFn: () => adminApi.post("/api/admin/oge/refresh", {}, AdminOkSchema),
    onSuccess: () => setOgeResult(`OGE pipeline triggered at ${new Date().toLocaleTimeString()}`),
    onError: (e) => setOgeResult(`Error: ${String(e)}`),
  });

  const broadcastMutation = useMutation({
    mutationFn: () => {
      const uids = broadcastUids.trim()
        ? broadcastUids.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
        : undefined;
      return adminApi.post("/api/admin/fcm/broadcast", { title: broadcastTitle, body: broadcastBody, uids }, BroadcastResultSchema);
    },
    onSuccess: (data) => {
      const sent = data.sent ?? 0;
      const failed = data.failed ?? 0;
      if (sent === 0 && failed === 0) {
        setBroadcastResult("No registered devices found — user must sign in through the app first to register an FCM token.");
      } else {
        setBroadcastResult(`Sent: ${sent} · Failed: ${failed}`);
      }
    },
    onError: (e) => setBroadcastResult(`Error: ${String(e)}`),
  });

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Operations</div>
          <div className="page-subtitle">Cache management, push notifications, pipeline controls</div>
        </div>
      </div>

      <div className="ops-grid">
        {/* Leader Status */}
        <div className="section">
          <div className="section-header">
            Leader Status
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => void queryClient.invalidateQueries({ queryKey: ["admin", "leader"] })}
            >
              Refresh
            </button>
          </div>
          <div className="section-body">
            {leaderQ.isLoading && <div className="empty">Loading…</div>}
            {leaderQ.data && (
              <div style={{ display: "flex", alignItems: "center", gap: "var(--s3)", fontSize: 13 }}>
                <span className={`status-dot ${leaderQ.data.isLeader ? "status-dot-green" : "status-dot-red"}`} />
                <span>
                  <code style={{ fontFamily: "monospace", fontSize: 11 }}>{leaderQ.data.machineId}</code>
                  &nbsp;—&nbsp;
                  {leaderQ.data.isLeader ? "Leader" : "Follower"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Cache Busting */}
        <div className="section">
          <div className="section-header">Cache Busting</div>
          <div className="section-body">
            <div className="bust-grid">
              {CACHE_TARGETS.map(({ key, label }) => (
                <div key={key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <button
                    className="btn btn-ghost"
                    disabled={bustMutation.isPending}
                    onClick={() => bustMutation.mutate(key)}
                  >
                    Bust {label}
                  </button>
                  {bustResult[key] && (
                    <div style={{ fontSize: 11, color: "var(--accent)" }}>{bustResult[key]}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* OGE Pipeline */}
        <div className="section">
          <div className="section-header">OGE PDF Pipeline</div>
          <div className="section-body">
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Busts the OGE cache (Redis + memory) so the next GET re-runs the PDF pipeline.
              This can take several minutes.
            </p>
            <button
              className="btn btn-primary"
              disabled={ogeMutation.isPending}
              onClick={() => { setOgeResult(null); ogeMutation.mutate(); }}
            >
              {ogeMutation.isPending ? "Triggering…" : "Re-run Pipeline"}
            </button>
            {ogeResult && <div className="success-msg">{ogeResult}</div>}
          </div>
        </div>

        {/* Broadcast Push */}
        <div className="section">
          <div className="section-header">Broadcast Push Notification</div>
          <div className="section-body">
            <div className="field">
              <label>Title</label>
              <input
                className="input"
                placeholder="Notification title"
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Body</label>
              <textarea
                className="input"
                placeholder="Notification body text"
                value={broadcastBody}
                onChange={(e) => setBroadcastBody(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Target UIDs (optional — comma or newline separated; blank = all users)</label>
              <textarea
                className="input"
                placeholder="uid1, uid2, uid3…"
                value={broadcastUids}
                onChange={(e) => setBroadcastUids(e.target.value)}
              />
            </div>
            <button
              className="btn btn-danger"
              disabled={broadcastMutation.isPending || !broadcastTitle || !broadcastBody}
              onClick={() => { setBroadcastResult(null); broadcastMutation.mutate(); }}
            >
              {broadcastMutation.isPending ? "Sending…" : "Send Broadcast"}
            </button>
            {broadcastResult && <div className="success-msg">{broadcastResult}</div>}
          </div>
        </div>
      </div>
    </>
  );
}
