import type { Express } from "express";
import { fetchYahooPrice, fetchRangeData } from "./shared";

let debtCache: { data: any; timestamp: number } | null = null;
const DEBT_CACHE_DURATION = 12 * 60 * 60 * 1000;

const COUNTRY_DATA_CACHE_DURATION = 24 * 60 * 60 * 1000;
const countryDataCache: Record<string, { data: unknown; timestamp: number }> = {};

const WB_INDICATORS = {
  gdp: "NY.GDP.MKTP.CD",
  exports: "NE.EXP.GNFS.ZS",
  imports: "NE.IMP.GNFS.ZS",
  military: "MS.MIL.XPND.GD.ZS",
};

async function fetchWorldBank(code: string, indicator: string): Promise<number | null> {
  try {
    const url = `https://api.worldbank.org/v2/country/${code}/indicator/${indicator}?format=json&mrv=3&per_page=3`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    if (!Array.isArray(json) || !Array.isArray(json[1])) return null;
    const records = json[1] as { value: number | null }[];
    const found = records.find((r) => r.value != null);
    return found ? found.value : null;
  } catch {
    return null;
  }
}

async function fetchRestCountries(code: string): Promise<{ population: number | null; area: number | null } | null> {
  try {
    const url = `https://restcountries.com/v3.1/alpha/${code}?fields=population,area`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json() as { population?: number; area?: number };
    return {
      population: json.population ?? null,
      area: json.area ?? null,
    };
  } catch {
    return null;
  }
}

// ── Yield Curve (Bonds) ─────────────────────────────────────────────────────
let bondsCache: { data: unknown; timestamp: number } | null = null;
const BONDS_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

// ── S&P 500 Sector ETF Performance ──────────────────────────────────────────
let sectorsCache: { data: unknown; timestamp: number } | null = null;
const SECTORS_CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

const SECTOR_ETFS = [
  { symbol: "XLF",  name: "Financials",      emoji: "🏦" },
  { symbol: "XLK",  name: "Technology",       emoji: "💻" },
  { symbol: "XLE",  name: "Energy",           emoji: "⚡" },
  { symbol: "XLI",  name: "Industrials",      emoji: "🏭" },
  { symbol: "XLU",  name: "Utilities",        emoji: "🔌" },
  { symbol: "XLRE", name: "Real Estate",      emoji: "🏠" },
  { symbol: "XLP",  name: "Cons. Staples",    emoji: "🛒" },
  { symbol: "XLB",  name: "Materials",        emoji: "⛏️" },
  { symbol: "XLY",  name: "Cons. Disc.",      emoji: "🛍️" },
  { symbol: "XLV",  name: "Healthcare",       emoji: "💊" },
  { symbol: "XLC",  name: "Comm. Services",   emoji: "📡" },
] as const;

