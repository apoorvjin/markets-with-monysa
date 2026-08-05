import { SECTOR_ETFS } from "../routes/economy";

export type EtfCategory =
  | "sector"
  | "broad"
  | "international"
  | "fixed_income"
  | "commodity"
  | "thematic"
  | "leveraged"
  | "global_sector";

export interface EtfDef {
  symbol: string;
  name: string;
  emoji: string;
  category: EtfCategory;
  risk?: "leveraged";
}

const BROAD_MARKET_ETFS: EtfDef[] = [
  { symbol: "SPY", name: "S&P 500",       emoji: "🇺🇸", category: "broad" },
  { symbol: "QQQ", name: "Nasdaq 100",    emoji: "💠",  category: "broad" },
  { symbol: "DIA", name: "Dow Jones",     emoji: "🏛️", category: "broad" },
  { symbol: "IWM", name: "Russell 2000",  emoji: "📊",  category: "broad" },
  { symbol: "VTI", name: "Total US Mkt",  emoji: "🌐",  category: "broad" },
];

const INTERNATIONAL_ETFS: EtfDef[] = [
  { symbol: "EFA",  name: "Developed Mkts (EAFE)", emoji: "🌍", category: "international" },
  { symbol: "EEM",  name: "Emerging Markets",       emoji: "🌏", category: "international" },
  { symbol: "FXI",  name: "China Large-Cap",        emoji: "🇨🇳", category: "international" },
  { symbol: "EWJ",  name: "Japan",                  emoji: "🇯🇵", category: "international" },
  { symbol: "INDA", name: "India",                  emoji: "🇮🇳", category: "international" },
  // Single-country granularity (Plan Wave 1b) — same Yahoo quote/range pipeline
  // as every other ETF here, just more list entries. No new provider code.
  { symbol: "EWC",  name: "Canada",                 emoji: "🇨🇦", category: "international" },
  { symbol: "EWA",  name: "Australia",               emoji: "🇦🇺", category: "international" },
  { symbol: "EWZ",  name: "Brazil",                  emoji: "🇧🇷", category: "international" },
  { symbol: "EWW",  name: "Mexico",                  emoji: "🇲🇽", category: "international" },
  { symbol: "EWU",  name: "United Kingdom",          emoji: "🇬🇧", category: "international" },
  { symbol: "EWG",  name: "Germany",                 emoji: "🇩🇪", category: "international" },
  { symbol: "EWY",  name: "South Korea",             emoji: "🇰🇷", category: "international" },
  { symbol: "EWT",  name: "Taiwan",                  emoji: "🇹🇼", category: "international" },
  { symbol: "EWS",  name: "Singapore",                emoji: "🇸🇬", category: "international" },
  { symbol: "EZA",  name: "South Africa",             emoji: "🇿🇦", category: "international" },
  { symbol: "EIDO", name: "Indonesia",                emoji: "🇮🇩", category: "international" },
  { symbol: "EPOL", name: "Poland",                   emoji: "🇵🇱", category: "international" },
];

const FIXED_INCOME_ETFS: EtfDef[] = [
  { symbol: "TLT", name: "20+Yr Treasury",  emoji: "📜", category: "fixed_income" },
  { symbol: "IEF", name: "7-10Yr Treasury", emoji: "📄", category: "fixed_income" },
  { symbol: "SHY", name: "1-3Yr Treasury",  emoji: "🧾", category: "fixed_income" },
  { symbol: "HYG", name: "High Yield Corp", emoji: "⚠️", category: "fixed_income" },
  { symbol: "LQD", name: "Inv. Grade Corp", emoji: "🏦", category: "fixed_income" },
  { symbol: "AGG", name: "Aggregate Bond",  emoji: "📚", category: "fixed_income" },
];

