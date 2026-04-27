// Locale-aware price formatter for trading assets.
// Handles: JPY (0 decimals), crypto (2-6 dp), EUR indices, USD default.

const JPY_SYMBOLS = new Set(["NKD=F", "^N225"]);
const EUR_SYMBOLS = new Set(["^GDAXI", "^FCHI", "^STOXX50E"]);
const CRYPTO_SYMBOLS = new Set([
  "BTC-USD","ETH-USD","BNB-USD","SOL-USD","XRP-USD",
  "ADA-USD","AVAX-USD","DOGE-USD","DOT-USD","MATIC-USD",
]);

export function getCurrencyForSymbol(symbol: string): string {
  if (JPY_SYMBOLS.has(symbol)) return "JPY";
  if (EUR_SYMBOLS.has(symbol)) return "EUR";
  return "USD";
}

export function formatTradingPrice(symbol: string, price: number | null | undefined): string {
  if (price == null || isNaN(price)) return "—";

  if (JPY_SYMBOLS.has(symbol)) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "JPY",
      maximumFractionDigits: 0,
    }).format(price);
  }

  if (CRYPTO_SYMBOLS.has(symbol)) {
    const decimals = price >= 1000 ? 2 : price >= 1 ? 4 : 6;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(price);
  }

  const currency = getCurrencyForSymbol(symbol);
  const decimals = price >= 10000 ? 0 : price >= 1000 ? 2 : price >= 100 ? 2 : price >= 10 ? 3 : price >= 1 ? 4 : 5;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(price);
}

export function formatChangePct(pct: number | null | undefined): string {
  if (pct == null || isNaN(pct)) return "—";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export function formatConfidence(confidence: number | null | undefined): string {
  if (confidence == null) return "—";
  return `${confidence}%`;
}

export function formatRelativeTime(isoOrTimestamp: string | number | null | undefined): string {
  if (!isoOrTimestamp) return "";
  const ms = typeof isoOrTimestamp === "number"
    ? isoOrTimestamp * 1000
    : new Date(isoOrTimestamp).getTime();
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function sentimentColor(score: number): string {
  if (score >= 30) return "#00D4AA";
  if (score <= -30) return "#FF4D6A";
  return "#FFB84D";
}

export function sentimentLabel(score: number): string {
  if (score >= 50) return "Bullish";
  if (score >= 20) return "Leaning +";
  if (score >= -20) return "Neutral";
  if (score >= -50) return "Leaning −";
  return "Bearish";
}