// Historical Crisis Playbook — edit this array to add/update events; no Flutter changes needed
const CRISIS_DATA = [
  {
    id: "tariff-war-2025",
    name: "US Tariff War",
    period: "Apr 2025–Present",
    vixPeak: 52.3,
    status: "ongoing",
    outcome: "S&P -15% in 3 days, Gold +12%, USD volatile",
    description: "Trump 145% tariffs on China, 90-day pause on others; global trade rerouting and supply chain repricing underway",
  },
  {
    id: "middle-east-2024",
    name: "Middle East Escalation",
    period: "Oct 2023–Present",
    vixPeak: 23.1,
    status: "ongoing",
    outcome: "Oil +8%, Gold +18%, shipping costs +40%",
    description: "Hamas attack, Israeli ground offensive, Houthi Red Sea disruptions and Iran-Israel direct exchanges raised regional risk premium",
  },
  {
    id: "japan-carry-2024",
    name: "Japan Carry Unwind",
    period: "Aug 2024",
    vixPeak: 65.7,
    status: "recent",
    outcome: "Nikkei -12% in one day, USD/JPY -8%, S&P -6%",
    description: "BoJ surprise rate hike unwound years of yen-funded carry trades in a single session — VIX briefly hit 65 intraday",
  },
  {
    id: "banking-crisis-2023",
    name: "US Banking Crisis",
    period: "Mar 2023",
    vixPeak: 26.5,
    status: "recent",
    outcome: "Banks -30%, Gold +10%, 2Y Treasury -100bps in days",
    description: "SVB, Signature, and First Republic collapsed; Fed launched BTFP to backstop $620B in unrealised bond losses across the sector",
  },
  {
    id: "ftx-collapse-2022",
    name: "FTX Collapse",
    period: "Nov 2022",
    vixPeak: 27.1,
    status: "recent",
    outcome: "BTC -24% in 3 days, Crypto sector -70% from ATH",
    description: "FTX filed for bankruptcy with $8B in missing customer funds; cascading contagion froze crypto lending markets",
  },
  {
    id: "rate-shock-2022",
    name: "Fed Rate Shock",
    period: "2022",
    vixPeak: 34.5,
    status: "recent",
    outcome: "S&P -25%, Bonds worst year since 1788, DXY +14%",
    description: "Fastest Fed hiking cycle in 40 years (0 → 4.5% in 12 months) crushed both stock and bond portfolios simultaneously",
  },
  {
    id: "ukraine-2022",
    name: "Ukraine Invasion",
    period: "Feb 2022",
    vixPeak: 38.9,
    status: "recent",
    outcome: "Oil +80%, Wheat +60%, EUR -15%",
    description: "Russia's full-scale invasion triggered commodity shock, European energy crisis, and fastest Western sanctions response in history",
  },
  {
    id: "covid-2020",
    name: "COVID-19 Crash",
    period: "Mar 2020",
    vixPeak: 85.5,
    status: "historical",
    outcome: "S&P -34%, BTC -65% then +1000%, Gold +25%",
    description: "Pandemic lockdowns triggered the fastest bear market in history; $8T in global stimulus that followed drove a historic recovery",
  },
  {
    id: "china-crash-2015",
    name: "China Stock Crash",
    period: "Aug 2015",
    vixPeak: 53.3,
    status: "historical",
    outcome: "Shanghai -45%, EM currencies -20%, Oil -30%",
    description: "Chinese margin bubble burst and PBoC's surprise yuan devaluation sparked a global EM selloff and commodity rout",
  },
  {
    id: "euro-crisis-2012",
    name: "Euro Debt Crisis",
    period: "2010–2012",
    vixPeak: 48.2,
    status: "historical",
    outcome: "EUR -25%, PIIGS bond yields spiked, ECB 'whatever it takes'",
    description: "Greece, Ireland, Portugal required bailouts; sovereign debt contagion threatened eurozone breakup until Draghi's July 2012 pledge",
  },
  {
    id: "gfc-2008",
    name: "Global Financial Crisis",
    period: "2008–2009",
    vixPeak: 89.5,
    status: "historical",
    outcome: "S&P -57%, Gold +25%, Oil -77% then +150%",
    description: "Lehman Brothers collapse froze global credit markets and triggered the worst recession since the 1930s Great Depression",
  },
  {
    id: "dotcom-2000",
    name: "Dot-com Bust",
    period: "2000–2002",
    vixPeak: 42.7,
    status: "historical",
    outcome: "NASDAQ -78%, S&P -49%, Gold +15%",
    description: "Tech bubble burst destroyed $5T in market cap; 9/11 deepened the downturn and triggered a global recession",
  },
  {
    id: "asian-crisis-1997",
    name: "Asian Financial Crisis",
    period: "1997–1998",
    vixPeak: 45.7,
    status: "historical",
    outcome: "EM currencies -50–80%, Nikkei -35%, Gold -25%",
    description: "Currency peg collapses swept Thailand, Indonesia and Korea; IMF bailouts with harsh austerity conditions reshaped EM debt markets",
  },
  {
    id: "oil-crisis-1973",
    name: "1973 Oil Crisis",
    period: "1973–1974",
    vixPeak: 0,
    status: "historical",
    outcome: "S&P -48%, Oil +400%, Gold surged post-Bretton Woods",
    description: "OPEC embargo following Yom Kippur War triggered stagflation, ended Bretton Woods, and permanently changed energy policy",
  },
];

