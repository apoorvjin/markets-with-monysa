import { useMutation, useQuery } from "@tanstack/react-query";
import { AdminOkSchema, AdminRemoteConfigSchema } from "@monysa/contracts";
import { useState } from "react";
import { adminApi } from "../lib/api";
import { queryClient } from "../lib/query";

// Mirrors moby/lib/services/remote_config_service.dart's `_defaults` map —
// the only 7 keys the app actually reads, with known types and the same
// hardcoded fallback values the app uses when a key hasn't been created in
// Firebase yet. Dart can't import this from @monysa/contracts, so this stays
// a hand-synced literal (same tradeoff the backend's old CACHE_TARGETS list
// accepted). Any other key present in the live Firebase template (added in
// the console but not yet read by the app) falls back to the raw text editor
// below so nothing is hidden — it's just not type-checked.
//
// As of writing, the live template has exactly ONE param
// (earnings_calendar_global_enabled) and NONE of these 7 — they've only ever
// existed as the Dart-side fallback, never actually created in Firebase. So
// these are listed here even when absent from `params`, pre-filled with the
// app's documented default, so creating one for the first time goes through
// the same typed control instead of a manual PATCH with a guessed key name.
type ParamType = "bool" | "int" | "string";
const KNOWN_PARAMS: Record<string, { type: ParamType; label: string; appDefault: string }> = {
  pro_monthly_price_usd: { type: "string", label: "Pro monthly price (USD)", appDefault: "12.99" },
  alert_limit_free: { type: "int", label: "Free-plan alert limit", appDefault: "3" },
  push_notification_cooldown_secs: { type: "int", label: "Push cooldown (seconds)", appDefault: "300" },
  enable_google_signin: { type: "bool", label: "Google Sign-In enabled", appDefault: "false" },
  enable_apple_signin: { type: "bool", label: "Apple Sign-In enabled", appDefault: "false" },
  new_strategy_s4_enabled: { type: "bool", label: "S4 strategy enabled", appDefault: "false" },
  wire_enabled: { type: "bool", label: "Wire tab enabled", appDefault: "false" },
};

