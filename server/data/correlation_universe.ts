/**
 * Symbol universe for the "Adv Correlation" tab (GET /api/trading/correlation/advanced*).
 *
 * Separate from TRADING_ASSETS (server/trading.ts) on purpose — that list feeds
 * quotes/scanners/signals elsewhere and must not silently change shape here.
 *
 * Two parts:
 *  - CORRELATION_FIXED_ASSETS: hand-maintained, same convention as
 *    server/data/index_constituents.ts — commodities/indices/crypto/forex are
 *    unambiguous named instruments, and the 12 ETFs are structural benchmarks,
 *    not "a stock competing for a slot", so none of these are ranked.
 *  - CORRELATION_STOCK_POOLS: source pools for the market-cap-ranked "Stocks"
 *    slice (see refreshCorrelationStockSelection in server/trading.ts). Reuses
 *    the index-membership lists index_constituents.ts already maintains as the
 *    ground truth for "what's in this market", then ranks by live market cap.
 *
 * Refresh CORRELATION_FIXED_ASSETS manually if new instruments should be added.
 */

import {
  DJI_SYMBOLS,
  NDX_SYMBOLS,
  FTSE100_SYMBOLS,
  NIKKEI225_SYMBOLS,
  NIFTY50_SYMBOLS,
  HSI_SYMBOLS,
} from "./index_constituents";

export interface CorrelationAsset {
  symbol: string;
  name: string;
  category: "Commodities" | "Indices" | "Crypto" | "Forex" | "Stocks";
  flag: string;
}

