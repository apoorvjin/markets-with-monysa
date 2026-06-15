/** Number/format helpers shared across web features. */

export function fmtPrice(n: number | null | undefined, currency?: string | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const digits = Math.abs(n) >= 1000 ? 2 : Math.abs(n) >= 1 ? 2 : 4;
  const s = n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (!currency || currency === "USD") return s;
  return `${s} ${currency}`;
}

export function fmtPct(n: number | null | undefined, signed = true): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = signed && n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

/** 1.23T / 45.6B / 789M compact notation for market caps. */
export function fmtCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "";
  const secs = Math.max(0, (Date.now() - ts) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

/** CSS class for a signed change value. */
export function changeClass(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n === 0) return "num-flat";
  return n > 0 ? "num-up" : "num-down";
}

export type SignalTone = "buy" | "sell" | "hold" | "neutral";

export function signalTone(direction: string | null | undefined): SignalTone {
  switch ((direction ?? "").toUpperCase()) {
    case "BUY":
      return "buy";
    case "SELL":
      return "sell";
    case "HOLD":
      return "hold";
    default:
      return "neutral";
  }
}
