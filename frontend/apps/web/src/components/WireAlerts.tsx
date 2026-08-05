import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  AUTO_DISMISS_MS,
  wireAlerts,
  type ActiveAlert,
  type AlertSeverity,
} from "../lib/wireAlerts";
import { api } from "../lib/api";

/* ───────────────────────────── runtime ─────────────────────────────────── */

/**
 * App-wide runtime: polls the breaking feed (~60s) and feeds every batch into
 * the alert engine, and keeps settings in sync across tabs. Mount once (AppShell).
 */
export function useWireAlertRuntime() {
  const { data } = useQuery({
    queryKey: ["wire-breaking"],
    queryFn: () => api.getWireBreaking(),
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    staleTime: 55_000,
  });

  useEffect(() => {
    if (data?.items?.length) wireAlerts.ingest(data.items);
  }, [data]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key.startsWith("finbrio.wire.alerts.settings")) {
        wireAlerts.syncFromStorage();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Dev-only visual demo: `/wire?alertDemo=1` fires synthetic alerts through the
  // real engine after the startup grace. Gated by DEV + param — never in prod.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (!new URLSearchParams(window.location.search).has("alertDemo")) return;
    const t = window.setTimeout(() => {
      const now = new Date().toISOString();
      wireAlerts.ingest([
        {
          title: "Explosion reported near port; military cordons area as strikes continue",
          link: "https://example.com/a1",
          pubDate: now,
          summary: "",
          source: "BBC World",
          sourceId: "bbc-world",
          desk: "world",
          category: "conflict",
          severity: "breaking",
        },
        {
          title: "Fed signals emergency review after bond-market stress spikes",
          link: "https://example.com/a2",
          pubDate: now,
          summary: "",
          source: "Reuters",
          sourceId: "fed-press",
          desk: "markets",
          category: "economic",
          severity: "alert",
        },
      ]);
    }, 10_600);
    return () => window.clearTimeout(t);
  }, []);
}

/* ───────────────────────────── banner ──────────────────────────────────── */

const SEV_LABEL: Record<AlertSeverity, string> = { critical: "CRITICAL", high: "HIGH" };

export function WireAlertBanner() {
  const visible = useSyncExternalStore(
    wireAlerts.subscribe,
    wireAlerts.getVisible,
    wireAlerts.getVisible,
  );
  if (visible.length === 0) return null;
  return (
    <div className="wire-alert-stack" role="region" aria-label="Breaking alerts">
      {visible.map((a) => (
        <AlertCard key={a.id} alert={a} />
      ))}
    </div>
  );
}

function AlertCard({ alert }: { alert: ActiveAlert }) {
  const navigate = useNavigate();
  const barRef = useRef<HTMLDivElement>(null);

  // FR-A12 — auto-dismiss, pausing while the tab is hidden.
  useEffect(() => {
    const duration = AUTO_DISMISS_MS[alert.severity];
    let visibleElapsed = 0;
    let lastTick = Date.now();
    const tick = () => {
      const nowReal = Date.now();
      if (document.visibilityState === "visible") {
        visibleElapsed += nowReal - lastTick;
      }
      lastTick = nowReal;
      // Expired while hidden (wall-clock past duration) → dismiss on return.
      const expired =
        visibleElapsed >= duration ||
        (document.visibilityState === "visible" && nowReal - alert.firedAt >= duration);
      const remaining = Math.max(0, duration - visibleElapsed);
      if (barRef.current) barRef.current.style.width = `${(remaining / duration) * 100}%`;
      if (expired) {
        window.clearInterval(id);
        wireAlerts.dismiss(alert.id, { manual: false });
      }
    };
    const id = window.setInterval(tick, 250);
    const onVis = () => (lastTick = Date.now());
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [alert.id, alert.severity, alert.firedAt]);

  // FR-A15 — reveal & scroll to the desk column owning this source.
  const openPanel = () => {
    navigate({ to: "/wire" }).then(() => {
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(`[data-desk="${alert.desk}"]`);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add("wire-col--flash");
        window.setTimeout(() => el.classList.remove("wire-col--flash"), 1600);
      });
    });
  };

  return (
    <div className="wire-alert" data-sev={alert.severity} role="alert">
      <button type="button" className="wire-alert-body" onClick={openPanel}>
        <span className="wire-alert-icon" aria-hidden>
          {alert.severity === "critical" ? "◉" : "▲"}
        </span>
        <span className="wire-alert-text">
          <span className="wire-alert-head">
            <span className="wire-alert-sev">{SEV_LABEL[alert.severity]}</span>
            <span className="wire-alert-source">{alert.source}</span>
            <span className="wire-alert-age">{ageLabel(alert.pubDate)}</span>
          </span>
          <span className="wire-alert-title">{alert.title}</span>
        </span>
      </button>
      <a
        className="wire-alert-open"
        href={alert.link}
        target="_blank"
        rel="noopener noreferrer"
        title="Open article"
        aria-label="Open article"
      >
        ↗
      </a>
      <button
        type="button"
        className="wire-alert-close"
        onClick={() => wireAlerts.dismiss(alert.id, { manual: true })}
        aria-label="Dismiss"
      >
        ✕
      </button>
      <div className="wire-alert-progress">
        <div ref={barRef} className="wire-alert-progress-bar" />
      </div>
    </div>
  );
}

function ageLabel(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return "now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

/* ─────────────────────────── settings bell ─────────────────────────────── */

export function WireAlertBell() {
  const settings = useSyncExternalStore(
    wireAlerts.subscribe,
    wireAlerts.getSettings,
    wireAlerts.getSettings,
  );
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="wire-bell" ref={ref}>
      <button
        type="button"
        className="wire-bell-btn"
        data-on={settings.enabled ? "true" : "false"}
        onClick={() => setOpen((v) => !v)}
        aria-label="Breaking-alert settings"
        title="Breaking alerts"
      >
        {settings.enabled ? "🔔" : "🔕"} Alerts
      </button>
      {open && (
        <div className="wire-bell-menu" role="menu">
          <Toggle
            label="In-app breaking alerts"
            checked={settings.enabled}
            onChange={(v) => wireAlerts.setSettings({ enabled: v })}
          />
          <Toggle
            label="Sound chime"
            checked={settings.soundEnabled}
            disabled={!settings.enabled}
            onChange={(v) => wireAlerts.setSettings({ soundEnabled: v })}
          />
          <Toggle
            label="Critical only"
            checked={settings.sensitivity === "critical-only"}
            disabled={!settings.enabled}
            onChange={(v) =>
              wireAlerts.setSettings({
                sensitivity: v ? "critical-only" : "critical-and-high",
              })
            }
          />
        </div>
      )}
    </div>
  );
}

function Toggle(props: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="wire-toggle" data-disabled={props.disabled ? "true" : "false"}>
      <span>{props.label}</span>
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span className="wire-toggle-track" data-on={props.checked ? "true" : "false"} />
    </label>
  );
}