export const CORRELATION_FIXED_ASSETS: CorrelationAsset[] = [
  // Commodities (14)
  { symbol: "GC=F", name: "Gold", category: "Commodities", flag: "🥇" },
  { symbol: "SI=F", name: "Silver", category: "Commodities", flag: "⚪" },
  { symbol: "CL=F", name: "Crude Oil (WTI)", category: "Commodities", flag: "🛢️" },
  { symbol: "BZ=F", name: "Brent Crude", category: "Commodities", flag: "🛢️" },
  { symbol: "NG=F", name: "Natural Gas", category: "Commodities", flag: "🔥" },
  { symbol: "HG=F", name: "Copper", category: "Commodities", flag: "🔶" },
  { symbol: "PL=F", name: "Platinum", category: "Commodities", flag: "⬜" },
  { symbol: "PA=F", name: "Palladium", category: "Commodities", flag: "🔷" },
  { symbol: "ZW=F", name: "Wheat", category: "Commodities", flag: "🌾" },
  { symbol: "ZC=F", name: "Corn", category: "Commodities", flag: "🌽" },
  { symbol: "ZS=F", name: "Soybeans", category: "Commodities", flag: "🫘" },
  { symbol: "SB=F", name: "Sugar", category: "Commodities", flag: "🍬" },
  { symbol: "KC=F", name: "Coffee", category: "Commodities", flag: "☕" },
  { symbol: "CT=F", name: "Cotton", category: "Commodities", flag: "🌿" },

  // Indices (24) — today's 15 majors + 9 more regional benchmarks
  { symbol: "^GSPC", name: "S&P 500", category: "Indices", flag: "🇺🇸" },
  { symbol: "^DJI", name: "Dow Jones", category: "Indices", flag: "🇺🇸" },
  { symbol: "^IXIC", name: "NASDAQ", category: "Indices", flag: "🇺🇸" },
  { symbol: "^RUT", name: "Russell 2000", category: "Indices", flag: "🇺🇸" },
  { symbol: "^FTSE", name: "FTSE 100", category: "Indices", flag: "🇬🇧" },
  { symbol: "^GDAXI", name: "DAX", category: "Indices", flag: "🇩🇪" },
  { symbol: "^FCHI", name: "CAC 40", category: "Indices", flag: "🇫🇷" },
  { symbol: "^N225", name: "Nikkei 225", category: "Indices", flag: "🇯🇵" },
  { symbol: "^HSI", name: "Hang Seng", category: "Indices", flag: "🇭🇰" },
  { symbol: "^AXJO", name: "ASX 200", category: "Indices", flag: "🇦🇺" },
  { symbol: "^NSEI", name: "Nifty 50", category: "Indices", flag: "🇮🇳" },
  { symbol: "^BVSP", name: "Bovespa", category: "Indices", flag: "🇧🇷" },
  { symbol: "^MXX", name: "IPC Mexico", category: "Indices", flag: "🇲🇽" },
  { symbol: "^VIX", name: "VIX (Fear Index)", category: "Indices", flag: "😨" },
  { symbol: "DX-Y.NYB", name: "US Dollar Index", category: "Indices", flag: "💵" },
  { symbol: "^STOXX50E", name: "Euro Stoxx 50", category: "Indices", flag: "🇪🇺" },
  { symbol: "^KS11", name: "KOSPI", category: "Indices", flag: "🇰🇷" },
  { symbol: "^TWII", name: "Taiwan Weighted", category: "Indices", flag: "🇹🇼" },
  { symbol: "^JKSE", name: "Jakarta Composite", category: "Indices", flag: "🇮🇩" },
  { symbol: "^KLSE", name: "FTSE Bursa Malaysia KLCI", category: "Indices", flag: "🇲🇾" },
  { symbol: "^STI", name: "Straits Times Index", category: "Indices", flag: "🇸🇬" },
  { symbol: "^TA125.TA", name: "Tel Aviv 125", category: "Indices", flag: "🇮🇱" },
  { symbol: "^GSPTSE", name: "S&P/TSX Composite", category: "Indices", flag: "🇨🇦" },
  { symbol: "^SSEC", name: "Shanghai Composite", category: "Indices", flag: "🇨🇳" },

  // Crypto (15) — today's 10 + 5 more liquid majors
  { symbol: "BTC-USD", name: "Bitcoin", category: "Crypto", flag: "₿" },
  { symbol: "ETH-USD", name: "Ethereum", category: "Crypto", flag: "Ξ" },
  { symbol: "BNB-USD", name: "BNB", category: "Crypto", flag: "🟡" },
  { symbol: "SOL-USD", name: "Solana", category: "Crypto", flag: "◎" },
  { symbol: "XRP-USD", name: "XRP", category: "Crypto", flag: "✕" },
  { symbol: "ADA-USD", name: "Cardano", category: "Crypto", flag: "₳" },
  { symbol: "AVAX-USD", name: "Avalanche", category: "Crypto", flag: "🔺" },
  { symbol: "DOT-USD", name: "Polkadot", category: "Crypto", flag: "⬤" },
  { symbol: "LINK-USD", name: "Chainlink", category: "Crypto", flag: "🔗" },
  { symbol: "DOGE-USD", name: "Dogecoin", category: "Crypto", flag: "🐕" },
  { symbol: "LTC-USD", name: "Litecoin", category: "Crypto", flag: "Ł" },
  { symbol: "TRX-USD", name: "Tron", category: "Crypto", flag: "🔻" },
  { symbol: "SHIB-USD", name: "Shiba Inu", category: "Crypto", flag: "🐕" },
  { symbol: "BCH-USD", name: "Bitcoin Cash", category: "Crypto", flag: "₿" },
  { symbol: "ATOM-USD", name: "Cosmos", category: "Crypto", flag: "⚛️" },

  // Forex (16) — today's 10 majors + 6 more crosses
  { symbol: "EURUSD=X", name: "EUR/USD", category: "Forex", flag: "🇪🇺" },
  { symbol: "GBPUSD=X", name: "GBP/USD", category: "Forex", flag: "🇬🇧" },
  { symbol: "USDJPY=X", name: "USD/JPY", category: "Forex", flag: "🇯🇵" },
  { symbol: "USDCHF=X", name: "USD/CHF", category: "Forex", flag: "🇨🇭" },
  { symbol: "AUDUSD=X", name: "AUD/USD", category: "Forex", flag: "🇦🇺" },
  { symbol: "USDCAD=X", name: "USD/CAD", category: "Forex", flag: "🇨🇦" },
  { symbol: "NZDUSD=X", name: "NZD/USD", category: "Forex", flag: "🇳🇿" },
  { symbol: "EURGBP=X", name: "EUR/GBP", category: "Forex", flag: "🇪🇺" },
  { symbol: "EURJPY=X", name: "EUR/JPY", category: "Forex", flag: "🇪🇺" },
  { symbol: "GBPJPY=X", name: "GBP/JPY", category: "Forex", flag: "🇬🇧" },
  { symbol: "USDSGD=X", name: "USD/SGD", category: "Forex", flag: "🇸🇬" },
  { symbol: "USDCNH=X", name: "USD/CNH", category: "Forex", flag: "🇨🇳" },
  { symbol: "USDMXN=X", name: "USD/MXN", category: "Forex", flag: "🇲🇽" },
  { symbol: "USDINR=X", name: "USD/INR", category: "Forex", flag: "🇮🇳" },
  { symbol: "EURCHF=X", name: "EUR/CHF", category: "Forex", flag: "🇪🇺" },
  { symbol: "AUDJPY=X", name: "AUD/JPY", category: "Forex", flag: "🇦🇺" },

  // Fixed ETFs (12) — structural benchmarks, always included, never ranked
  { symbol: "SPY", name: "S&P 500 ETF", category: "Stocks", flag: "🇺🇸" },
  { symbol: "QQQ", name: "Nasdaq 100 ETF", category: "Stocks", flag: "🇺🇸" },
  { symbol: "IWM", name: "Russell 2000 ETF", category: "Stocks", flag: "🇺🇸" },
  { symbol: "XLK", name: "Technology Sector SPDR", category: "Stocks", flag: "💻" },
  { symbol: "XLF", name: "Financials Sector SPDR", category: "Stocks", flag: "🏦" },
  { symbol: "XLE", name: "Energy Sector SPDR", category: "Stocks", flag: "⛽" },
  { symbol: "XLV", name: "Health Care Sector SPDR", category: "Stocks", flag: "🏥" },
  { symbol: "XLY", name: "Consumer Discretionary SPDR", category: "Stocks", flag: "🛍️" },
  { symbol: "XLP", name: "Consumer Staples SPDR", category: "Stocks", flag: "🛒" },
  { symbol: "XLI", name: "Industrials Sector SPDR", category: "Stocks", flag: "🏭" },
  { symbol: "XLU", name: "Utilities Sector SPDR", category: "Stocks", flag: "💡" },
  { symbol: "XLB", name: "Materials Sector SPDR", category: "Stocks", flag: "⚙️" },
];

export interface CorrelationStockPool {
  region: string;
  symbols: string[];
  topN: number;
  flag: string;
}

// Ranked by live market cap at refresh time (see refreshCorrelationStockSelection
// in server/trading.ts) — top `topN` per pool. US pool merges Dow + Nasdaq 100
// membership since both are needed to surface the true largest US names.
export const CORRELATION_STOCK_POOLS: CorrelationStockPool[] = [
  { region: "US", symbols: [...new Set([...DJI_SYMBOLS, ...NDX_SYMBOLS])], topN: 40, flag: "🇺🇸" },
  { region: "UK", symbols: FTSE100_SYMBOLS, topN: 15, flag: "🇬🇧" },
  { region: "Japan", symbols: NIKKEI225_SYMBOLS, topN: 15, flag: "🇯🇵" },
  { region: "India", symbols: NIFTY50_SYMBOLS, topN: 15, flag: "🇮🇳" },
  { region: "Hong Kong", symbols: HSI_SYMBOLS, topN: 15, flag: "🇭🇰" },
];
