import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AdminAlertsListSchema,
  AdminDevicesListSchema,
  AdminOkSchema,
  AdminPasswordResetSchema,
  AdminUsersListSchema,
  type AdminUser,
} from "@monysa/contracts";
import { useState } from "react";
import { adminApi } from "../lib/api";
import { queryClient } from "../lib/query";

const SKELETON_WIDTHS = ["70%", "50%", "60%", "45%", "65%"];
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

export function UsersPage() {
  const [search, setSearch] = useState("");
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "users", cursor],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "50" });
      if (cursor) params.set("startAfter", cursor);
      const res = await adminApi.get(`/api/admin/users?${params}`, AdminUsersListSchema);
      setAllUsers((prev) => {
        const existing = new Set(prev.map((u) => u.uid));
        const fresh = res.users.filter((u) => !existing.has(u.uid));
        return [...prev, ...fresh];
      });
      return res;
    },
  });

  const filtered = allUsers.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return u.uid.toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q);
  }) as AdminUser[];

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Users</div>
          <div className="page-subtitle">All Firestore user accounts</div>
        </div>
      </div>

      {error && <div className="error-msg">{String(error)}</div>}

      <div className="table-wrap">
        <div className="table-toolbar">
          <input
            className="table-search"
            placeholder="Search by email or uid…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>UID</th>
                <th>Email</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && allUsers.length === 0 && <TableSkeleton cols={4} />}
              {filtered.length === 0 && !isLoading && (
                <tr><td colSpan={4} className="empty">No users found.</td></tr>
              )}
              {filtered.map((u) => (
                <tr key={u.uid} className="clickable" onClick={() => setSelectedUid(u.uid)}>
                  <td className="mono">{u.uid.slice(0, 16)}…</td>
                  <td>{u.email ?? <span style={{ color: "var(--text-faint)" }}>—</span>}</td>
                  <td style={{ color: "var(--text-muted)" }}>
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                  </td>
                  <td><span style={{ color: "var(--accent)", fontSize: 11 }}>View →</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>{filtered.length} of {allUsers.length} shown</span>
          {data?.hasMore && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                const last = allUsers[allUsers.length - 1];
                if (last) setCursor(last.uid);
              }}
            >
              Load more
            </button>
          )}
        </div>
      </div>

      {selectedUid && (
        <UserDetailPanel uid={selectedUid} onClose={() => setSelectedUid(null)} />
      )}
    </>
  );
}

