import { useMutation, useQuery } from "@tanstack/react-query";
import {
  SocialBuzzQueueSchema,
  SocialBuzzStatusSchema,
  SocialBuzzKillSwitchResponseSchema,
  CandidatePostResponseSchema,
  type PostStatus,
} from "@monysa/contracts";
import { useState } from "react";
import { adminApi } from "../lib/api";
import { queryClient } from "../lib/query";

type Filter = PostStatus | "all";

const FILTERS: Filter[] = ["pending", "ready_for_manual_post", "published", "rejected", "failed", "all"];

export function SocialBuzzPage() {
  const [filter, setFilter] = useState<Filter>("pending");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: status } = useQuery({
    queryKey: ["admin", "social-buzz", "status"],
    queryFn: () => adminApi.get("/api/admin/social-buzz/status", SocialBuzzStatusSchema),
    refetchInterval: 15_000,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "social-buzz", "queue", filter],
    queryFn: () => {
      const params = filter === "all" ? "" : `?status=${filter}`;
      return adminApi.get(`/api/admin/social-buzz/queue${params}`, SocialBuzzQueueSchema);
    },
  });

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "social-buzz"] });
  };

  const approve = useMutation({
    mutationFn: (id: string) =>
      adminApi.post(`/api/admin/social-buzz/queue/${id}/approve`, {}, CandidatePostResponseSchema),
    onSuccess: invalidateAll,
  });

  const reject = useMutation({
    mutationFn: (id: string) =>
      adminApi.post(`/api/admin/social-buzz/queue/${id}/reject`, {}, CandidatePostResponseSchema),
    onSuccess: invalidateAll,
  });

  const saveEdit = useMutation({
    mutationFn: ({ id, copy }: { id: string; copy: string }) =>
      adminApi.patch(`/api/admin/social-buzz/queue/${id}`, { copy }, CandidatePostResponseSchema),
    onSuccess: () => {
      setEditingId(null);
      invalidateAll();
    },
  });

  const toggleKillSwitch = useMutation({
    mutationFn: (enabled: boolean) =>
      adminApi.post("/api/admin/social-buzz/kill-switch", { enabled }, SocialBuzzKillSwitchResponseSchema),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "social-buzz", "status"] });
    },
  });

  const copyToClipboard = (id: string, text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Market Buzz</div>
          <div className="page-subtitle">
            Automated post queue — Instagram publishes via API, X is copy-paste (no free posting API)
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={invalidateAll}>
          Refresh
        </button>
      </div>

      {error && <div className="error-msg">{String(error)}</div>}

      {status && (
        <div className="section" style={{ marginBottom: "var(--s5)" }}>
          <div style={{ display: "flex", gap: "var(--s6)", alignItems: "center", padding: "var(--s5)", flexWrap: "wrap" }}>
            <span className={`badge ${status.killSwitch ? "badge-triggered" : "badge-active"}`}>
              Kill switch: {status.killSwitch ? "ON" : "off"}
            </span>
            <span className="badge">{status.dryRun ? "DRY RUN" : "LIVE"}</span>
            <span className="badge">Auto-publish (IG): {status.autoPublishEnabled ? "on" : "off"}</span>
            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
              {status.postsToday} / {status.cap} posts today
            </span>
            <button
              className={`btn btn-sm ${status.killSwitch ? "btn-primary" : "btn-danger"}`}
              disabled={toggleKillSwitch.isPending}
              onClick={() => toggleKillSwitch.mutate(!status.killSwitch)}
            >
              {status.killSwitch ? "Disable kill switch" : "Activate kill switch"}
            </button>
          </div>
        </div>
      )}

      <div className="chips">
        {FILTERS.map((f) => (
          <button
            key={f}
            className={`chip ${filter === f ? "active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Trigger</th>
                <th>Copy</th>
                <th>Channel</th>
                <th>Status</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={6} className="empty">Loading…</td></tr>
              )}
              {!isLoading && data?.posts.length === 0 && (
                <tr><td colSpan={6} className="empty">No posts in this view.</td></tr>
              )}
              {data?.posts.map((p) => (
                <tr key={p.id}>
                  <td style={{ color: "var(--text-muted)", maxWidth: 220 }}>{p.triggerSummary}</td>
                  <td style={{ maxWidth: 360, whiteSpace: "pre-wrap" }}>
                    {editingId === p.id ? (
                      <textarea
                        className="rc-input"
                        style={{ width: "100%", minHeight: 60 }}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                      />
                    ) : (
                      p.copy
                    )}
                  </td>
                  <td>{p.targetChannels.join(", ")}</td>
                  <td>
                    <span className={`badge ${p.status === "published" ? "badge-active" : p.status === "failed" || p.status === "rejected" ? "badge-triggered" : ""}`}>
                      {p.status.replace(/_/g, " ")}
                    </span>
                    {p.failureReason && (
                      <div style={{ fontSize: 11, color: "var(--danger, #ff4d6a)" }}>{p.failureReason}</div>
                    )}
                  </td>
                  <td style={{ color: "var(--text-muted)" }}>
                    {new Date(p.createdAt).toLocaleString()}
                  </td>
                  <td style={{ display: "flex", gap: "var(--s2)", flexWrap: "wrap" }}>
                    {editingId === p.id ? (
                      <>
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={saveEdit.isPending}
                          onClick={() => saveEdit.mutate({ id: p.id, copy: editValue })}
                        >
                          Save
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      p.status === "pending" && (
                        <>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => { setEditingId(p.id); setEditValue(p.copy); }}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={approve.isPending}
                            onClick={() => approve.mutate(p.id)}
                          >
                            {p.targetChannels.includes("x") ? "Mark ready" : "Approve & publish"}
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            disabled={reject.isPending}
                            onClick={() => reject.mutate(p.id)}
                          >
                            Reject
                          </button>
                        </>
                      )
                    )}
                    {p.status === "ready_for_manual_post" && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => copyToClipboard(p.id, p.copy)}
                      >
                        {copiedId === p.id ? "Copied!" : "Copy text"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>{data?.posts.length ?? 0} shown</span>
        </div>
      </div>
    </>
  );
}
