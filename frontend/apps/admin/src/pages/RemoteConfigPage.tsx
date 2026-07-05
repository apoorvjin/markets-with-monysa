import { useMutation, useQuery } from "@tanstack/react-query";
import { AdminOkSchema, AdminRemoteConfigSchema } from "@monysa/contracts";
import { useState } from "react";
import { adminApi } from "../lib/api";
import { queryClient } from "../lib/query";

export function RemoteConfigPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "remote-config"],
    queryFn: () => adminApi.get("/api/admin/remote-config", AdminRemoteConfigSchema),
    staleTime: 10_000,
  });

  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: () => adminApi.patch("/api/admin/remote-config", edits, AdminOkSchema),
    onSuccess: () => {
      setSaved(true);
      setEdits({});
      void queryClient.invalidateQueries({ queryKey: ["admin", "remote-config"] });
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const params = data?.params ?? {};
  const dirtyCount = Object.keys(edits).length;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Remote Config</div>
          <div className="page-subtitle">Firebase Remote Config parameters — changes publish immediately</div>
        </div>
        <div style={{ display: "flex", gap: "var(--s3)", alignItems: "center" }}>
          {saved && <span className="success-msg">Saved & published!</span>}
          <button
            className="btn btn-ghost btn-sm"
            disabled={dirtyCount === 0 || save.isPending}
            onClick={() => setEdits({})}
          >
            Discard
          </button>
          <button
            className="btn btn-primary"
            disabled={dirtyCount === 0 || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Publishing…" : `Save & Publish${dirtyCount > 0 ? ` (${dirtyCount})` : ""}`}
          </button>
        </div>
      </div>

      {error && <div className="error-msg">{String(error)}</div>}
      {save.error && <div className="error-msg">{String(save.error)}</div>}

      <div className="section">
        <div className="section-header">
          Parameters
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>
            version {data?.version ? String((data.version as { versionNumber?: string })?.versionNumber ?? "—") : "—"}
          </span>
        </div>
        <div style={{ padding: "0 var(--s5)" }}>
          {isLoading && <div className="empty" style={{ padding: "var(--s6) 0" }}>Loading…</div>}
          {Object.entries(params).map(([key, param]) => {
            const currentVal = String(param.defaultValue ?? "");
            const editVal = edits[key];
            const isDirty = editVal !== undefined && editVal !== currentVal;
            return (
              <div key={key} className="rc-row">
                <div>
                  <div className="rc-key">{key}</div>
                  {param.description && <div className="rc-desc">{param.description}</div>}
                </div>
                <input
                  className={`rc-input ${isDirty ? "dirty" : ""}`}
                  defaultValue={currentVal}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v !== currentVal) {
                      setEdits((prev) => ({ ...prev, [key]: v }));
                    } else {
                      setEdits((prev) => {
                        const next = { ...prev };
                        delete next[key];
                        return next;
                      });
                    }
                  }}
                />
              </div>
            );
          })}
          {!isLoading && Object.keys(params).length === 0 && (
            <div className="empty" style={{ padding: "var(--s6) 0" }}>
              No parameters found. Firebase Remote Config may not be configured.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