const COMMODITY_ETFS: EtfDef[] = [
  { symbol: "GLD", name: "Gold",             emoji: "🥇", category: "commodity" },
  { symbol: "SLV", name: "Silver",           emoji: "🥈", category: "commodity" },
  { symbol: "USO", name: "Crude Oil",        emoji: "🛢️", category: "commodity" },
  { symbol: "DBC", name: "Broad Commodity",  emoji: "📦", category: "commodity" },
  { symbol: "UNG", name: "Natural Gas",      emoji: "🔥", category: "commodity" },
];

const THEMATIC_ETFS: EtfDef[] = [
  { symbol: "SMH",  name: "Semiconductors",   emoji: "🔌", category: "thematic" },
  { symbol: "SOXX", name: "Semiconductors (ICE)", emoji: "💾", category: "thematic" },
  { symbol: "ARKK", name: "Innovation",       emoji: "🚀", category: "thematic" },
  { symbol: "ICLN", name: "Clean Energy",     emoji: "🌱", category: "thematic" },
  { symbol: "ROBO", name: "Robotics & AI",    emoji: "🤖", category: "thematic" },
];

// iShares S&P Global Sector series — worldwide sector performance, not just
// US (fixes "sector rotation presented with no US qualifier" — the existing
// SECTOR_ETFS/getSectorQuadrants above stay untouched and now reasonably
// read as "the US market's sectors").
const GLOBAL_SECTOR_ETFS: EtfDef[] = [
  { symbol: "IXC",  name: "Global Energy",                emoji: "🌐", category: "global_sector" },
  { symbol: "IXG",  name: "Global Financials",             emoji: "🌐", category: "global_sector" },
  { symbol: "IXN",  name: "Global Technology",             emoji: "🌐", category: "global_sector" },
  { symbol: "IXJ",  name: "Global Healthcare",             emoji: "🌐", category: "global_sector" },
  { symbol: "MXI",  name: "Global Materials",              emoji: "🌐", category: "global_sector" },
  { symbol: "KXI",  name: "Global Consumer Staples",       emoji: "🌐", category: "global_sector" },
  { symbol: "RXI",  name: "Global Consumer Discretionary", emoji: "🌐", category: "global_sector" },
  { symbol: "JXI",  name: "Global Utilities",              emoji: "🌐", category: "global_sector" },
  { symbol: "IXP",  name: "Global Telecom",                emoji: "🌐", category: "global_sector" },
  { symbol: "EXI",  name: "Global Industrials",            emoji: "🌐", category: "global_sector" },
];

const LEVERAGED_ETFS: EtfDef[] = [
  { symbol: "TQQQ", name: "3x Nasdaq Bull",   emoji: "⚡", category: "leveraged", risk: "leveraged" },
  { symbol: "SQQQ", name: "3x Nasdaq Bear",   emoji: "🔻", category: "leveraged", risk: "leveraged" },
  { symbol: "SPXL", name: "3x S&P 500 Bull",  emoji: "⚡", category: "leveraged", risk: "leveraged" },
  { symbol: "SPXS", name: "3x S&P 500 Bear",  emoji: "🔻", category: "leveraged", risk: "leveraged" },
  { symbol: "UVXY", name: "1.5x VIX",         emoji: "🌪️", category: "leveraged", risk: "leveraged" },
];

export const ETF_UNIVERSE: EtfDef[] = [
  ...SECTOR_ETFS.map((e): EtfDef => ({ ...e, category: "sector" })),
  ...BROAD_MARKET_ETFS,
  ...INTERNATIONAL_ETFS,
  ...FIXED_INCOME_ETFS,
  ...COMMODITY_ETFS,
  ...THEMATIC_ETFS,
  ...GLOBAL_SECTOR_ETFS,
  ...LEVERAGED_ETFS,
];

// Categories with equity-like behavior that make sense on an SPX-relative
// RRG. Fixed income / commodity / leveraged-inverse are excluded — their
// rsRatio/rsMomentum vs SPX wouldn't be a meaningful rotation signal.
export const ETF_ROTATION_CATEGORIES: EtfCategory[] = [
  "sector",
  "broad",
  "international",
  "thematic",
  "global_sector",
];