export function registerEconomyRoutes(app: Express): void {
  // ── Stock Search ────────────────────────────────────────────────────────────
  app.get("/api/search", async (req, res) => {
    const q = ((req.query.q as string) || "").trim();
    if (!q) return res.json({ results: [] });
    const limit = Math.min(parseInt((req.query.limit as string) || "15"), 20);
    try {
      const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=${limit}&newsCount=0&lang=en-US&region=US`;
      const resp = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
      });
      if (!resp.ok) return res.json({ results: [] });
      const data = await resp.json() as any;
      const quotes = ((data?.quotes as any[]) || []).filter((q: any) => q.isYahooFinance);
      const results = quotes.map((q: any) => ({
        symbol: q.symbol as string,
        name: ((q.longname || q.shortname || q.symbol) as string),
        exchange: (q.exchange || "") as string,
        type: (q.quoteType || "EQUITY") as string,
      }));
      res.json({ results });
    } catch {
      res.status(500).json({ results: [] });
    }
  });

  app.get("/api/usa-debt", async (_req, res) => {
    try {
      if (debtCache && Date.now() - debtCache.timestamp < DEBT_CACHE_DURATION) {
        return res.json(debtCache.data);
      }

      const debtUrl = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny?sort=-record_date&page[size]=1";
      const debtResponse = await fetch(debtUrl, {
        headers: { "User-Agent": "Mozilla/5.0" }
      });

      let totalDebt = 36.2e12;
      let recordDate = "2025-04-09";

      if (debtResponse.ok) {
        const debtData = await debtResponse.json() as any;
        if (debtData?.data?.[0]) {
          const record = debtData.data[0];
          const debtHeld = parseFloat(record.debt_held_public_amt || "0");
          const intraGov = parseFloat(record.intragov_hold_amt || "0");
          totalDebt = debtHeld + intraGov;
          recordDate = record.record_date || recordDate;
        }
      }

      const population = 335_000_000;
      const taxpayers = 150_000_000;
      const gdp = 29.2e12;

      const debtPerCitizen = Math.round(totalDebt / population);
      const debtPerTaxpayer = Math.round(totalDebt / taxpayers);
      const debtToGdp = ((totalDebt / gdp) * 100).toFixed(0);

      function formatT(n: number): string {
        if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
        if (n >= 1e9) return `$${(n / 1e9).toFixed(0)}B`;
        return `$${n.toLocaleString()}`;
      }

      const result = {
        recordDate,
        totalDebt,
        totalDebtFormatted: formatT(totalDebt),
        debtPerCitizen: `$${debtPerCitizen.toLocaleString()}`,
        debtPerTaxpayer: `$${debtPerTaxpayer.toLocaleString()}`,
        debtToGdpRatio: `${debtToGdp}%`,
        dailyIncrease: "$4.8 Billion",
        annualDeficit: "$1.83 Trillion",
        interestPayments: "$1.1 Trillion/yr",
        debtGrowth20yr: "+$28 Trillion",
        revenueVsSpending: "$4.9T in / $6.7T out",
        ssUnfunded: "$22.4 Trillion",
        medicareUnfunded: "$48.3 Trillion",
        foreignHolders: {
          japan: "$1,079B",
          china: "$759B",
          uk: "$723B",
          canada: "$254B",
          india: "$234B",
          totalForeign: "$8.5 Trillion",
        },
        spending: {
          socialSecurity: "$1.46 Trillion",
          medicareMedicaid: "$1.68 Trillion",
          defense: "$886 Billion",
          netInterest: "$1.1 Trillion",
          everythingElse: "$1.6 Trillion",
        },
      };

      debtCache = { data: result, timestamp: Date.now() };
      res.json(result);
    } catch (error) {
      console.error("Error fetching USA debt data:", error);
      res.status(500).json({ error: "Failed to fetch debt data" });
    }
  });

  app.get("/api/country-data/:code", async (req, res) => {
    const code = (req.params.code as string).toUpperCase();
    if (!code) return res.status(400).json({ error: "Invalid code" });

    const cached = countryDataCache[code];
    if (cached && Date.now() - cached.timestamp < COUNTRY_DATA_CACHE_DURATION) {
      return res.json(cached.data);
    }

    const wbCode = code === "EU" ? "EUU" : code;

    const [gdp, exports_, imports_, military_, restData] = await Promise.allSettled([
      fetchWorldBank(wbCode, WB_INDICATORS.gdp),
      fetchWorldBank(wbCode, WB_INDICATORS.exports),
      fetchWorldBank(wbCode, WB_INDICATORS.imports),
      fetchWorldBank(wbCode, WB_INDICATORS.military),
      fetchRestCountries(code === "EU" ? "de" : code),
    ]);

    const result = {
      gdp: gdp.status === "fulfilled" ? gdp.value : null,
      exportsPctGdp: exports_.status === "fulfilled" ? exports_.value : null,
      importsPctGdp: imports_.status === "fulfilled" ? imports_.value : null,
      militaryPctGdp: military_.status === "fulfilled" ? military_.value : null,
      population: restData.status === "fulfilled" && restData.value ? restData.value.population : null,
      area: restData.status === "fulfilled" && restData.value ? restData.value.area : null,
    };

    countryDataCache[code] = { data: result, timestamp: Date.now() };
    res.json(result);
  });

  app.get("/api/bonds", async (_req, res) => {
    try {
      if (bondsCache && Date.now() - bondsCache.timestamp < BONDS_CACHE_DURATION) {
        return res.json(bondsCache.data);
      }

      const [r3m, r5y, r10y, r30y] = await Promise.all([
        fetchYahooPrice("^IRX"),
        fetchYahooPrice("^FVX"),
        fetchYahooPrice("^TNX"),
        fetchYahooPrice("^TYX"),
      ]);

      const us3m  = r3m?.price  ?? null;
      const us5y  = r5y?.price  ?? null;
      const us10y = r10y?.price ?? null;
      const us30y = r30y?.price ?? null;

      const spread3m10y = us10y != null && us3m != null
        ? parseFloat((us10y - us3m).toFixed(4))
        : null;

      let curveStatus: "inverted" | "flat" | "normal" | null = null;
      if (spread3m10y != null) {
        if (spread3m10y < -0.2) curveStatus = "inverted";
        else if (spread3m10y <= 0.2) curveStatus = "flat";
        else curveStatus = "normal";
      }

      const result = {
        us3m,
        us5y,
        us10y,
        us30y,
        spread3m10y,
        curveStatus,
        lastUpdated: new Date().toISOString(),
      };

      bondsCache = { data: result, timestamp: Date.now() };
      res.json(result);
    } catch (error) {
      console.error("Error fetching bond yield data:", error);
      res.status(500).json({ error: "Failed to fetch bond yield data" });
    }
  });

  app.get("/api/sectors", async (_req, res) => {
    try {
      if (sectorsCache && Date.now() - sectorsCache.timestamp < SECTORS_CACHE_DURATION) {
        return res.json(sectorsCache.data);
      }

      const sectorData = await Promise.all(
        SECTOR_ETFS.map(async (etf) => {
          const [quote, perf1W, perf1M, perf3M, perf6M, perf1Y, perf3Y, perf5Y] = await Promise.all([
            fetchYahooPrice(etf.symbol),
            fetchRangeData(etf.symbol, "5d"),
            fetchRangeData(etf.symbol, "1mo"),
            fetchRangeData(etf.symbol, "3mo"),
            fetchRangeData(etf.symbol, "6mo"),
            fetchRangeData(etf.symbol, "1y"),
            fetchRangeData(etf.symbol, "3y"),
            fetchRangeData(etf.symbol, "5y"),
          ]);
          return {
            symbol: etf.symbol,
            name: etf.name,
            emoji: etf.emoji,
            price: quote?.price ?? null,
            changePercent: quote?.changePercent ?? null,
            perf1W: perf1W?.changePercent ?? null,
            perf1M: perf1M?.changePercent ?? null,
            perf3M: perf3M?.changePercent ?? null,
            perf6M: perf6M?.changePercent ?? null,
            perf1Y: perf1Y?.changePercent ?? null,
            perf3Y: perf3Y?.changePercent ?? null,
            perf5Y: perf5Y?.changePercent ?? null,
          };
        })
      );

      const result = {
        sectors: sectorData,
        lastUpdated: new Date().toISOString(),
      };

      sectorsCache = { data: result, timestamp: Date.now() };
      res.json(result);
    } catch (error) {
      console.error("Error fetching sector ETF data:", error);
      res.status(500).json({ error: "Failed to fetch sector data" });
    }
  });

  app.get("/api/crises", (_req, res) => {
    res.json({ crises: CRISIS_DATA, dataAsOf: "May 2026" });
  });
}
