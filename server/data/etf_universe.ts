import { SECTOR_ETFS } from "../routes/economy";

export type EtfCategory =
  | "sector"
  | "broad"
  | "international"
  | "fixed_income"
  | "commodity"
  | "thematic"
  | "leveraged";

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
];
