/**
 * Hardcoded constituent symbol lists for major non-S&P 500 indices.
 *
 * S&P 500 is fetched from the public datasets GitHub CSV (constituents + sector
 * + name) inside server/routes/heatmap.ts. Everything below only carries
 * Yahoo Finance symbols — names and sectors are filled in at fetch time from
 * the Yahoo quoteSummary `price` + `assetProfile` modules.
 *
 * Refresh manually after major index rebalances. Stale entries return null
 * from Yahoo and are silently dropped.
 */

// Dow Jones Industrial Average — 30 components (post Nov-2024 rebalance:
// SHW replaced DOW, NVDA replaced INTC, AMZN replaced WBA).
export const DJI_SYMBOLS: string[] = [
  "AAPL", "AMGN", "AMZN", "AXP", "BA", "CAT", "CRM", "CSCO", "CVX", "DIS",
  "GS", "HD", "HON", "IBM", "JNJ", "JPM", "KO", "MCD", "MMM", "MRK",
  "MSFT", "NKE", "NVDA", "PG", "SHW", "TRV", "UNH", "V", "VZ", "WMT",
];

// NASDAQ 100 — 100 largest non-financial NASDAQ-listed companies.
export const NDX_SYMBOLS: string[] = [
  "AAPL", "ABNB", "ADBE", "ADI", "ADP", "ADSK", "AEP", "AMAT", "AMD", "AMGN",
  "AMZN", "ANSS", "APP",  "ARM",  "ASML", "AVGO", "AZN",  "BIIB", "BKNG", "BKR",
  "CCEP", "CDNS", "CDW",  "CEG",  "CHTR", "CMCSA","COST", "CPRT", "CRWD", "CSCO",
  "CSGP", "CSX",  "CTAS", "CTSH", "DASH", "DDOG", "DXCM", "EA",   "EXC",  "FANG",
  "FAST", "FTNT", "GEHC", "GFS",  "GILD", "GOOG", "GOOGL","HON",  "IDXX", "INTC",
  "INTU", "ISRG", "KDP",  "KHC",  "KLAC", "LIN",  "LRCX", "LULU", "MAR",  "MCHP",
  "MDB",  "MDLZ", "MELI", "META", "MNST", "MRVL", "MSFT", "MSTR", "MU",   "NFLX",
  "NVDA", "NXPI", "ODFL", "ON",   "ORLY", "PANW", "PAYX", "PCAR", "PDD",  "PEP",
  "PLTR", "PYPL", "QCOM", "REGN", "ROP",  "ROST", "SBUX", "SNPS", "TEAM", "TMUS",
  "TSLA", "TTD",  "TTWO", "TXN",  "VRSK", "VRTX", "WBD",  "WDAY", "XEL",  "ZS",
];

// FTSE 100 — UK large-cap index on the London Stock Exchange. Yahoo suffix: .L
// BT-A.L is BT Group plc class A; ABF.L is Associated British Foods; etc.
export const FTSE100_SYMBOLS: string[] = [
  "AAL.L",  "ABF.L",  "ADM.L",  "AHT.L",  "ANTO.L", "AUTO.L", "AV.L",   "AZN.L",
  "BA.L",   "BARC.L", "BATS.L", "BDEV.L", "BEZ.L",  "BKG.L",  "BME.L",  "BNZL.L",
  "BP.L",   "BT-A.L", "CCH.L",  "CNA.L",  "CPG.L",  "CRDA.L", "CRH.L",  "CTEC.L",
  "DCC.L",  "DGE.L",  "DPLM.L", "EDV.L",  "ENT.L",  "EXPN.L", "EZJ.L",  "FCIT.L",
  "FRES.L", "GLEN.L", "GSK.L",  "HIK.L",  "HL.L",   "HLN.L",  "HLMA.L", "HSBA.L",
  "HWDN.L", "IAG.L",  "ICG.L",  "IHG.L",  "III.L",  "IMB.L",  "IMI.L",  "INF.L",
  "ITRK.L", "JD.L",   "KGF.L",  "LAND.L", "LGEN.L", "LLOY.L", "LSEG.L", "MKS.L",
  "MNDI.L", "MNG.L",  "MRO.L",  "NG.L",   "NWG.L",  "NXT.L",  "PHNX.L", "PRU.L",
  "PSH.L",  "PSN.L",  "PSON.L", "REL.L",  "RIO.L",  "RKT.L",  "RMV.L",  "RR.L",
  "RTO.L",  "SBRY.L", "SDR.L",  "SGE.L",  "SGRO.L", "SHEL.L", "SMDS.L", "SMIN.L",
  "SN.L",   "SPX.L",  "SSE.L",  "STAN.L", "STJ.L",  "SVT.L",  "TSCO.L", "TW.L",
  "ULVR.L", "UTG.L",  "UU.L",   "VOD.L",  "WEIR.L", "WPP.L",  "WTB.L",
];