export function RemoteConfigPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "remote-config"],
    queryFn: () => adminApi.get("/api/admin/remote-config", AdminRemoteConfigSchema),
    staleTime: 10_000,
  });

  const [edits, setEdits] = useState<Record<string, string>>({});
  const [invalid, setInvalid] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: () => adminApi.patch("/api/admin/remote-config", edits, AdminOkSchema),
    onSuccess: () => {
      setSaved(true);
      setEdits({});
      setConfirming(false);
      void queryClient.invalidateQueries({ queryKey: ["admin", "remote-config"] });
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const params = data?.params ?? {};
  // Known keys the app reads but that don't exist in the live template yet
  // are shown pre-filled with the app's own fallback default, so the first
  // time they're set goes through the typed control below rather than a
  // manually-guessed raw PATCH.
  const displayParams: Record<string, { defaultValue?: unknown; description?: string | null; notCreated?: boolean }> = { ...params };
  for (const [key, known] of Object.entries(KNOWN_PARAMS)) {
    if (!(key in displayParams)) {
      displayParams[key] = { defaultValue: known.appDefault, notCreated: true };
    }
  }
  const dirtyCount = Object.keys(edits).length;
  const canPublish = dirtyCount > 0 && Object.keys(invalid).length === 0;

  function setEdit(key: string, value: string, currentVal: string, type: ParamType) {
    if (type === "int" && value !== "" && !/^-?\d+$/.test(value)) {
      setInvalid((prev) => ({ ...prev, [key]: "Must be a whole number" }));
    } else {
      setInvalid((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    if (value !== currentVal) {
      setEdits((prev) => ({ ...prev, [key]: value }));
    } else {
      setEdits((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  function renderControl(key: string, currentVal: string) {
    const known = KNOWN_PARAMS[key];
    const editVal = edits[key] ?? currentVal;
    const isDirty = key in edits;

    if (known?.type === "bool") {
      return (
        <select
          className={`select ${isDirty ? "dirty" : ""}`}
          value={editVal === "true" ? "true" : "false"}
          onChange={(e) => setEdit(key, e.target.value, currentVal, "bool")}
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );
    }
    if (known?.type === "int") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <input
            className={`rc-input ${isDirty ? "dirty" : ""}`}
            type="number"
            step="1"
            defaultValue={currentVal}
            onChange={(e) => setEdit(key, e.target.value, currentVal, "int")}
          />
          {invalid[key] && <span style={{ fontSize: 11, color: "var(--danger)" }}>{invalid[key]}</span>}
        </div>
      );
    }
    return (
      <input
        className={`rc-input ${isDirty ? "dirty" : ""}`}
        defaultValue={currentVal}
        onChange={(e) => setEdit(key, e.target.value, currentVal, "string")}
      />
    );
  }

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
            onClick={() => { setEdits({}); setInvalid({}); setConfirming(false); }}
          >
            Discard
          </button>
          <button
            className="btn btn-primary"
            disabled={!canPublish || save.isPending}
            onClick={() => setConfirming(true)}
          >
            {save.isPending ? "Publishing…" : `Review & Publish${dirtyCount > 0 ? ` (${dirtyCount})` : ""}`}
          </button>
        </div>
      </div>

      {error && <div className="error-msg">{String(error)}</div>}
      {save.error && <div className="error-msg">{String(save.error)}</div>}

      {confirming && (
        <div className="panel-overlay" onClick={() => setConfirming(false)}>
          <div className="panel" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="panel-header">
              <div className="panel-title">Confirm publish</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>✕ Close</button>
            </div>
            <div className="panel-body">
              <div className="section">
                <div className="section-body" style={{ gap: "var(--s3)" }}>
                  {Object.entries(edits).map(([key, newVal]) => (
                    <div key={key} style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 2 }}>
                      <span className="rc-key">{key}</span>
                      <span style={{ color: "var(--text-muted)" }}>
                        {String(displayParams[key]?.defaultValue ?? "")} <span style={{ color: "var(--text-faint)" }}>→</span>{" "}
                        <span style={{ color: "var(--accent)" }}>{newVal}</span>
                      </span>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: "var(--s3)", marginTop: "var(--s3)" }}>
                    <button
                      className="btn btn-primary"
                      disabled={save.isPending}
                      onClick={() => save.mutate()}
                    >
                      {save.isPending ? "Publishing…" : "Confirm Publish"}
                    </button>
                    <button className="btn btn-ghost" onClick={() => setConfirming(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-header">
          Parameters
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>
            version {data?.version ? String((data.version as { versionNumber?: string })?.versionNumber ?? "—") : "—"}
          </span>
        </div>
        <div style={{ padding: "0 var(--s5)" }}>
          {isLoading && <div className="empty" style={{ padding: "var(--s6) 0" }}>Loading…</div>}
          {Object.entries(displayParams).map(([key, param]) => {
            const currentVal = String(param.defaultValue ?? "");
            const known = KNOWN_PARAMS[key];
            return (
              <div key={key} className="rc-row">
                <div>
                  <div className="rc-key">{key}</div>
                  <div className="rc-desc">
                    {known?.label ?? param.description ?? (
                      <span style={{ fontStyle: "italic" }}>Unknown key — not read by the app yet, raw editor</span>
                    )}
                    {param.notCreated && (
                      <span style={{ color: "var(--warning)", marginLeft: "var(--s2)" }}>
                        · not created in Firebase yet — publishing will create it
                      </span>
                    )}
                  </div>
                </div>
                {renderControl(key, currentVal)}
              </div>
            );
          })}
          {!isLoading && Object.keys(displayParams).length === 0 && (
            <div className="empty" style={{ padding: "var(--s6) 0" }}>
              No parameters found. Firebase Remote Config may not be configured.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
