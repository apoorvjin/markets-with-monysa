/**
 * Maps Yahoo Finance symbols → TradingView exchange:symbol format.
 * Rules:
 *  - Use exchange-specific prefixes (XETR:, NSE:, COMEX:, etc.) where the
 *    exchange is a real TradingView-recognised data source.
 *  - Use TVC: (TradingView Calculated) for global indices where TradingView
 *    itself is the canonical aggregator — these always resolve in the widget.
 *  - Forex fallback: strip "=X" suffix and prepend "FX:".
 */
const SYMBOL_MAP: Record<string, string> = {
  // ── US Indices ──────────────────────────────────────────────────────────────
  "^GSPC":      "SP:SPX",          // S&P 500  (Standard & Poor's)
  "^DJI":       "DJ:DJI",          // Dow Jones Industrial Average
  "^IXIC":      "NASDAQ:IXIC",     // NASDAQ Composite
  "^RUT":       "TVC:RUT",         // Russell 2000 (TVC canonical)
  "^VIX":       "CBOE:VIX",        // CBOE Volatility Index

  // ── European Indices ────────────────────────────────────────────────────────
  "^FTSE":      "TVC:UKX",         // FTSE 100 (TVC canonical)
  "^GDAXI":     "XETR:DAX",        // DAX 40 (XETRA Frankfurt)
  "^FCHI":      "EURONEXT:PX1",    // CAC 40 (Euronext Paris)
  "^STOXX50E":  "TVC:SX5E",        // Euro Stoxx 50 (TVC canonical)
  "^IBEX":      "BME:IBC",         // IBEX 35 (Bolsas y Mercados Españoles)
  "FTSEMIB.MI": "MIL:FTSEMIB",     // FTSE MIB (Borsa Italiana)
  "^AEX":       "EURONEXT:AEX",    // AEX (Euronext Amsterdam)
  "^SSMI":      "TVC:SMI",         // SMI (TVC canonical)
  "^OMX":       "TVC:OMXS30",      // OMX Stockholm 30 (TVC canonical)
  "^OSEAX":     "OSEAX:OSEAX",     // Oslo Stock Exchange All Share
  "^OMXC25":    "OMXCOP:OMXC25",   // OMX Copenhagen 25
  "^ATX":       "TVC:ATX",         // ATX (TVC canonical)
  "^BFX":       "EURONEXT:BEL20",  // BEL 20 (Euronext Brussels)
  "^PSI20":     "EURONEXT:PSI20",  // PSI 20 (Euronext Lisbon)
  "^WIG20":     "GPW:WIG20",       // WIG 20 (Warsaw Stock Exchange)
  "^ATX50":     "ATHEX:GD",        // Athens General Composite

  // ── Asian Indices ───────────────────────────────────────────────────────────
  "^N225":      "TVC:NI225",       // Nikkei 225 (TVC canonical)
  "^HSI":       "HKEX:HSI",        // Hang Seng (Hong Kong Exchange)
  "000001.SS":  "SSE:000001",      // Shanghai Composite (SSE)
  "^NSEI":      "NSE:NIFTY",       // NIFTY 50 (NSE India)
  "^BSESN":     "BSE:SENSEX",      // BSE Sensex (Bombay Stock Exchange)
  "^KS11":      "KRX:KOSPI",       // KOSPI (Korea Exchange)
  "^TWII":      "TWSE:TAIEX",      // TAIEX (Taiwan Stock Exchange)
  "^STI":       "SGX:STI",         // STI (Singapore Exchange)
  "^KLSE":      "KLSE:FBMKLCI",    // FBMKLCI (Bursa Malaysia)
  "^JKSE":      "IDX:COMPOSITE",   // Jakarta Composite (Indonesia)
  "^SET.BK":    "SET:SET",          // SET (Stock Exchange of Thailand)

  // ── Oceania ─────────────────────────────────────────────────────────────────
  "^AXJO":      "ASX:XJO",         // ASX 200 (Australian Securities Exchange)
  "^XJO":       "ASX:XJO",
  "^NZ50":      "NZX:NZ50",        // NZX 50 (New Zealand Exchange)

  // ── Middle East / Africa ────────────────────────────────────────────────────
  "^CASE30":    "EGX:EGX30",       // EGX 30 (Egyptian Exchange)
  "^TA125.TA":  "TASE:TA125",      // TA-125 (Tel Aviv Stock Exchange)
  "^TASI.SR":   "TADAWUL:TASI",    // TASI (Tadawul)
  "^MOEX.ME":   "MOEX:IMOEX",      // MOEX Russia Index
  "^J203.JO":   "JSE:J203",        // JSE All Share (South Africa)

  // ── Americas ────────────────────────────────────────────────────────────────
  "^BVSP":      "BMFBOVESPA:IBOV", // Ibovespa (B3 Brazil)
  "^MXX":       "BMV:IPC",         // IPC (Mexican Stock Exchange)
  "^GSPTSE":    "TSX:TSX",         // TSX Composite (Toronto)
  "^MERV":      "BYMA:MERVAL",     // MERVAL (Buenos Aires)
  "^IPSA":      "TVC:IPSA",        // IPSA (TVC canonical)
  "^COLCAP":    "BVC:COLCAP",      // COLCAP (Bolsa de Valores de Colombia)

  // ── Commodities — continuous contracts (CME Group / ICE) ────────────────────
  "GC=F":       "COMEX:GC1!",      // Gold
  "SI=F":       "COMEX:SI1!",      // Silver
  "PL=F":       "NYMEX:PL1!",      // Platinum
  "PA=F":       "NYMEX:PA1!",      // Palladium
  "CL=F":       "NYMEX:CL1!",      // WTI Crude Oil
  "BZ=F":       "NYMEX:BB1!",      // Brent Crude Oil
  "NG=F":       "NYMEX:NG1!",      // Natural Gas
  "RB=F":       "NYMEX:RB1!",      // RBOB Gasoline
  "HO=F":       "NYMEX:HO1!",      // Heating Oil
  "HG=F":       "COMEX:HG1!",      // Copper
  "ALI=F":      "COMEX:ALI1!",     // Aluminum
  "ZC=F":       "CBOT:ZC1!",       // Corn
  "ZW=F":       "CBOT:ZW1!",       // Wheat
  "ZS=F":       "CBOT:ZS1!",       // Soybeans
  "CC=F":       "ICEUS:CC1!",      // Cocoa
  "KC=F":       "ICEUS:KC1!",      // Coffee
  "CT=F":       "ICEUS:CT1!",      // Cotton
  "SB=F":       "ICEUS:SB1!",      // Sugar
  "OJ=F":       "ICEUS:OJ1!",      // Orange Juice
  "LE=F":       "CME:LE1!",        // Live Cattle
  "GF=F":       "CME:GF1!",        // Feeder Cattle
  "HE=F":       "CME:HE1!",        // Lean Hogs
  "LBS=F":      "CME:LBS1!",       // Lumber

  // ── ETFs & Indices for Volatility tab ───────────────────────────────────────
  "GDX":        "AMEX:GDX",        // VanEck Gold Miners ETF
  "XLE":        "AMEX:XLE",        // Energy Select Sector SPDR ETF
  "DX-Y.NYB":   "TVC:DXY",         // US Dollar Index
};

export function toTvSymbol(yahooSymbol: string): string {
  if (SYMBOL_MAP[yahooSymbol]) return SYMBOL_MAP[yahooSymbol];
  // Forex: XXXYYY=X → FX:XXXYYY  (e.g. EURUSD=X → FX:EURUSD)
  if (yahooSymbol.endsWith("=X")) {
    return "FX:" + yahooSymbol.replace("=X", "");
  }
  return yahooSymbol;
}