// Nifty 50 — top 50 NSE India large-caps. Yahoo suffix: .NS
// M&M (Mahindra & Mahindra) uses M%26M.NS via URL encoding — kept as raw symbol
// here; the fetcher URL-encodes per request.
export const NIFTY50_SYMBOLS: string[] = [
  "ADANIENT.NS",  "ADANIPORTS.NS","APOLLOHOSP.NS","ASIANPAINT.NS","AXISBANK.NS",
  "BAJAJ-AUTO.NS","BAJFINANCE.NS","BAJAJFINSV.NS","BPCL.NS",      "BHARTIARTL.NS",
  "BRITANNIA.NS", "CIPLA.NS",     "COALINDIA.NS", "DIVISLAB.NS",  "DRREDDY.NS",
  "EICHERMOT.NS", "GRASIM.NS",    "HCLTECH.NS",   "HDFCBANK.NS",  "HDFCLIFE.NS",
  "HEROMOTOCO.NS","HINDALCO.NS",  "HINDUNILVR.NS","ICICIBANK.NS", "INDUSINDBK.NS",
  "INFY.NS",      "ITC.NS",       "JSWSTEEL.NS",  "KOTAKBANK.NS", "LT.NS",
  "LTIM.NS",      "M&M.NS",       "MARUTI.NS",    "NESTLEIND.NS", "NTPC.NS",
  "ONGC.NS",      "POWERGRID.NS", "RELIANCE.NS",  "SBILIFE.NS",   "SBIN.NS",
  "SHRIRAMFIN.NS","SUNPHARMA.NS", "TCS.NS",       "TATACONSUM.NS","TATAMOTORS.NS",
  "TATASTEEL.NS", "TECHM.NS",     "TITAN.NS",     "ULTRACEMCO.NS","WIPRO.NS",
];

// DAX 40 — German large-caps on Deutsche Börse. Yahoo suffix: .DE
// Exhaustive list (small enough to be accurate).
export const DAX40_SYMBOLS: string[] = [
  "ADS.DE",  "AIR.DE",  "ALV.DE",  "BAS.DE",  "BAYN.DE", "BEI.DE",  "BMW.DE",
  "BNR.DE",  "CBK.DE",  "CON.DE",  "1COV.DE", "DB1.DE",  "DBK.DE",  "DHL.DE",
  "DTE.DE",  "DTG.DE",  "ENR.DE",  "EOAN.DE", "FRE.DE",  "HEI.DE",  "HEN3.DE",
  "HNR1.DE", "IFX.DE",  "MBG.DE",  "MRK.DE",  "MTX.DE",  "MUV2.DE", "P911.DE",
  "PAH3.DE", "QIA.DE",  "RHM.DE",  "RWE.DE",  "SAP.DE",  "SHL.DE",  "SIE.DE",
  "SRT3.DE", "SY1.DE",  "VNA.DE",  "VOW3.DE", "ZAL.DE",
];

// Hang Seng Index (HSI) — Hong Kong blue-chips. Yahoo suffix: .HK
// Top 50 by index weight (approximate). Yahoo silently drops outdated tickers.
export const HSI_SYMBOLS: string[] = [
  "0001.HK", "0002.HK", "0003.HK", "0005.HK", "0006.HK", "0011.HK", "0012.HK",
  "0016.HK", "0017.HK", "0027.HK", "0066.HK", "0101.HK", "0175.HK", "0241.HK",
  "0267.HK", "0288.HK", "0291.HK", "0316.HK", "0386.HK", "0388.HK", "0669.HK",
  "0688.HK", "0700.HK", "0762.HK", "0823.HK", "0857.HK", "0868.HK", "0883.HK",
  "0939.HK", "0941.HK", "0960.HK", "0968.HK", "0992.HK", "1024.HK", "1038.HK",
  "1093.HK", "1109.HK", "1113.HK", "1177.HK", "1209.HK", "1211.HK", "1299.HK",
  "1398.HK", "1810.HK", "1928.HK", "2007.HK", "2015.HK", "2269.HK", "2318.HK",
  "2319.HK", "2331.HK", "2382.HK", "2388.HK", "2628.HK", "2688.HK", "2899.HK",
  "3690.HK", "3692.HK", "3968.HK", "3988.HK", "6098.HK", "6618.HK", "6862.HK",
  "9618.HK", "9633.HK", "9888.HK", "9961.HK", "9988.HK", "9999.HK",
];