function UserDetailPanel({ uid, onClose }: { uid: string; onClose: () => void }) {
  const [testTitle, setTestTitle] = useState("Test Notification");
  const [testBody, setTestBody] = useState("Hello from admin panel");
  const [pushResult, setPushResult] = useState<string | null>(null);
  const [authResult, setAuthResult] = useState<{ type: "ok" | "error" | "link"; msg: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const alertsQ = useQuery({
    queryKey: ["admin", "user-alerts", uid],
    queryFn: () => adminApi.get(`/api/admin/users/${uid}/alerts`, AdminAlertsListSchema),
  });

  const devicesQ = useQuery({
    queryKey: ["admin", "user-devices", uid],
    queryFn: () => adminApi.get(`/api/admin/users/${uid}/devices`, AdminDevicesListSchema),
  });

  const deleteAlert = useMutation({
    mutationFn: (alertId: string) =>
      adminApi.delete(`/api/admin/users/${uid}/alerts/${alertId}`, AdminOkSchema),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "user-alerts", uid] });
    },
  });

  const sendPush = useMutation({
    mutationFn: ({ deviceId, title, body }: { deviceId: string; title: string; body: string }) =>
      adminApi.post(`/api/admin/users/${uid}/devices/${deviceId}/notify`, { title, body }, AdminOkSchema),
    onSuccess: () => setPushResult("Push sent successfully."),
    onError: (e) => setPushResult(`Error: ${String(e)}`),
  });

  const revokeSessions = useMutation({
    mutationFn: () => adminApi.post(`/api/admin/users/${uid}/revoke-sessions`, {}, AdminOkSchema),
    onSuccess: () => setAuthResult({ type: "ok", msg: "All sessions revoked — user must re-login." }),
    onError: (e) => setAuthResult({ type: "error", msg: String(e) }),
  });

  const resetPassword = useMutation({
    mutationFn: () => adminApi.post(`/api/admin/users/${uid}/reset-password`, {}, AdminPasswordResetSchema),
    onSuccess: (data) => setAuthResult({ type: "link", msg: data.resetLink }),
    onError: (e) => setAuthResult({ type: "error", msg: String(e) }),
  });

  const deleteUser = useMutation({
    mutationFn: () => adminApi.delete(`/api/admin/users/${uid}`, AdminOkSchema),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      onClose();
    },
    onError: (e) => setAuthResult({ type: "error", msg: String(e) }),
  });

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <div>
            <div className="panel-title">User Detail</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace", marginTop: 2 }}>{uid}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕ Close</button>
        </div>

        <div className="panel-body">
          {/* Push Notification Status */}
          {devicesQ.data && (
            <div style={{ padding: "var(--s4) var(--s5)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "var(--s3)" }}>
              {(() => {
                const pushDevices = devicesQ.data.devices.filter((d) => !!d.fcmToken);
                return pushDevices.length > 0 ? (
                  <span style={{ display: "flex", alignItems: "center", gap: "var(--s2)", fontSize: 12 }}>
                    <span style={{ color: "var(--success, #00c49a)", fontWeight: 600 }}>✓ Push enabled</span>
                    <span style={{ color: "var(--text-muted)" }}>— {pushDevices.length} device{pushDevices.length > 1 ? "s" : ""} opted in</span>
                  </span>
                ) : (
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>✗ Push notifications not opted in</span>
                );
              })()}
            </div>
          )}

          {/* Account Actions */}
          <div className="section">
            <div className="section-header">Account Management</div>
            <div className="section-body">
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--s3)" }}>
                <button
                  className="btn btn-ghost"
                  disabled={revokeSessions.isPending}
                  onClick={() => { setAuthResult(null); revokeSessions.mutate(); }}
                >
                  {revokeSessions.isPending ? "Revoking…" : "Revoke All Sessions"}
                </button>
                <button
                  className="btn btn-ghost"
                  disabled={resetPassword.isPending}
                  onClick={() => { setAuthResult(null); resetPassword.mutate(); }}
                >
                  {resetPassword.isPending ? "Generating…" : "Generate Reset Link"}
                </button>
                {!confirmDelete ? (
                  <button
                    className="btn btn-danger"
                    onClick={() => setConfirmDelete(true)}
                  >
                    Delete Account
                  </button>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--s3)" }}>
                    <span style={{ fontSize: 12, color: "var(--danger)" }}>This is irreversible —</span>
                    <button
                      className="btn btn-danger"
                      disabled={deleteUser.isPending}
                      onClick={() => deleteUser.mutate()}
                    >
                      {deleteUser.isPending ? "Deleting…" : "Confirm Delete"}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
                  </div>
                )}
              </div>

              {authResult && (
                <div>
                  {authResult.type === "error" && (
                    <div className="error-msg">{authResult.msg}</div>
                  )}
                  {authResult.type === "ok" && (
                    <div className="success-msg">{authResult.msg}</div>
                  )}
                  {authResult.type === "link" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s2)" }}>
                      <div className="success-msg">Password reset link generated — copy and send to user:</div>
                      <div style={{
                        background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
                        padding: "var(--s3)", fontFamily: "monospace", fontSize: 11,
                        wordBreak: "break-all", color: "var(--text-muted)",
                      }}>
                        {authResult.msg}
                      </div>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ alignSelf: "flex-start" }}
                        onClick={() => void navigator.clipboard.writeText(authResult.msg)}
                      >
                        Copy link
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Alerts */}
          <div className="section">
            <div className="section-header">
              Price Alerts
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>
                {alertsQ.data?.alerts.length ?? "—"} total
              </span>
            </div>
            {alertsQ.isLoading && <div className="empty">Loading…</div>}
            {alertsQ.data?.alerts.length === 0 && <div className="empty">No alerts.</div>}
            {alertsQ.data?.alerts.map((a) => (
              <div
                key={a.id}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "var(--s3) var(--s5)", borderBottom: "1px solid var(--border)", gap: "var(--s4)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{a.symbol} — {a.name ?? ""}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    <span className={`badge badge-${a.direction}`}>{a.direction}</span>
                    &nbsp;${Number(a.targetPrice).toLocaleString()}
                    &nbsp;·&nbsp;
                    <span className={`badge ${a.triggered ? "badge-triggered" : "badge-active"}`}>
                      {a.triggered ? "triggered" : "active"}
                    </span>
                  </div>
                </div>
                <button
                  className="btn btn-danger btn-sm"
                  disabled={deleteAlert.isPending}
                  onClick={() => deleteAlert.mutate(a.id)}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>

          {/* Devices */}
          <div className="section">
            <div className="section-header">
              Devices
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>
                {devicesQ.data?.devices.length ?? "—"} registered
              </span>
            </div>
            {devicesQ.isLoading && <div className="empty">Loading…</div>}
            {devicesQ.data?.devices.length === 0 && <div className="empty">No devices.</div>}
            {devicesQ.data?.devices.map((d) => (
              <div
                key={d.deviceId}
                style={{
                  padding: "var(--s4) var(--s5)", borderBottom: "1px solid var(--border)",
                  display: "flex", flexDirection: "column", gap: "var(--s3)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--s3)" }}>
                  <code style={{ fontSize: 11, color: "var(--text-muted)" }}>{d.deviceId.slice(0, 20)}…</code>
                  <span className={`badge badge-${d.platform ?? "ios"}`}>{d.platform ?? "unknown"}</span>
                </div>
                {d.fcmToken && (
                  <div style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "monospace", wordBreak: "break-all" }}>
                    {d.fcmToken.slice(0, 40)}…
                  </div>
                )}
                <div style={{ display: "flex", gap: "var(--s3)", flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div className="field" style={{ flex: 1, minWidth: 120 }}>
                    <label>Title</label>
                    <input className="input" value={testTitle} onChange={(e) => setTestTitle(e.target.value)} />
                  </div>
                  <div className="field" style={{ flex: 2, minWidth: 160 }}>
                    <label>Body</label>
                    <input className="input" value={testBody} onChange={(e) => setTestBody(e.target.value)} />
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={sendPush.isPending || !d.fcmToken}
                    onClick={() => {
                      setPushResult(null);
                      sendPush.mutate({ deviceId: d.deviceId, title: testTitle, body: testBody });
                    }}
                  >
                    Send Test Push
                  </button>
                </div>
              </div>
            ))}
            {pushResult && <div className="success-msg" style={{ margin: "0 var(--s5) var(--s4)" }}>{pushResult}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