// Nikkei 225 — Japan large-caps on the Tokyo Stock Exchange. Yahoo suffix: .T
// Top ~60 by index weight (Nikkei 225 is price-weighted; the highest-priced
// names dominate). Yahoo silently drops outdated tickers.
export const NIKKEI225_SYMBOLS: string[] = [
  "1605.T",  "2502.T",  "2802.T",  "2914.T",  "3382.T",  "3402.T",  "3407.T",
  "4063.T",  "4188.T",  "4452.T",  "4502.T",  "4503.T",  "4507.T",  "4523.T",
  "4543.T",  "4568.T",  "4661.T",  "4901.T",  "5108.T",  "5401.T",  "6098.T",
  "6273.T",  "6301.T",  "6326.T",  "6367.T",  "6501.T",  "6594.T",  "6701.T",
  "6702.T",  "6723.T",  "6752.T",  "6758.T",  "6857.T",  "6861.T",  "6902.T",
  "6920.T",  "6954.T",  "6981.T",  "7011.T",  "7203.T",  "7267.T",  "7270.T",
  "7741.T",  "7751.T",  "7832.T",  "7974.T",  "8001.T",  "8002.T",  "8031.T",
  "8035.T",  "8053.T",  "8058.T",  "8306.T",  "8316.T",  "8411.T",  "8591.T",
  "8604.T",  "8725.T",  "8766.T",  "8801.T",  "8802.T",  "9020.T",  "9432.T",
  "9433.T",  "9434.T",  "9501.T",  "9503.T",  "9613.T",  "9735.T",  "9843.T",
  "9983.T",  "9984.T",
];

// Russell 2000 (RUT) — US small-cap index. Top ~80 names by recent marketCap;
// the full 2000-symbol roster is impractical to enumerate and rotates quarterly.
// This subset covers the most recognisable small-/mid-caps and gives a meaningful
// treemap snapshot. Yahoo dropouts are silently filtered.
export const RUSSELL2000_SYMBOLS: string[] = [
  "MSTR", "SMCI", "APP",  "FTAI", "COIN", "MARA", "RIVN", "AFRM", "RKT",  "PLNT",
  "ELF",  "INSM", "MUSA", "FIX",  "BURL", "DKS",  "GME",  "IBKR", "STRL", "EME",
  "DUOL", "TPL",  "PCVX", "WSM",  "FCNCA","VRT",  "EXLS", "ALSN", "LII",  "SAIA",
  "EXP",  "SPSC", "BJ",   "LECO", "AMG",  "DCI",  "CIEN", "MORN", "WTRG", "ITT",
  "RGLD", "FYBR", "WSO",  "AOS",  "RNR",  "RGA",  "RBC",  "WMS",  "ATR",  "NTNX",
  "MEDP", "CHX",  "ATKR", "AYI",  "FN",   "SAIC", "MTH",  "LRN",  "DBX",  "WOLF",
  "BCPC", "CRS",  "ESAB", "MMS",  "ENS",  "POWL", "CRC",  "FRPT", "MTSI", "PIPR",
  "HALO", "QLYS", "TKR",  "ETSY", "POOL", "GTLB", "HIMS", "INTA", "ASB",  "BWXT",
];

export const INDEX_SYMBOLS: Record<string, string[]> = {
  ndx:        NDX_SYMBOLS,
  dji:        DJI_SYMBOLS,
  ftse100:    FTSE100_SYMBOLS,
  nifty50:    NIFTY50_SYMBOLS,
  dax40:      DAX40_SYMBOLS,
  hsi:        HSI_SYMBOLS,
  nikkei225:  NIKKEI225_SYMBOLS,
  russell2000: RUSSELL2000_SYMBOLS,
};
