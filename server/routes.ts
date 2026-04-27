import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { createTradingRouter } from "./trading";

const COUNTRY_EXCHANGE_MAP: Record<string, { exchanges: string[]; region: string; suffix: string }> = {
  CN: { exchanges: ["SSE", "SZSE"], region: "China", suffix: ".SS" },
  KH: { exchanges: ["CSX"], region: "Cambodia", suffix: ".KH" },
  VN: { exchanges: ["HOSE", "HNX"], region: "Vietnam", suffix: ".VN" },
  LA: { exchanges: [], region: "Laos", suffix: ".LA" },
  LK: { exchanges: ["CSE"], region: "Sri Lanka", suffix: ".CM" },
  MM: { exchanges: ["YSX"], region: "Myanmar", suffix: ".MM" },
  BD: { exchanges: ["DSE"], region: "Bangladesh", suffix: ".BD" },
  TH: { exchanges: ["SET"], region: "Thailand", suffix: ".BK" },
  TW: { exchanges: ["TWSE"], region: "Taiwan", suffix: ".TW" },
  ID: { exchanges: ["IDX"], region: "Indonesia", suffix: ".JK" },
  IN: { exchanges: ["NSE", "BSE"], region: "India", suffix: ".NS" },
  IN_BSE: { exchanges: ["BSE"], region: "India", suffix: ".BO" },
  KR: { exchanges: ["KRX"], region: "South Korea", suffix: ".KS" },
  JP: { exchanges: ["TSE"], region: "Japan", suffix: ".T" },
  MY: { exchanges: ["KLSE"], region: "Malaysia", suffix: ".KL" },
  PK: { exchanges: ["PSX"], region: "Pakistan", suffix: ".KA" },
  PH: { exchanges: ["PSE"], region: "Philippines", suffix: ".PS" },
  SG: { exchanges: ["SGX"], region: "Singapore", suffix: ".SI" },
  IL: { exchanges: ["TASE"], region: "Israel", suffix: ".TA" },
  SA: { exchanges: ["TADAWUL"], region: "Saudi Arabia", suffix: ".SR" },
  AE: { exchanges: ["ADX", "DFM"], region: "UAE", suffix: ".AE" },
  QA: { exchanges: ["QSE"], region: "Qatar", suffix: ".QA" },
  KW: { exchanges: ["BK"], region: "Kuwait", suffix: ".KW" },
  TR: { exchanges: ["BIST"], region: "Turkey", suffix: ".IS" },
  ZA: { exchanges: ["JSE"], region: "South Africa", suffix: ".JO" },
  NG: { exchanges: ["NGX"], region: "Nigeria", suffix: ".LG" },
  EG: { exchanges: ["EGX"], region: "Egypt", suffix: ".CA" },
  KE: { exchanges: ["NSE"], region: "Kenya", suffix: ".NR" },
  MA: { exchanges: ["CSE"], region: "Morocco", suffix: ".CS" },
  GB: { exchanges: ["LSE"], region: "United Kingdom", suffix: ".L" },
  DE: { exchanges: ["XETRA"], region: "Germany", suffix: ".DE" },
  FR: { exchanges: ["EURONEXT"], region: "France", suffix: ".PA" },
  IT: { exchanges: ["BIT"], region: "Italy", suffix: ".MI" },
  ES: { exchanges: ["BME"], region: "Spain", suffix: ".MC" },
  NL: { exchanges: ["EURONEXT"], region: "Netherlands", suffix: ".AS" },
  CH: { exchanges: ["SIX"], region: "Switzerland", suffix: ".SW" },
  SE: { exchanges: ["SSE"], region: "Sweden", suffix: ".ST" },
  NO: { exchanges: ["OSE"], region: "Norway", suffix: ".OL" },
  DK: { exchanges: ["CSE"], region: "Denmark", suffix: ".CO" },
  FI: { exchanges: ["NASDAQ"], region: "Finland", suffix: ".HE" },
  BE: { exchanges: ["EURONEXT"], region: "Belgium", suffix: ".BR" },
  AT: { exchanges: ["VSE"], region: "Austria", suffix: ".VI" },
  PT: { exchanges: ["EURONEXT"], region: "Portugal", suffix: ".LS" },
  IE: { exchanges: ["ISE"], region: "Ireland", suffix: ".IR" },
  PL: { exchanges: ["GPW"], region: "Poland", suffix: ".WA" },
  GR: { exchanges: ["ATHEX"], region: "Greece", suffix: ".AT" },
  CZ: { exchanges: ["PSE"], region: "Czech Republic", suffix: ".PR" },
  HU: { exchanges: ["BSE"], region: "Hungary", suffix: ".BD" },
  RO: { exchanges: ["BVB"], region: "Romania", suffix: ".RO" },
  BG: { exchanges: ["BSE"], region: "Bulgaria", suffix: ".BG" },
  HR: { exchanges: ["ZSE"], region: "Croatia", suffix: ".ZA" },
  AU: { exchanges: ["ASX"], region: "Australia", suffix: ".AX" },
  NZ: { exchanges: ["NZX"], region: "New Zealand", suffix: ".NZ" },
  CA: { exchanges: ["TSX"], region: "Canada", suffix: ".TO" },
  MX: { exchanges: ["BMV"], region: "Mexico", suffix: ".MX" },
  BR: { exchanges: ["B3"], region: "Brazil", suffix: ".SA" },
  AR: { exchanges: ["BCBA"], region: "Argentina", suffix: ".BA" },
  CL: { exchanges: ["BCS"], region: "Chile", suffix: ".SN" },
  CO: { exchanges: ["BVC"], region: "Colombia", suffix: ".CL" },
  PE: { exchanges: ["BVL"], region: "Peru", suffix: ".LM" },
  RU: { exchanges: ["MOEX"], region: "Russia", suffix: ".ME" },
  HK: { exchanges: ["HKEX"], region: "Hong Kong", suffix: ".HK" },
  EU: { exchanges: ["EURONEXT"], region: "Europe", suffix: ".PA" },
  JO: { exchanges: ["ASE"], region: "Jordan", suffix: ".AM" },
  BH: { exchanges: ["BHB"], region: "Bahrain", suffix: ".BH" },
  LB: { exchanges: ["BSE"], region: "Lebanon", suffix: ".LB" },
  IQ: { exchanges: ["ISX"], region: "Iraq", suffix: ".IQ" },
  TN: { exchanges: ["BVMT"], region: "Tunisia", suffix: ".TN" },
  GH: { exchanges: ["GSE"], region: "Ghana", suffix: ".GH" },
  TZ: { exchanges: ["DSE"], region: "Tanzania", suffix: ".TZ" },
  MU: { exchanges: ["SEM"], region: "Mauritius", suffix: ".MU" },
  NI: { exchanges: ["BCN"], region: "Nicaragua", suffix: ".NI" },
  CR: { exchanges: ["BNV"], region: "Costa Rica", suffix: ".CR" },
  GT: { exchanges: ["BVN"], region: "Guatemala", suffix: ".GT" },
  EC: { exchanges: ["BVQ"], region: "Ecuador", suffix: ".EC" },
  UY: { exchanges: ["BVM"], region: "Uruguay", suffix: ".UY" },
  KZ: { exchanges: ["KASE"], region: "Kazakhstan", suffix: ".KZ" },
  UZ: { exchanges: ["TSE"], region: "Uzbekistan", suffix: ".UZ" },
  GE: { exchanges: ["GSE"], region: "Georgia", suffix: ".GE" },
  RS: { exchanges: ["BELEX"], region: "Serbia", suffix: ".RS" },
  BA: { exchanges: ["SASE"], region: "Bosnia", suffix: ".BA" },
};

interface StockItem {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  price?: number;
  change?: number;
  changePercent?: number;
  marketCap?: number;
  sector?: string;
  industry?: string;
}

const stockCache: Map<string, { data: StockItem[]; timestamp: number }> = new Map();
const CACHE_DURATION = 4 * 60 * 60 * 1000;

function getStockLimit(countryCode: string): number {
  return countryCode === "IN" || countryCode === "IN_BSE" ? 250 : 69;
}

async function enrichStocksWithSearchData(stocks: StockItem[]): Promise<StockItem[]> {
  if (stocks.length === 0) return stocks;
  const enriched = [...stocks];
  const maxEnrich = Math.min(stocks.length, 100);
  const batchSize = 15;

  for (let i = 0; i < maxEnrich; i += batchSize) {
    const endIdx = Math.min(i + batchSize, maxEnrich);
    const promises = [];
    for (let j = i; j < endIdx; j++) {
      const stock = enriched[j];
      const idx = j;
      promises.push(
        (async () => {
          try {
            const searchUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(stock.symbol)}&quotesCount=1&newsCount=0`;
            const resp = await fetch(searchUrl, {
              headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
            });
            if (resp.ok) {
              const data = await resp.json() as any;
              const quote = data?.quotes?.[0];
              if (quote && quote.symbol === stock.symbol) {
                if (quote.sector) enriched[idx].sector = quote.sector;
                if (quote.industry) enriched[idx].industry = quote.industry;
              }
            }
          } catch (e) {}
        })()
      );
    }
    await Promise.all(promises);
  }

  return enriched;
}

async function fetchStocksForCountry(countryCode: string): Promise<StockItem[]> {
  const cached = stockCache.get(countryCode);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  const exchangeInfo = COUNTRY_EXCHANGE_MAP[countryCode];
  if (!exchangeInfo) {
    return [];
  }

  try {
    const region = exchangeInfo.region;
    const url = `https://query2.finance.yahoo.com/v1/finance/screener?crumb=&formatted=false&lang=en-US&region=US`;

    const limit = getStockLimit(countryCode);
    const body = {
      size: limit,
      offset: 0,
      sortField: "intradaymarketcap",
      sortType: "DESC",
      quoteType: "EQUITY",
      query: {
        operator: "AND",
        operands: [
          { operator: "EQ", operands: ["region", region] }
        ]
      }
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      body: JSON.stringify(body)
    });

    if (response.ok) {
      const data = await response.json() as any;
      if (data?.finance?.result?.[0]?.quotes && data.finance.result[0].quotes.length >= 20) {
        let stocks: StockItem[] = data.finance.result[0].quotes.slice(0, limit).map((q: any) => ({
          symbol: q.symbol || "",
          name: q.shortName || q.longName || q.symbol || "",
          exchange: q.exchange || exchangeInfo.exchanges[0] || "",
          currency: q.currency || q.financialCurrency || "USD",
          price: q.regularMarketPrice || undefined,
          change: q.regularMarketChange || undefined,
          changePercent: q.regularMarketChangePercent || undefined,
          marketCap: q.marketCap || undefined,
          sector: q.sector || undefined,
          industry: q.industry || undefined,
        }));

        const needsEnrichment = stocks.some(s => !s.sector);
        if (needsEnrichment) {
          stocks = await enrichStocksWithSearchData(stocks);
        }

        stockCache.set(countryCode, { data: stocks, timestamp: Date.now() });
        return stocks;
      }
    }

    const suffix = exchangeInfo.suffix;
    const majorSymbols = getMajorStocksByCountry(countryCode, suffix);
    if (majorSymbols.length > 0) {
      const allStocks: StockItem[] = [];
      const fetchPromises = majorSymbols.map(async (symbol) => {
        try {
          const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
          const chartResponse = await fetch(chartUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
          });
          if (chartResponse.ok) {
            const chartData = await chartResponse.json() as any;
            const meta = chartData?.chart?.result?.[0]?.meta;
            if (meta) {
              const prevClose = meta.chartPreviousClose || meta.previousClose;
              const currentPrice = meta.regularMarketPrice;
              const change = currentPrice && prevClose ? currentPrice - prevClose : undefined;
              const changePct = change && prevClose ? (change / prevClose) * 100 : undefined;
              return {
                symbol: meta.symbol || symbol,
                name: meta.shortName || meta.longName || meta.symbol || symbol,
                exchange: meta.exchangeName || meta.exchange || "",
                currency: meta.currency || "USD",
                price: currentPrice || undefined,
                change: change || undefined,
                changePercent: changePct || undefined,
              } as StockItem;
            }
          }
        } catch (e) {}
        return null;
      });

      const batchSize = 15;
      for (let i = 0; i < fetchPromises.length; i += batchSize) {
        const batch = fetchPromises.slice(i, i + batchSize);
        const results = await Promise.all(batch);
        for (const s of results) {
          if (s) allStocks.push(s);
        }
      }

      if (allStocks.length > 0) {
        const sliced = allStocks.slice(0, limit);
        const result = await enrichStocksWithSearchData(sliced);
        stockCache.set(countryCode, { data: result, timestamp: Date.now() });
        return result;
      }
    }

    const searchUrl = `https://query2.finance.yahoo.com/v1/finance/lookup?formatted=true&lang=en-US&region=US&query=${encodeURIComponent(region)}&type=equity&count=${limit}&start=0&corsDomain=finance.yahoo.com`;

    const searchResponse = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });

    if (searchResponse.ok) {
      const searchData = await searchResponse.json() as any;
      if (searchData?.finance?.result?.[0]?.documents) {
        const stocks: StockItem[] = searchData.finance.result[0].documents.slice(0, limit).map((doc: any) => ({
          symbol: doc.symbol || "",
          name: doc.shortName || doc.longName || doc.symbol || "",
          exchange: doc.exchange || exchangeInfo.exchanges[0] || "",
          currency: "USD",
          price: undefined,
          change: undefined,
          changePercent: undefined,
        }));

        stockCache.set(countryCode, { data: stocks, timestamp: Date.now() });
        return stocks;
      }
    }

    return [];
  } catch (error) {
    console.error(`Error fetching stocks for ${countryCode}:`, error);
    return [];
  }
}

function getMajorStocksByCountry(countryCode: string, suffix: string): string[] {
  const majorStocks: Record<string, string[]> = {
    CN: ["600519.SS","601398.SS","601288.SS","601939.SS","600036.SS","601857.SS","600900.SS","601318.SS","600276.SS","601166.SS","600030.SS","601888.SS","300750.SZ","000858.SZ","000333.SZ","002415.SZ","000651.SZ","002594.SZ","000002.SZ","300059.SZ","601668.SS","600050.SS","601601.SS","600028.SS","601988.SS","600104.SS","600690.SS","601012.SS","600309.SS","601225.SS","300015.SZ","002304.SZ","000568.SZ","002352.SZ","300124.SZ","600585.SS","600809.SS","601899.SS","600406.SS","601633.SS","600887.SS","600048.SS","601328.SS","600016.SS","601006.SS","603259.SS","600019.SS","601138.SS","601111.SS","600031.SS","600436.SS","600588.SS","601688.SS","601390.SS","600196.SS","601169.SS","600999.SS","601360.SS","002714.SZ","000725.SZ","002049.SZ","000538.SZ","002475.SZ","300274.SZ","002142.SZ","000661.SZ","300760.SZ","002371.SZ","300122.SZ"],
    JP: ["7203.T","6758.T","8306.T","9984.T","6861.T","6902.T","8035.T","6501.T","7267.T","9432.T","9433.T","4502.T","4503.T","6367.T","6594.T","7974.T","6981.T","7751.T","4568.T","6954.T","3382.T","8316.T","8411.T","7741.T","4063.T","6273.T","6506.T","4452.T","2802.T","9020.T","9021.T","8766.T","4901.T","6326.T","4523.T","6752.T","7269.T","4507.T","8031.T","8058.T","2914.T","5108.T","6762.T","9613.T","4661.T","7733.T","1925.T","6988.T","3659.T","6645.T","4519.T","2413.T","6479.T","6503.T","7201.T","2502.T","4578.T","6301.T","9766.T","7011.T","4704.T","6702.T","8801.T","9022.T","5401.T","4543.T","6305.T","1878.T","2801.T"],
    KR: ["005930.KS","000660.KS","035420.KS","051910.KS","006400.KS","035720.KS","068270.KS","005380.KS","055550.KS","012330.KS","028260.KS","207940.KS","003550.KS","105560.KS","034730.KS","066570.KS","000270.KS","096770.KS","003670.KS","018260.KS","032830.KS","017670.KS","030200.KS","010130.KS","009150.KS","086790.KS","010950.KS","033780.KS","090430.KS","015760.KS","036570.KS","009540.KS","011170.KS","000810.KS","034020.KS","316140.KS","002790.KS","047050.KS","326030.KS","373220.KS","010140.KS","021240.KS","247540.KS","352820.KS","377300.KS","259960.KS","000720.KS","004020.KS","024110.KS","004170.KS","138930.KS","097950.KS","069960.KS","088350.KS","011200.KS","241560.KS","020150.KS","161390.KS","302440.KS","078930.KS","023530.KS","000880.KS","036460.KS","003410.KS","005490.KS","004990.KS","128940.KS","139480.KS","011780.KS"],
    GB: ["SHEL.L","AZN.L","HSBA.L","ULVR.L","BP.L","GSK.L","RIO.L","BATS.L","DGE.L","LLOY.L","BARC.L","REL.L","AAL.L","CRH.L","NWG.L","LSEG.L","AHT.L","ABF.L","RKT.L","WPP.L","VOD.L","NG.L","SSE.L","BNZL.L","IMB.L","BT-A.L","III.L","INF.L","GLEN.L","ANTO.L","MNDI.L","SGE.L","AVV.L","RR.L","EZJ.L","IAG.L","PSON.L","SVT.L","UU.L","SN.L","CPG.L","SGRO.L","BA.L","LAND.L","BLND.L","TSCO.L","SBRY.L","MKS.L","JD.L","SPX.L","AUTO.L","IHG.L","WTB.L","FERG.L","SMDS.L","EXPN.L","JMAT.L","HLMA.L","SMIN.L","RSW.L","HIK.L","DARK.L","BRBY.L","BME.L","ADM.L","STVG.L","TW.L","PSN.L","RTO.L"],
    DE: ["SAP.DE","SIE.DE","ALV.DE","DTE.DE","BAS.DE","MBG.DE","MUV2.DE","BMW.DE","IFX.DE","ADS.DE","DB1.DE","BAYN.DE","VOW3.DE","HEN3.DE","SHL.DE","FRE.DE","RWE.DE","EON.DE","HEI.DE","MTX.DE","BEI.DE","QIA.DE","MRK.DE","PUM.DE","FME.DE","CON.DE","DBK.DE","CBK.DE","1COV.DE","ZAL.DE","LEG.DE","AIR.DE","VNA.DE","HFG.DE","SRT.DE","SY1.DE","ENR.DE","G24.DE","RHM.DE","DHER.DE","TKA.DE","LHA.DE","SZG.DE","BNR.DE","BOSS.DE","WCH.DE","DPW.DE","EVK.DE","GXI.DE","SHA.DE","LIN.DE","KGX.DE","PAH3.DE","P911.DE","DTG.DE","NDA.DE","AFX.DE","RAA.DE","TLX.DE","DEQ.DE","HAB.DE","OSR.DE","TEG.DE","WAF.DE","HLE.DE","KWS.DE","GFT.DE","NEM.DE","AT1.DE"],
    FR: ["MC.PA","OR.PA","TTE.PA","SAN.PA","AI.PA","SU.PA","BNP.PA","AIR.PA","CS.PA","RI.PA","KER.PA","DG.PA","CAP.PA","BN.PA","SGO.PA","SAF.PA","DSY.PA","HO.PA","GLE.PA","ACA.PA","EN.PA","WLN.PA","STLAP.PA","RMS.PA","ORA.PA","CA.PA","VIV.PA","LR.PA","ML.PA","PUB.PA","ENGI.PA","ERF.PA","VIE.PA","RNO.PA","ATO.PA","UBI.PA","FP.PA","TEP.PA","SW.PA","EL.PA","NK.PA","AM.PA","STM.PA","CNP.PA","UMG.PA","ILD.PA","SO.PA","RCO.PA","AKE.PA","GTT.PA","ALD.PA","BVI.PA","RAL.PA","EDEN.PA","RF.PA","QDT.PA","IPS.PA","DBG.PA","ELIOR.PA","GLO.PA","DIM.PA","MTG.PA","MF.PA","SMG.PA","MMT.PA","VCT.PA","BON.PA","SOP.PA","LPE.PA"],
    IN: ["RELIANCE.NS","TCS.NS","HDFCBANK.NS","INFY.NS","ICICIBANK.NS","HINDUNILVR.NS","BHARTIARTL.NS","SBIN.NS","BAJFINANCE.NS","LT.NS","ITC.NS","KOTAKBANK.NS","AXISBANK.NS","ASIANPAINT.NS","MARUTI.NS","HCLTECH.NS","SUNPHARMA.NS","TITAN.NS","TATAMOTORS.NS","WIPRO.NS","ULTRACEMCO.NS","NTPC.NS","NESTLEIND.NS","ONGC.NS","TECHM.NS","POWERGRID.NS","ADANIENT.NS","DRREDDY.NS","INDUSINDBK.NS","DIVISLAB.NS","COALINDIA.NS","BAJAJFINSV.NS","CIPLA.NS","HINDALCO.NS","GRASIM.NS","TATASTEEL.NS","EICHERMOT.NS","BRITANNIA.NS","JSWSTEEL.NS","SHREECEM.NS","ADANIPORTS.NS","HEROMOTOCO.NS","BPCL.NS","UPL.NS","APOLLOHOSP.NS","TATACONSUM.NS","SBILIFE.NS","BAJAJ-AUTO.NS","HDFCLIFE.NS","GODREJCP.NS","PIDILITIND.NS","DABUR.NS","SIEMENS.NS","BERGEPAINT.NS","AMBUJACEM.NS","HAVELLS.NS","DLF.NS","ACC.NS","MCDOWELL-N.NS","BIOCON.NS","TORNTPHARM.NS","MUTHOOTFIN.NS","BANDHANBNK.NS","VOLTAS.NS","AUROPHARMA.NS","LUPIN.NS","IDFCFIRSTB.NS","COLPAL.NS","MARICO.NS","TRENT.NS","ZOMATO.NS","JIOFIN.NS","IRFC.NS","HAL.NS","ADANIGREEN.NS","ADANIPOWER.NS","IOC.NS","PFC.NS","RECLTD.NS","BANKBARODA.NS","CANBK.NS","TVSMOTOR.NS","VEDL.NS","CHOLAFIN.NS","SHRIRAMFIN.NS","JINDALSTEL.NS","PNB.NS","NAUKRI.NS","PERSISTENT.NS","COFORGE.NS","LTTS.NS","MPHASIS.NS","PAGEIND.NS","TATAPOWER.NS","IRCTC.NS","POLYCAB.NS","SBICARD.NS","ABCAPITAL.NS","MOTHERSON.NS","BOSCHLTD.NS","INDIGO.NS","PIIND.NS","BHEL.NS","GAIL.NS","SAIL.NS","NMDC.NS","NHPC.NS","SJVN.NS","PEL.NS","CUMMINSIND.NS","GODREJPROP.NS","PRESTIGE.NS","OBEROIRLTY.NS","PHOENIXLTD.NS","MAXHEALTH.NS","FORTIS.NS","LALPATHLAB.NS","METROPOLIS.NS","STARHEALTH.NS","ICICIPRULI.NS","ICICIGI.NS","NIACL.NS","GICRE.NS","M&MFIN.NS","MFSL.NS","CANFINHOME.NS","AARTIIND.NS","DEEPAKNTR.NS","SYNGENE.NS","ALKEM.NS","IPCALAB.NS","LAURUSLABS.NS","GLENMARK.NS","AJANTPHARM.NS","ATUL.NS","NAVINFLUOR.NS","SUMICHEM.NS","ASTRAL.NS","SUPREMEIND.NS","RELAXO.NS","BATAINDIA.NS","VBL.NS","RADICO.NS","UBL.NS","CROMPTON.NS","WHIRLPOOL.NS","BLUESTARLT.NS","KPRMILL.NS","RAYMOND.NS","APLAPOLLO.NS","RATNAMANI.NS","KAJARIACER.NS","CENTURYTEX.NS","JKCEMENT.NS","RAMCOCEM.NS","DALBHARAT.NS","BHARATFORG.NS","SUNTV.NS","PVRINOX.NS","ZEEL.NS","NETWORK18.NS","HATHWAY.NS","TV18BRDCST.NS","CONCOR.NS","EXIDEIND.NS","AMARAJABAT.NS","CLEAN.NS","KPITTECH.NS","LTIM.NS","ZYDUSLIFE.NS","MANAPPURAM.NS","FEDERALBNK.NS","RBLBANK.NS","IDFC.NS","AUBANK.NS","JUBLFOOD.NS","DEVYANI.NS","SAPPHIRE.NS","DMART.NS","TATAELXSI.NS","DIXON.NS","HONAUT.NS","ABB.NS","CGPOWER.NS","BEL.NS","COCHINSHIP.NS","GRINDWELL.NS","SCHAEFFLER.NS","SKFINDIA.NS","TIMKEN.NS","CRISIL.NS","ICRA.NS","CARERATING.NS","MCX.NS","BSE.NS","CDSL.NS","IEX.NS","NYKAA.NS","PAYTM.NS","POLICYBZR.NS","CARTRADE.NS","HAPPSTMNDS.NS","ROUTE.NS","CAMPUS.NS","MEDANTA.NS","RAINBOW.NS","KAYNES.NS","ELGIEQUIP.NS","THERMAX.NS","SPARC.NS","NATIONALUM.NS","HINDZINC.NS","MOIL.NS","HUDCO.NS","RVNL.NS","NBCC.NS","NCC.NS","JKPAPER.NS","TRIDENT.NS","GMRINFRA.NS","ADANIENSOL.NS","ATGL.NS","AWL.NS"],
    IN_BSE: ["RELIANCE.BO","TCS.BO","HDFCBANK.BO","INFY.BO","ICICIBANK.BO","HINDUNILVR.BO","BHARTIARTL.BO","SBIN.BO","BAJFINANCE.BO","LT.BO","ITC.BO","KOTAKBANK.BO","AXISBANK.BO","ASIANPAINT.BO","MARUTI.BO","HCLTECH.BO","SUNPHARMA.BO","TITAN.BO","TATAMOTORS.BO","WIPRO.BO","ULTRACEMCO.BO","NTPC.BO","NESTLEIND.BO","ONGC.BO","TECHM.BO","POWERGRID.BO","ADANIENT.BO","DRREDDY.BO","INDUSINDBK.BO","DIVISLAB.BO","COALINDIA.BO","BAJAJFINSV.BO","CIPLA.BO","HINDALCO.BO","GRASIM.BO","TATASTEEL.BO","EICHERMOT.BO","BRITANNIA.BO","JSWSTEEL.BO","SHREECEM.BO","ADANIPORTS.BO","HEROMOTOCO.BO","BPCL.BO","UPL.BO","APOLLOHOSP.BO","TATACONSUM.BO","SBILIFE.BO","BAJAJ-AUTO.BO","HDFCLIFE.BO","GODREJCP.BO","PIDILITIND.BO","DABUR.BO","SIEMENS.BO","BERGEPAINT.BO","AMBUJACEM.BO","HAVELLS.BO","DLF.BO","ACC.BO","MCDOWELL-N.BO","BIOCON.BO","TORNTPHARM.BO","MUTHOOTFIN.BO","BANDHANBNK.BO","VOLTAS.BO","AUROPHARMA.BO","LUPIN.BO","IDFCFIRSTB.BO","COLPAL.BO","MARICO.BO","TRENT.BO","ZOMATO.BO","JIOFIN.BO","IRFC.BO","HAL.BO","ADANIGREEN.BO","ADANIPOWER.BO","IOC.BO","PFC.BO","RECLTD.BO","BANKBARODA.BO","CANBK.BO","TVSMOTOR.BO","VEDL.BO","CHOLAFIN.BO","SHRIRAMFIN.BO","JINDALSTEL.BO","PNB.BO","NAUKRI.BO","PERSISTENT.BO","COFORGE.BO","LTTS.BO","MPHASIS.BO","PAGEIND.BO","TATAPOWER.BO","IRCTC.BO","POLYCAB.BO","SBICARD.BO","ABCAPITAL.BO","MOTHERSON.BO","BOSCHLTD.BO","INDIGO.BO","PIIND.BO","BHEL.BO","GAIL.BO","SAIL.BO","NMDC.BO","NHPC.BO","SJVN.BO","PEL.BO","CUMMINSIND.BO","GODREJPROP.BO","PRESTIGE.BO","OBEROIRLTY.BO","PHOENIXLTD.BO","MAXHEALTH.BO","FORTIS.BO","LALPATHLAB.BO","METROPOLIS.BO","STARHEALTH.BO","ICICIPRULI.BO","ICICIGI.BO","NIACL.BO","GICRE.BO","M&MFIN.BO","MFSL.BO","CANFINHOME.BO","AARTIIND.BO","DEEPAKNTR.BO","SYNGENE.BO","ALKEM.BO","IPCALAB.BO","LAURUSLABS.BO","GLENMARK.BO","AJANTPHARM.BO","ATUL.BO","NAVINFLUOR.BO","SUMICHEM.BO","ASTRAL.BO","SUPREMEIND.BO","RELAXO.BO","BATAINDIA.BO","VBL.BO","RADICO.BO","UBL.BO","CROMPTON.BO","WHIRLPOOL.BO","BLUESTARLT.BO","KPRMILL.BO","RAYMOND.BO","APLAPOLLO.BO","RATNAMANI.BO","KAJARIACER.BO","CENTURYTEX.BO","JKCEMENT.BO","RAMCOCEM.BO","DALBHARAT.BO","BHARATFORG.BO","SUNTV.BO","PVRINOX.BO","ZEEL.BO","NETWORK18.BO","HATHWAY.BO","TV18BRDCST.BO","CONCOR.BO","EXIDEIND.BO","AMARAJABAT.BO","CLEAN.BO","KPITTECH.BO","LTIM.BO","ZYDUSLIFE.BO","MANAPPURAM.BO","FEDERALBNK.BO","RBLBANK.BO","IDFC.BO","AUBANK.BO","JUBLFOOD.BO","DEVYANI.BO","SAPPHIRE.BO","DMART.BO","TATAELXSI.BO","DIXON.BO","HONAUT.BO","ABB.BO","CGPOWER.BO","BEL.BO","COCHINSHIP.BO","GRINDWELL.BO","SCHAEFFLER.BO","SKFINDIA.BO","TIMKEN.BO","CRISIL.BO","ICRA.BO","CARERATING.BO","MCX.BO","BSE.BO","CDSL.BO","IEX.BO","NYKAA.BO","PAYTM.BO","POLICYBZR.BO","CARTRADE.BO","HAPPSTMNDS.BO","ROUTE.BO","CAMPUS.BO","MEDANTA.BO","RAINBOW.BO","KAYNES.BO","ELGIEQUIP.BO","THERMAX.BO","SPARC.BO","NATIONALUM.BO","HINDZINC.BO","MOIL.BO","HUDCO.BO","RVNL.BO","NBCC.BO","NCC.BO","JKPAPER.BO","TRIDENT.BO","GMRINFRA.BO","ADANIENSOL.BO","ATGL.BO","AWL.BO"],
    AU: ["BHP.AX","CBA.AX","CSL.AX","NAB.AX","WBC.AX","ANZ.AX","FMG.AX","WES.AX","MQG.AX","WOW.AX","TLS.AX","RIO.AX","TCL.AX","GMG.AX","WDS.AX","ALL.AX","COL.AX","STO.AX","QBE.AX","SUN.AX","SOL.AX","NCM.AX","IAG.AX","REA.AX","AMC.AX","ORG.AX","TWE.AX","FPH.AX","MPL.AX","RHC.AX","MIN.AX","CPU.AX","JBH.AX","APA.AX","NST.AX","S32.AX","EVN.AX","BXB.AX","AGL.AX","TAH.AX","ALU.AX","PMV.AX","IGO.AX","SGP.AX","VCX.AX","DXS.AX","LLC.AX","ILU.AX","GPT.AX","AWC.AX","ORA.AX","OZL.AX","LYC.AX","WHC.AX","NHF.AX","MFG.AX","NEC.AX","CGC.AX","AST.AX","SDF.AX","ALX.AX","ALD.AX","ANN.AX","SEK.AX","PDL.AX","BEN.AX","BOQ.AX","BSL.AX","DRR.AX"],
    CA: ["RY.TO","TD.TO","BNS.TO","BMO.TO","ENB.TO","CNR.TO","CP.TO","BCE.TO","MFC.TO","SLF.TO","TRI.TO","ATD.TO","CSU.TO","SU.TO","CNQ.TO","NTR.TO","ABX.TO","T.TO","FTS.TO","GIB-A.TO","WCN.TO","IFC.TO","QSR.TO","TRP.TO","H.TO","SHOP.TO","RBA.TO","IMO.TO","POW.TO","EMA.TO","FFH.TO","DOL.TO","L.TO","CTC-A.TO","WN.TO","GWO.TO","IAG.TO","SAP.TO","AEM.TO","FNV.TO","WPM.TO","AGI.TO","K.TO","CCO.TO","TIH.TO","CU.TO","MG.TO","STN.TO","BAM.TO","BIP-UN.TO","TFII.TO","EFN.TO","GFL.TO","CCL-B.TO","DSG.TO","LSPD.TO","KXS.TO","OTEX.TO","DCBO.TO","REAL.TO","WFCG.TO","TOY.TO","BYD.TO","MTY.TO","LNR.TO","PBH.TO","AIF.TO","FSV.TO","CGI.TO"],
    BR: ["PETR4.SA","VALE3.SA","ITUB4.SA","BBDC4.SA","BBAS3.SA","ABEV3.SA","WEGE3.SA","RENT3.SA","SUZB3.SA","JBSS3.SA","RADL3.SA","GGBR4.SA","RAIL3.SA","CSNA3.SA","LREN3.SA","MGLU3.SA","CIEL3.SA","PRIO3.SA","VBBR3.SA","TOTS3.SA","EMBR3.SA","EQTL3.SA","HAPV3.SA","ENEV3.SA","COGN3.SA","YDUQ3.SA","VIIA3.SA","NTCO3.SA","MULT3.SA","FLRY3.SA","KLBN11.SA","BRFS3.SA","MRFG3.SA","CVCB3.SA","CCRO3.SA","SBSP3.SA","CMIG4.SA","ELET3.SA","CPLE6.SA","TAEE11.SA","SAPR4.SA","VIVT3.SA","TIMS3.SA","ALPA4.SA","PCAR3.SA","GOAU4.SA","USIM5.SA","BPAC11.SA","SANB11.SA","BEEF3.SA","QUAL3.SA","LWSA3.SA","PETZ3.SA","MRVE3.SA","EVEN3.SA","CYRE3.SA","DXCO3.SA","ANIM3.SA","ASAI3.SA","CRFB3.SA","IGTI11.SA","HYPE3.SA","RDOR3.SA","SOMA3.SA","TEND3.SA","MOVI3.SA","VAMO3.SA","POSI3.SA","CASH3.SA"],
    MX: ["AMXB.MX","FEMSAUBD.MX","WALMEX.MX","GFNORTEO.MX","CEMEXCPO.MX","TLEVISACPO.MX","BIMBOA.MX","GMEXICOB.MX","GAPB.MX","ASURB.MX","OMAB.MX","GRUMAB.MX","KIMBERA.MX","PINFRA.MX","ALSEA.MX","LABB.MX","GCC.MX","GCARSOA1.MX","GENTERA.MX","PE-AND-OLES.MX","MEGACPO.MX","CABORJON.MX","GFBANOQ.MX","ORBIA.MX","ELEKTRA.MX","RCENTROA.MX","BOLSAA.MX","ALPEKA.MX","IENOVA.MX","NEMAKA.MX","VESTA.MX","LIVEPOL.MX","CUERVO.MX","TMMA.MX","LACOMERCI.MX","SIMECB.MX","TRAXIONA.MX","FIBRAPL.MX","DANHOS.MX","TERRA.MX","FUNO11.MX","PAPPEL.MX","GISSAA.MX","POSADASA.MX","ACCELSA.MX","BACHOCOB.MX","SORIANAB.MX","ICHB.MX","CONVERA.MX","CMOCTEZ.MX","RA.MX","ARA.MX","GMDELO.MX","SITES1A.MX","CADUA.MX","AUTLANA.MX","BEVIDESA.MX","CYDSA.MX","COLLADO.MX","CERAMICA.MX","FINAMEXO.MX","FRAGUA.MX","GMDA.MX","HERDEZ.MX","MEDICAB.MX","MINERA.MX","MFRISCOA.MX","SPORTS.MX","VALUEGF.MX"],
    HK: ["0700.HK","9988.HK","1299.HK","0005.HK","0941.HK","2318.HK","0388.HK","2628.HK","0883.HK","0011.HK","0016.HK","0001.HK","0027.HK","0003.HK","1038.HK","0002.HK","0006.HK","0012.HK","0017.HK","0066.HK","0823.HK","0688.HK","0857.HK","1928.HK","0175.HK","0267.HK","0386.HK","0762.HK","0960.HK","1109.HK","1211.HK","1398.HK","1810.HK","2007.HK","2020.HK","2269.HK","2313.HK","2382.HK","2388.HK","2688.HK","3328.HK","3690.HK","3968.HK","3988.HK","6098.HK","6862.HK","9618.HK","9888.HK","9999.HK","0019.HK","0023.HK","0083.HK","0101.HK","0144.HK","0151.HK","0168.HK","0241.HK","0291.HK","0316.HK","0322.HK","0330.HK","0669.HK","0836.HK","0868.HK","0914.HK","1044.HK","1088.HK","1113.HK","1177.HK"],
    SG: ["D05.SI","O39.SI","U11.SI","Z74.SI","C6L.SI","C38U.SI","A17U.SI","BN4.SI","Y92.SI","G13.SI","S68.SI","N2IU.SI","C09.SI","BS6.SI","AJBU.SI","V03.SI","H78.SI","U96.SI","S63.SI","C52.SI","F34.SI","M44U.SI","CC3.SI","ME8U.SI","S58.SI","U14.SI","E5H.SI","C07.SI","J36.SI","D01.SI","S51.SI","BUOU.SI","T39.SI","U10.SI","P40U.SI","K71U.SI","J69U.SI","Z25.SI","CJLU.SI","SK6U.SI","HMN.SI","TQ5.SI","S56.SI","AWX.SI","AGS.SI","BVA.SI","5CP.SI","E28.SI","EB5.SI","G07.SI","H02.SI","OV8.SI","S07.SI","S41.SI","T8JU.SI","UD1U.SI","BHK.SI","BTJ.SI","CLN.SI","CY6U.SI","D8DU.SI","HKB.SI","J91U.SI","LJ3.SI","M1GU.SI","N4E.SI","O5RU.SI","P15.SI","RE4.SI"],
    TW: ["2330.TW","2317.TW","2454.TW","2308.TW","2303.TW","2882.TW","2881.TW","3711.TW","2886.TW","2891.TW","3008.TW","2884.TW","2412.TW","1303.TW","1301.TW","2002.TW","2892.TW","1326.TW","2207.TW","3034.TW","5880.TW","2382.TW","2880.TW","5871.TW","2395.TW","1216.TW","3045.TW","2357.TW","2885.TW","6505.TW","4938.TW","2301.TW","3037.TW","2912.TW","9904.TW","6415.TW","2327.TW","2474.TW","3231.TW","2345.TW","4904.TW","2379.TW","2603.TW","3481.TW","5876.TW","1101.TW","2105.TW","1102.TW","2801.TW","3023.TW","8046.TW","6669.TW","2408.TW","3682.TW","2356.TW","6488.TW","3443.TW","2409.TW","4966.TW","6239.TW","2377.TW","2344.TW","3017.TW","5347.TW","2049.TW","2376.TW","3661.TW","3529.TW","6452.TW"],
    CH: ["NESN.SW","ROG.SW","NOVN.SW","UBSG.SW","ZURN.SW","ABBN.SW","CSGN.SW","SREN.SW","LONN.SW","GIVN.SW","CFR.SW","SGSN.SW","GEBN.SW","PGHN.SW","SCMN.SW","SLHN.SW","STMN.SW","BALN.SW","BARN.SW","TEMN.SW","VACN.SW","SIKA.SW","SOON.SW","LOGN.SW","GALN.SW","HOLN.SW","LISN.SW","BANB.SW","BEKN.SW","BUCN.SW","CLN.SW","CSGN.SW","DKSH.SW","EMMN.SW","FHZN.SW","FORN.SW","GALE.SW","HELN.SW","HUBN.SW","INRN.SW","KNIN.SW","KURM.SW","LISP.SW","MOBN.SW","OERL.SW","PEHN.SW","PGHN.SW","PLAN.SW","SANN.SW","SCHN.SW","SENS.SW","SFZN.SW","SIGN.SW","SPSN.SW","SREN.SW","TECN.SW","TIBN.SW","TKBP.SW","UBXN.SW","VATN.SW","VIFN.SW","VONN.SW","WARN.SW","WIHN.SW","ZUGN.SW","ZEHN.SW","ZURN.SW","ARYN.SW","BCVN.SW"],
    NL: ["ASML.AS","UNA.AS","PHIA.AS","INGA.AS","ABN.AS","HEIA.AS","DSM.AS","WKL.AS","AKZA.AS","RAND.AS","KPN.AS","AD.AS","NN.AS","SBMO.AS","AGN.AS","ASM.AS","BESI.AS","TKWY.AS","PRX.AS","IMCD.AS","URW.AS","AALB.AS","JDEP.AS","LIGHT.AS","GLPG.AS","PHARM.AS","VPK.AS","BFIT.AS","MT.AS","CRBN.AS","CTPNV.AS","FUR.AS","HEIJM.AS","NSI.AS","ECMPA.AS","ALFEN.AS","APAM.AS","ARCAD.AS","AVTX.AS","BAMNB.AS","CMCOM.AS","CORRE.AS","DSM.AS","FLOW.AS","FORFA.AS","HYDRA.AS","KENDR.AS","NEDAP.AS","OCI.AS","ORDI.AS","PHIA.AS","POST.AS","SIFG.AS","SLIGR.AS","TKH.AS","VASTN.AS","VOLMA.AS","ACOMO.AS","WHA.AS","AJAX.AS","AMG.AS","BASIC.AS","BRNL.AS","CABKA.AS","CORD.AS","DICO.AS","ENVIP.AS","FAST.AS","FCAU.AS"],
    ZA: ["NPN.JO","BIL.JO","CFR.JO","FSR.JO","SOL.JO","AGL.JO","SBK.JO","NED.JO","AMS.JO","MTN.JO","ABG.JO","SHP.JO","VOD.JO","BHP.JO","ANG.JO","GFI.JO","EXX.JO","DSY.JO","NPH.JO","REM.JO","INP.JO","RNI.JO","OMU.JO","MRP.JO","SLM.JO","PIK.JO","WHL.JO","TFG.JO","CPI.JO","RDF.JO","GRT.JO","HAR.JO","LBH.JO","TBS.JO","BAT.JO","APN.JO","IPL.JO","SSW.JO","CLH.JO","AFE.JO","KAP.JO","PPH.JO","DGH.JO","S32.JO","DRD.JO","TRU.JO","KIO.JO","IMP.JO","SPP.JO","GLN.JO","OCE.JO","JSE.JO","CLS.JO","ARI.JO","RBP.JO","EMI.JO","MCG.JO","MND.JO","PSG.JO","RLO.JO","SNH.JO","SUI.JO","SYG.JO","TSG.JO","WBO.JO","ACL.JO","ADH.JO","AFT.JO","AIP.JO"],
    SA: ["2222.SR","1180.SR","2010.SR","1010.SR","2350.SR","1120.SR","2020.SR","1150.SR","2380.SR","1050.SR","2110.SR","3010.SR","1030.SR","1020.SR","7010.SR","2280.SR","2310.SR","2250.SR","2060.SR","4001.SR","4002.SR","4003.SR","4005.SR","4007.SR","4009.SR","4010.SR","4011.SR","4012.SR","4013.SR","4014.SR","4015.SR","4020.SR","4030.SR","4040.SR","4050.SR","4051.SR","4061.SR","4070.SR","4080.SR","4081.SR","4100.SR","4110.SR","4130.SR","4140.SR","4150.SR","4160.SR","4170.SR","4180.SR","4190.SR","4200.SR","4210.SR","4220.SR","4230.SR","4240.SR","4250.SR","4260.SR","4261.SR","4262.SR","4270.SR","4280.SR","4290.SR","4291.SR","4292.SR","4300.SR","4310.SR","4320.SR","4321.SR","4322.SR","4330.SR"],
    TH: ["PTT.BK","AOT.BK","CPALL.BK","SCC.BK","BDMS.BK","ADVANC.BK","SCB.BK","KBANK.BK","BBL.BK","PTTGC.BK","MINT.BK","CPF.BK","TRUE.BK","BEM.BK","GULF.BK","BH.BK","DELTA.BK","GPSC.BK","IVL.BK","IRPC.BK","KCE.BK","KTB.BK","MAJOR.BK","OSP.BK","RATCH.BK","SAWAD.BK","SCGP.BK","TISCO.BK","TMB.BK","TOP.BK","TTB.BK","TU.BK","WHA.BK","BCP.BK","BGC.BK","BJC.BK","CK.BK","COM7.BK","EA.BK","EGCO.BK","EP.BK","ESSO.BK","GFPT.BK","GLOBAL.BK","HMPRO.BK","INTUCH.BK","JAS.BK","JMT.BK","KKP.BK","LHFG.BK","LH.BK","MTC.BK","OR.BK","PLANB.BK","PR9.BK","PTTEP.BK","QH.BK","RS.BK","SINGER.BK","SIRI.BK","SPALI.BK","STEC.BK","SUPER.BK","TCAP.BK","THANI.BK","TPIPP.BK","TVO.BK","VGI.BK","CBG.BK"],
    TR: ["THYAO.IS","ASELS.IS","BIMAS.IS","SASA.IS","KCHOL.IS","FROTO.IS","TUPRS.IS","EREGL.IS","GARAN.IS","AKBNK.IS","ISCTR.IS","SAHOL.IS","TOASO.IS","HALKB.IS","VAKBN.IS","PETKM.IS","SISE.IS","TCELL.IS","TKFEN.IS","ARCLK.IS","KOZAL.IS","EKGYO.IS","KRDMD.IS","MGROS.IS","OTKAR.IS","PGSUS.IS","SOKM.IS","VESTL.IS","AEFES.IS","ALARK.IS","ALBRK.IS","AYGAZ.IS","BAGFS.IS","BJKAS.IS","BRISA.IS","BUCIM.IS","CCOLA.IS","CEMAS.IS","CIMSA.IS","DEVA.IS","DOHOL.IS","ECILC.IS","ENKAI.IS","GENIL.IS","GLYHO.IS","GOLTS.IS","GUBRF.IS","HEKTS.IS","ISGYO.IS","KAREL.IS","KLMSN.IS","KONTR.IS","LOGO.IS","MAVI.IS","NETAS.IS","OYAKC.IS","PARSN.IS","QUAGR.IS","SARKY.IS","SELEC.IS","SKBNK.IS","SODA.IS","TATGD.IS","TAVHL.IS","TMSN.IS","TRGYO.IS","TTRAK.IS","ULKER.IS","YKBNK.IS"],
    IL: ["TEVA.TA","NICE.TA","LUMI.TA","CHKP.TA","ICL.TA","BEZQ.TA","ESLT.TA","AZRG.TA","POLI.TA","ORL.TA","HARL.TA","MZTF.TA","DSCT.TA","FIBI.TA","MNRT.TA","BRMG.TA","DLEKG.TA","ALHE.TA","ARPT.TA","AVGL.TA","BCOM.TA","CDEV.TA","CEL.TA","DANEL.TA","DIMRI.TA","EDRN.TA","ELAL.TA","ELCO.TA","ELTR.TA","ENLT.TA","FTAL.TA","GLTC.TA","HAMAT.TA","IBI.TA","ILDC.TA","INBR.TA","ISCD.TA","ITRN.TA","KARE.TA","KRNT.TA","LAHAV.TA","LODZ.TA","MISH.TA","MLSR.TA","MTRX.TA","NAWI.TA","NXTG.TA","OPC.TA","ORAD.TA","ORMP.TA","PLCR.TA","RLCO.TA","ROBO.TA","SAPN.TA","SFET.TA","SHPG.TA","SKLN.TA","SPNS.TA","STRS.TA","TIGBR.TA","TSEM.TA","UNIT.TA","UNIKN.TA","VILR.TA","WLFD.TA","YAAK.TA","AMOT.TA","AMAN.TA","AURA.TA"],
  };
  return majorStocks[countryCode] || [];
}

const MARKET_HOURS: Record<string, { open: number; close: number; tz: string }> = {
  US: { open: 9.5, close: 16, tz: "America/New_York" },
  IN: { open: 9.25, close: 15.5, tz: "Asia/Kolkata" },
  CN: { open: 9.5, close: 15, tz: "Asia/Shanghai" },
  JP: { open: 9, close: 15, tz: "Asia/Tokyo" },
  KR: { open: 9, close: 15.3, tz: "Asia/Seoul" },
  GB: { open: 8, close: 16.5, tz: "Europe/London" },
  DE: { open: 9, close: 17.5, tz: "Europe/Berlin" },
  FR: { open: 9, close: 17.5, tz: "Europe/Paris" },
  HK: { open: 9.5, close: 16, tz: "Asia/Hong_Kong" },
  AU: { open: 10, close: 16, tz: "Australia/Sydney" },
  CA: { open: 9.5, close: 16, tz: "America/Toronto" },
  BR: { open: 10, close: 17, tz: "America/Sao_Paulo" },
  SG: { open: 9, close: 17, tz: "Asia/Singapore" },
  TW: { open: 9, close: 13.5, tz: "Asia/Taipei" },
  CH: { open: 9, close: 17.5, tz: "Europe/Zurich" },
  NL: { open: 9, close: 17.5, tz: "Europe/Amsterdam" },
  ZA: { open: 9, close: 17, tz: "Africa/Johannesburg" },
  SA: { open: 10, close: 15, tz: "Asia/Riyadh" },
  TH: { open: 10, close: 16.5, tz: "Asia/Bangkok" },
  TR: { open: 10, close: 18, tz: "Europe/Istanbul" },
  IL: { open: 9.75, close: 17.25, tz: "Asia/Jerusalem" },
  MX: { open: 8.5, close: 15, tz: "America/Mexico_City" },
  ID: { open: 9, close: 16, tz: "Asia/Jakarta" },
  MY: { open: 9, close: 17, tz: "Asia/Kuala_Lumpur" },
  PH: { open: 9.5, close: 15.5, tz: "Asia/Manila" },
  PK: { open: 9.5, close: 15.5, tz: "Asia/Karachi" },
  VN: { open: 9, close: 15, tz: "Asia/Ho_Chi_Minh" },
  IT: { open: 9, close: 17.5, tz: "Europe/Rome" },
  ES: { open: 9, close: 17.5, tz: "Europe/Madrid" },
  SE: { open: 9, close: 17.5, tz: "Europe/Stockholm" },
  NO: { open: 9, close: 16.2, tz: "Europe/Oslo" },
  DK: { open: 9, close: 17, tz: "Europe/Copenhagen" },
  FI: { open: 10, close: 18.5, tz: "Europe/Helsinki" },
  PL: { open: 9, close: 17, tz: "Europe/Warsaw" },
  GR: { open: 10, close: 17.2, tz: "Europe/Athens" },
  EG: { open: 10, close: 14.5, tz: "Africa/Cairo" },
  NG: { open: 10, close: 14.5, tz: "Africa/Lagos" },
  KE: { open: 9.5, close: 15, tz: "Africa/Nairobi" },
  AR: { open: 11, close: 17, tz: "America/Argentina/Buenos_Aires" },
  CL: { open: 9.5, close: 16, tz: "America/Santiago" },
  CO: { open: 9.5, close: 16, tz: "America/Bogota" },
  PE: { open: 9, close: 16, tz: "America/Lima" },
  NZ: { open: 10, close: 16.45, tz: "Pacific/Auckland" },
  AE: { open: 10, close: 14, tz: "Asia/Dubai" },
  QA: { open: 9.5, close: 13, tz: "Asia/Qatar" },
  KW: { open: 9, close: 12.5, tz: "Asia/Kuwait" },
  RU: { open: 10, close: 18.5, tz: "Europe/Moscow" },
};

function getMarketStatus(countryCode: string): { isOpen: boolean; label: string } {
  const hours = MARKET_HOURS[countryCode];
  if (!hours) return { isOpen: false, label: "Unknown" };

  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: hours.tz,
      hour: "numeric",
      minute: "numeric",
      hour12: false,
      weekday: "short",
    });
    const parts = formatter.formatToParts(now);
    const weekday = parts.find(p => p.type === "weekday")?.value || "";
    const hourStr = parts.find(p => p.type === "hour")?.value || "0";
    const minuteStr = parts.find(p => p.type === "minute")?.value || "0";
    const currentHour = parseInt(hourStr) + parseInt(minuteStr) / 60;

    if (weekday === "Sat" || weekday === "Sun") {
      return { isOpen: false, label: "Closed (Weekend)" };
    }

    if (currentHour >= hours.open && currentHour < hours.close) {
      return { isOpen: true, label: "Market Open" };
    }

    return { isOpen: false, label: "Market Closed" };
  } catch {
    return { isOpen: false, label: "Unknown" };
  }
}

// ─── Futures Data ───────────────────────────────────────────────────────────

const WORLD_INDICES = [
  { symbol: "^GSPC",    name: "S&P 500",            region: "United States", flag: "🇺🇸", openTime: "9:30 AM – 4:00 PM ET",  tz: "America/New_York",  currency: "USD" },
  { symbol: "^DJI",     name: "Dow Jones",           region: "United States", flag: "🇺🇸", openTime: "9:30 AM – 4:00 PM ET",  tz: "America/New_York",  currency: "USD" },
  { symbol: "^IXIC",    name: "NASDAQ Composite",    region: "United States", flag: "🇺🇸", openTime: "9:30 AM – 4:00 PM ET",  tz: "America/New_York",  currency: "USD" },
  { symbol: "^RUT",     name: "Russell 2000",        region: "United States", flag: "🇺🇸", openTime: "9:30 AM – 4:00 PM ET",  tz: "America/New_York",  currency: "USD" },
  { symbol: "^VIX",     name: "CBOE VIX",            region: "United States", flag: "🇺🇸", openTime: "9:30 AM – 4:15 PM ET",  tz: "America/New_York",  currency: "USD" },
  { symbol: "^FTSE",    name: "FTSE 100",            region: "United Kingdom",flag: "🇬🇧", openTime: "8:00 AM – 4:30 PM GMT", tz: "Europe/London",     currency: "GBP" },
  { symbol: "^GDAXI",   name: "DAX 40",              region: "Germany",       flag: "🇩🇪", openTime: "9:00 AM – 5:30 PM CET", tz: "Europe/Berlin",     currency: "EUR" },
  { symbol: "^FCHI",    name: "CAC 40",              region: "France",        flag: "🇫🇷", openTime: "9:00 AM – 5:30 PM CET", tz: "Europe/Paris",      currency: "EUR" },
  { symbol: "^STOXX50E",name: "Euro Stoxx 50",       region: "Europe",        flag: "🇪🇺", openTime: "9:00 AM – 5:30 PM CET", tz: "Europe/Berlin",     currency: "EUR" },
  { symbol: "^IBEX",    name: "IBEX 35",             region: "Spain",         flag: "🇪🇸", openTime: "9:00 AM – 5:30 PM CET", tz: "Europe/Madrid",     currency: "EUR" },
  { symbol: "FTSEMIB.MI",name:"FTSE MIB",            region: "Italy",         flag: "🇮🇹", openTime: "9:00 AM – 5:30 PM CET", tz: "Europe/Rome",       currency: "EUR" },
  { symbol: "^AEX",     name: "AEX",                 region: "Netherlands",   flag: "🇳🇱", openTime: "9:00 AM – 5:30 PM CET", tz: "Europe/Amsterdam",  currency: "EUR" },
  { symbol: "^SSMI",    name: "SMI",                 region: "Switzerland",   flag: "🇨🇭", openTime: "9:00 AM – 5:30 PM CET", tz: "Europe/Zurich",     currency: "CHF" },
  { symbol: "^OMX",     name: "OMX Stockholm 30",    region: "Sweden",        flag: "🇸🇪", openTime: "9:00 AM – 5:30 PM CET", tz: "Europe/Stockholm",  currency: "SEK" },
  { symbol: "^OSEAX",   name: "Oslo All Share",      region: "Norway",        flag: "🇳🇴", openTime: "9:00 AM – 4:20 PM CET", tz: "Europe/Oslo",       currency: "NOK" },
  { symbol: "^OMXC25",  name: "OMX Copenhagen 25",   region: "Denmark",       flag: "🇩🇰", openTime: "9:00 AM – 5:00 PM CET", tz: "Europe/Copenhagen", currency: "DKK" },
  { symbol: "^N225",    name: "Nikkei 225",          region: "Japan",         flag: "🇯🇵", openTime: "9:00 AM – 3:00 PM JST", tz: "Asia/Tokyo",        currency: "JPY" },
  { symbol: "^HSI",     name: "Hang Seng Index",     region: "Hong Kong",     flag: "🇭🇰", openTime: "9:30 AM – 4:00 PM HKT", tz: "Asia/Hong_Kong",    currency: "HKD" },
  { symbol: "000001.SS",name: "Shanghai Composite",  region: "China",         flag: "🇨🇳", openTime: "9:30 AM – 3:00 PM CST", tz: "Asia/Shanghai",     currency: "CNY" },
  { symbol: "^NSEI",    name: "Nifty 50",            region: "India",         flag: "🇮🇳", openTime: "9:15 AM – 3:30 PM IST", tz: "Asia/Kolkata",      currency: "INR" },
  { symbol: "^BSESN",   name: "BSE Sensex",          region: "India",         flag: "🇮🇳", openTime: "9:15 AM – 3:30 PM IST", tz: "Asia/Kolkata",      currency: "INR" },
  { symbol: "^KS11",    name: "KOSPI",               region: "South Korea",   flag: "🇰🇷", openTime: "9:00 AM – 3:30 PM KST", tz: "Asia/Seoul",        currency: "KRW" },
  { symbol: "^TWII",    name: "TAIEX",               region: "Taiwan",        flag: "🇹🇼", openTime: "9:00 AM – 1:30 PM CST", tz: "Asia/Taipei",       currency: "TWD" },
  { symbol: "^AXJO",    name: "ASX 200",             region: "Australia",     flag: "🇦🇺", openTime: "10:00 AM – 4:00 PM AEST",tz:"Australia/Sydney",   currency: "AUD" },
  { symbol: "^STI",     name: "Straits Times Index", region: "Singapore",     flag: "🇸🇬", openTime: "9:00 AM – 5:00 PM SGT", tz: "Asia/Singapore",    currency: "SGD" },
  { symbol: "^KLSE",    name: "KLCI",                region: "Malaysia",      flag: "🇲🇾", openTime: "9:00 AM – 5:00 PM MYT", tz: "Asia/Kuala_Lumpur", currency: "MYR" },
  { symbol: "^JKSE",    name: "IDX Composite",       region: "Indonesia",     flag: "🇮🇩", openTime: "9:00 AM – 4:00 PM WIB", tz: "Asia/Jakarta",      currency: "IDR" },
  { symbol: "^SET.BK",  name: "SET Index",           region: "Thailand",      flag: "🇹🇭", openTime: "10:00 AM – 4:30 PM ICT",tz: "Asia/Bangkok",      currency: "THB" },
  { symbol: "^CASE30",  name: "EGX 30",              region: "Egypt",         flag: "🇪🇬", openTime: "10:00 AM – 2:30 PM EET", tz: "Africa/Cairo",      currency: "EGP" },
  { symbol: "^TA125.TA",name: "TA-125",              region: "Israel",        flag: "🇮🇱", openTime: "9:45 AM – 5:15 PM IST", tz: "Asia/Jerusalem",    currency: "ILS" },
  { symbol: "^BVSP",    name: "Ibovespa",            region: "Brazil",        flag: "🇧🇷", openTime: "10:00 AM – 5:00 PM BRT",tz: "America/Sao_Paulo", currency: "BRL" },
  { symbol: "^MXX",     name: "IPC Mexico",          region: "Mexico",        flag: "🇲🇽", openTime: "8:30 AM – 3:00 PM CST", tz: "America/Mexico_City",currency:"MXN" },
  { symbol: "^GSPTSE",  name: "S&P/TSX Composite",  region: "Canada",        flag: "🇨🇦", openTime: "9:30 AM – 4:00 PM ET",  tz: "America/Toronto",   currency: "CAD" },
  { symbol: "^MERV",    name: "MERVAL",              region: "Argentina",     flag: "🇦🇷", openTime: "11:00 AM – 5:00 PM ART",tz: "America/Argentina/Buenos_Aires", currency: "ARS" },
  { symbol: "^XJO",     name: "All Ordinaries",      region: "Australia",     flag: "🇦🇺", openTime: "10:00 AM – 4:00 PM AEST",tz:"Australia/Sydney",  currency: "AUD" },
  { symbol: "^NZ50",    name: "NZX 50",              region: "New Zealand",   flag: "🇳🇿", openTime: "10:00 AM – 4:45 PM NZST",tz:"Pacific/Auckland",  currency: "NZD" },
  { symbol: "^ATX",     name: "ATX",                 region: "Austria",       flag: "🇦🇹", openTime: "9:00 AM – 5:30 PM CET", tz: "Europe/Vienna",     currency: "EUR" },
  { symbol: "^BFX",     name: "BEL 20",              region: "Belgium",       flag: "🇧🇪", openTime: "9:00 AM – 5:30 PM CET", tz: "Europe/Brussels",   currency: "EUR" },
  { symbol: "^PSI20",   name: "PSI 20",              region: "Portugal",      flag: "🇵🇹", openTime: "9:00 AM – 5:30 PM WET", tz: "Europe/Lisbon",     currency: "EUR" },
  { symbol: "^WIG20",   name: "WIG 20",              region: "Poland",        flag: "🇵🇱", openTime: "9:00 AM – 5:00 PM CET", tz: "Europe/Warsaw",     currency: "PLN" },
  { symbol: "^ATX50",   name: "ATHEX Composite",     region: "Greece",        flag: "🇬🇷", openTime: "10:00 AM – 5:20 PM EET",tz: "Europe/Athens",     currency: "EUR" },
  { symbol: "^TASI.SR", name: "Tadawul All Share",   region: "Saudi Arabia",  flag: "🇸🇦", openTime: "10:00 AM – 3:00 PM AST", tz: "Asia/Riyadh",      currency: "SAR" },
  { symbol: "^MOEX.ME", name: "MOEX Russia",         region: "Russia",        flag: "🇷🇺", openTime: "10:00 AM – 6:50 PM MSK", tz: "Europe/Moscow",     currency: "RUB" },
  { symbol: "^J203.JO", name: "JSE All Share",       region: "South Africa",  flag: "🇿🇦", openTime: "9:00 AM – 5:00 PM SAST",tz: "Africa/Johannesburg",currency:"ZAR" },
  { symbol: "^IPSA",    name: "S&P/CLX IPSA",        region: "Chile",         flag: "🇨🇱", openTime: "9:30 AM – 4:00 PM CLT", tz: "America/Santiago",  currency: "CLP" },
  { symbol: "^COLCAP",  name: "COLCAP",              region: "Colombia",      flag: "🇨🇴", openTime: "9:30 AM – 4:00 PM COT", tz: "America/Bogota",    currency: "COP" },
];

const COMMODITIES = [
  { symbol: "GC=F",  name: "Gold",          category: "Precious Metals", unit: "per troy oz", flag: "🥇", currency: "USD" },
  { symbol: "SI=F",  name: "Silver",        category: "Precious Metals", unit: "per troy oz", flag: "⚪", currency: "USD" },
  { symbol: "PL=F",  name: "Platinum",      category: "Precious Metals", unit: "per troy oz", flag: "🔘", currency: "USD" },
  { symbol: "PA=F",  name: "Palladium",     category: "Precious Metals", unit: "per troy oz", flag: "⬜", currency: "USD" },
  { symbol: "CL=F",  name: "Crude Oil WTI", category: "Energy",          unit: "per barrel",  flag: "🛢️", currency: "USD" },
  { symbol: "BZ=F",  name: "Brent Crude",   category: "Energy",          unit: "per barrel",  flag: "🛢️", currency: "USD" },
  { symbol: "NG=F",  name: "Natural Gas",   category: "Energy",          unit: "per MMBtu",   flag: "🔥", currency: "USD" },
  { symbol: "RB=F",  name: "Gasoline",      category: "Energy",          unit: "per gallon",  flag: "⛽", currency: "USD" },
  { symbol: "HO=F",  name: "Heating Oil",   category: "Energy",          unit: "per gallon",  flag: "🔶", currency: "USD" },
  { symbol: "HG=F",  name: "Copper",        category: "Base Metals",     unit: "per lb",      flag: "🔴", currency: "USD" },
  { symbol: "ALI=F", name: "Aluminium",     category: "Base Metals",     unit: "per lb",      flag: "🟤", currency: "USD" },
  { symbol: "ZC=F",  name: "Corn",          category: "Agriculture",     unit: "per bushel",  flag: "🌽", currency: "USD" },
  { symbol: "ZW=F",  name: "Wheat",         category: "Agriculture",     unit: "per bushel",  flag: "🌾", currency: "USD" },
  { symbol: "ZS=F",  name: "Soybeans",      category: "Agriculture",     unit: "per bushel",  flag: "🟡", currency: "USD" },
  { symbol: "CC=F",  name: "Cocoa",         category: "Agriculture",     unit: "per tonne",   flag: "🍫", currency: "USD" },
  { symbol: "KC=F",  name: "Coffee",        category: "Agriculture",     unit: "per lb",      flag: "☕", currency: "USD" },
  { symbol: "CT=F",  name: "Cotton",        category: "Agriculture",     unit: "per lb",      flag: "🤍", currency: "USD" },
  { symbol: "SB=F",  name: "Sugar",         category: "Agriculture",     unit: "per lb",      flag: "🍬", currency: "USD" },
  { symbol: "OJ=F",  name: "Orange Juice",  category: "Agriculture",     unit: "per lb",      flag: "🍊", currency: "USD" },
  { symbol: "LE=F",  name: "Live Cattle",   category: "Livestock",       unit: "per lb",      flag: "🐄", currency: "USD" },
  { symbol: "GF=F",  name: "Feeder Cattle", category: "Livestock",       unit: "per lb",      flag: "🐂", currency: "USD" },
  { symbol: "HE=F",  name: "Lean Hogs",     category: "Livestock",       unit: "per lb",      flag: "🐖", currency: "USD" },
  { symbol: "LBS=F", name: "Lumber",        category: "Materials",       unit: "per 1,000 bf",flag: "🪵", currency: "USD" },
];

const FOREX_PAIRS = [
  { symbol: "EURUSD=X", name: "EUR/USD", base: "Euro",           quote: "US Dollar",      flag: "🇪🇺🇺🇸", category: "Majors" },
  { symbol: "GBPUSD=X", name: "GBP/USD", base: "Pound Sterling", quote: "US Dollar",      flag: "🇬🇧🇺🇸", category: "Majors" },
  { symbol: "USDJPY=X", name: "USD/JPY", base: "US Dollar",      quote: "Japanese Yen",   flag: "🇺🇸🇯🇵", category: "Majors" },
  { symbol: "USDCHF=X", name: "USD/CHF", base: "US Dollar",      quote: "Swiss Franc",    flag: "🇺🇸🇨🇭", category: "Majors" },
  { symbol: "AUDUSD=X", name: "AUD/USD", base: "Aus Dollar",     quote: "US Dollar",      flag: "🇦🇺🇺🇸", category: "Majors" },
  { symbol: "USDCAD=X", name: "USD/CAD", base: "US Dollar",      quote: "Canadian Dollar",flag: "🇺🇸🇨🇦", category: "Majors" },
  { symbol: "NZDUSD=X", name: "NZD/USD", base: "NZ Dollar",      quote: "US Dollar",      flag: "🇳🇿🇺🇸", category: "Majors" },
  { symbol: "EURGBP=X", name: "EUR/GBP", base: "Euro",           quote: "Pound Sterling", flag: "🇪🇺🇬🇧", category: "Crosses" },
  { symbol: "EURJPY=X", name: "EUR/JPY", base: "Euro",           quote: "Japanese Yen",   flag: "🇪🇺🇯🇵", category: "Crosses" },
  { symbol: "GBPJPY=X", name: "GBP/JPY", base: "Pound Sterling", quote: "Japanese Yen",   flag: "🇬🇧🇯🇵", category: "Crosses" },
  { symbol: "EURCHF=X", name: "EUR/CHF", base: "Euro",           quote: "Swiss Franc",    flag: "🇪🇺🇨🇭", category: "Crosses" },
  { symbol: "AUDJPY=X", name: "AUD/JPY", base: "Aus Dollar",     quote: "Japanese Yen",   flag: "🇦🇺🇯🇵", category: "Crosses" },
  { symbol: "GBPAUD=X", name: "GBP/AUD", base: "Pound Sterling", quote: "Aus Dollar",     flag: "🇬🇧🇦🇺", category: "Crosses" },
  { symbol: "CADJPY=X", name: "CAD/JPY", base: "Canadian Dollar",quote: "Japanese Yen",   flag: "🇨🇦🇯🇵", category: "Crosses" },
  { symbol: "USDINR=X", name: "USD/INR", base: "US Dollar",      quote: "Indian Rupee",   flag: "🇺🇸🇮🇳", category: "Emerging" },
  { symbol: "USDCNY=X", name: "USD/CNY", base: "US Dollar",      quote: "Chinese Yuan",   flag: "🇺🇸🇨🇳", category: "Emerging" },
  { symbol: "USDKRW=X", name: "USD/KRW", base: "US Dollar",      quote: "Korean Won",     flag: "🇺🇸🇰🇷", category: "Emerging" },
  { symbol: "USDTRY=X", name: "USD/TRY", base: "US Dollar",      quote: "Turkish Lira",   flag: "🇺🇸🇹🇷", category: "Emerging" },
  { symbol: "USDBRL=X", name: "USD/BRL", base: "US Dollar",      quote: "Brazilian Real", flag: "🇺🇸🇧🇷", category: "Emerging" },
  { symbol: "USDMXN=X", name: "USD/MXN", base: "US Dollar",      quote: "Mexican Peso",   flag: "🇺🇸🇲🇽", category: "Emerging" },
  { symbol: "USDZAR=X", name: "USD/ZAR", base: "US Dollar",      quote: "S. African Rand",flag: "🇺🇸🇿🇦", category: "Emerging" },
  { symbol: "USDRUB=X", name: "USD/RUB", base: "US Dollar",      quote: "Russian Ruble",  flag: "🇺🇸🇷🇺", category: "Emerging" },
  { symbol: "USDSGD=X", name: "USD/SGD", base: "US Dollar",      quote: "Singapore Dollar",flag:"🇺🇸🇸🇬", category: "Asia-Pac" },
  { symbol: "USDHKD=X", name: "USD/HKD", base: "US Dollar",      quote: "Hong Kong Dollar",flag:"🇺🇸🇭🇰", category: "Asia-Pac" },
  { symbol: "USDTHB=X", name: "USD/THB", base: "US Dollar",      quote: "Thai Baht",      flag: "🇺🇸🇹🇭", category: "Asia-Pac" },
  { symbol: "USDIDR=X", name: "USD/IDR", base: "US Dollar",      quote: "Indonesian Rupiah",flag:"🇺🇸🇮🇩", category: "Asia-Pac" },
  { symbol: "USDPHP=X", name: "USD/PHP", base: "US Dollar",      quote: "Philippine Peso",flag: "🇺🇸🇵🇭", category: "Asia-Pac" },
  { symbol: "USDMYR=X", name: "USD/MYR", base: "US Dollar",      quote: "Malaysian Ringgit",flag:"🇺🇸🇲🇾", category: "Asia-Pac" },
  { symbol: "USDPKR=X", name: "USD/PKR", base: "US Dollar",      quote: "Pakistani Rupee",flag: "🇺🇸🇵🇰", category: "Asia-Pac" },
  { symbol: "USDAED=X", name: "USD/AED", base: "US Dollar",      quote: "UAE Dirham",     flag: "🇺🇸🇦🇪", category: "MENA" },
  { symbol: "USDSAR=X", name: "USD/SAR", base: "US Dollar",      quote: "Saudi Riyal",    flag: "🇺🇸🇸🇦", category: "MENA" },
  { symbol: "USDEGP=X", name: "USD/EGP", base: "US Dollar",      quote: "Egyptian Pound", flag: "🇺🇸🇪🇬", category: "MENA" },
  { symbol: "USDNGN=X", name: "USD/NGN", base: "US Dollar",      quote: "Nigerian Naira", flag: "🇺🇸🇳🇬", category: "MENA" },
  { symbol: "USDILS=X", name: "USD/ILS", base: "US Dollar",      quote: "Israeli Shekel", flag: "🇺🇸🇮🇱", category: "MENA" },
  { symbol: "USDNOK=X", name: "USD/NOK", base: "US Dollar",      quote: "Norwegian Krone",flag: "🇺🇸🇳🇴", category: "Europe" },
  { symbol: "USDSEK=X", name: "USD/SEK", base: "US Dollar",      quote: "Swedish Krona",  flag: "🇺🇸🇸🇪", category: "Europe" },
  { symbol: "USDDKK=X", name: "USD/DKK", base: "US Dollar",      quote: "Danish Krone",   flag: "🇺🇸🇩🇰", category: "Europe" },
  { symbol: "USDPLN=X", name: "USD/PLN", base: "US Dollar",      quote: "Polish Zloty",   flag: "🇺🇸🇵🇱", category: "Europe" },
  { symbol: "USDHUF=X", name: "USD/HUF", base: "US Dollar",      quote: "Hungarian Forint",flag:"🇺🇸🇭🇺", category: "Europe" },
  { symbol: "USDCZK=X", name: "USD/CZK", base: "US Dollar",      quote: "Czech Koruna",   flag: "🇺🇸🇨🇿", category: "Europe" },
  { symbol: "USDCLP=X", name: "USD/CLP", base: "US Dollar",      quote: "Chilean Peso",   flag: "🇺🇸🇨🇱", category: "Americas" },
  { symbol: "USDCOP=X", name: "USD/COP", base: "US Dollar",      quote: "Colombian Peso", flag: "🇺🇸🇨🇴", category: "Americas" },
  { symbol: "USDARS=X", name: "USD/ARS", base: "US Dollar",      quote: "Argentine Peso", flag: "🇺🇸🇦🇷", category: "Americas" },
  { symbol: "USDPEN=X", name: "USD/PEN", base: "US Dollar",      quote: "Peruvian Sol",   flag: "🇺🇸🇵🇪", category: "Americas" },
];

const futuresCache: Map<string, { data: any[]; timestamp: number }> = new Map();
const FUTURES_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

async function fetchYahooPrice(symbol: string): Promise<{ price?: number; change?: number; changePercent?: number; prevClose?: number } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose || meta.previousClose;
    const change = price && prevClose ? price - prevClose : undefined;
    const changePercent = change && prevClose ? (change / prevClose) * 100 : undefined;
    return { price, change, changePercent, prevClose };
  } catch {
    return null;
  }
}

async function fetchRangeData(symbol: string, range: string): Promise<{ changePercent?: number; change?: number; sparkline?: number[]; lastPrice?: number } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const rawCloses = result.indicators?.quote?.[0]?.close as (number | null)[] | undefined;
    if (!rawCloses) return null;
    const closes = rawCloses.filter((c): c is number => c != null && !isNaN(c));
    if (closes.length < 2) return null;
    const first = closes[0];
    const last = closes[closes.length - 1];
    const change = last - first;
    const changePercent = (change / first) * 100;
    return { change, changePercent, sparkline: closes, lastPrice: last };
  } catch {
    return null;
  }
}

async function fetchBatch(symbols: string[]): Promise<Map<string, { price?: number; change?: number; changePercent?: number }>> {
  const results = new Map<string, { price?: number; change?: number; changePercent?: number }>();
  const BATCH = 10;
  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    const fetched = await Promise.all(batch.map(s => fetchYahooPrice(s).then(r => ({ s, r }))));
    for (const { s, r } of fetched) {
      if (r) results.set(s, r);
    }
  }
  return results;
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/stocks/:countryCode", async (req, res) => {
    const { countryCode } = req.params;
    const exchange = (req.query.exchange as string || "").toUpperCase();
    let code = countryCode.toUpperCase();

    let cacheKey = code;
    if (code === "IN" && exchange === "BSE") {
      cacheKey = "IN_BSE";
    }

    try {
      const stocks = await fetchStocksForCountry(cacheKey);
      const exchangeInfo = COUNTRY_EXCHANGE_MAP[code];
      const cached = stockCache.get(cacheKey);
      const cacheTimestamp = cached?.timestamp || Date.now();

      const marketStatus = getMarketStatus(code);

      res.json({
        countryCode: code,
        exchange: code === "IN" && exchange === "BSE" ? "BSE" : (exchangeInfo?.exchanges?.[0] || "Unknown"),
        region: exchangeInfo?.region || "Unknown",
        count: stocks.length,
        stocks,
        lastUpdated: new Date(cacheTimestamp).toISOString(),
        marketStatus,
      });
    } catch (error) {
      console.error(`Error in /api/stocks/${code}:`, error);
      res.status(500).json({ error: "Failed to fetch stocks" });
    }
  });

  // Futures: Indices
  app.get("/api/futures/indices", async (_req, res) => {
    const cacheKey = "indices";
    const cached = futuresCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < FUTURES_CACHE_DURATION) {
      return res.json({ items: cached.data, lastUpdated: new Date(cached.timestamp).toISOString() });
    }
    try {
      const symbols = WORLD_INDICES.map(i => i.symbol);
      const prices = await fetchBatch(symbols);
      const items = WORLD_INDICES.map(idx => ({
        ...idx,
        price: prices.get(idx.symbol)?.price,
        change: prices.get(idx.symbol)?.change,
        changePercent: prices.get(idx.symbol)?.changePercent,
      }));
      futuresCache.set(cacheKey, { data: items, timestamp: Date.now() });
      res.json({ items, lastUpdated: new Date().toISOString() });
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch indices" });
    }
  });

  // Futures: Commodities
  app.get("/api/futures/commodities", async (_req, res) => {
    const cacheKey = "commodities";
    const cached = futuresCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < FUTURES_CACHE_DURATION) {
      return res.json({ items: cached.data, lastUpdated: new Date(cached.timestamp).toISOString() });
    }
    try {
      const symbols = COMMODITIES.map(c => c.symbol);
      const prices = await fetchBatch(symbols);
      const items = COMMODITIES.map(c => ({
        ...c,
        price: prices.get(c.symbol)?.price,
        change: prices.get(c.symbol)?.change,
        changePercent: prices.get(c.symbol)?.changePercent,
      }));
      futuresCache.set(cacheKey, { data: items, timestamp: Date.now() });
      res.json({ items, lastUpdated: new Date().toISOString() });
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch commodities" });
    }
  });

  // Futures: Forex
  app.get("/api/futures/forex", async (_req, res) => {
    const cacheKey = "forex";
    const cached = futuresCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < FUTURES_CACHE_DURATION) {
      return res.json({ items: cached.data, lastUpdated: new Date(cached.timestamp).toISOString() });
    }
    try {
      const symbols = FOREX_PAIRS.map(f => f.symbol);
      const prices = await fetchBatch(symbols);
      const items = FOREX_PAIRS.map(f => ({
        ...f,
        price: prices.get(f.symbol)?.price,
        change: prices.get(f.symbol)?.change,
        changePercent: prices.get(f.symbol)?.changePercent,
      }));
      futuresCache.set(cacheKey, { data: items, timestamp: Date.now() });
      res.json({ items, lastUpdated: new Date().toISOString() });
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch forex" });
    }
  });

  // ─── Chart OHLCV data — Yahoo Finance historical prices ──────────────────────
  // Feeds the Lightweight Charts (MIT) candlestick chart in ChartModal.
  // No TradingView widget or CDN key required.
  const chartCache = new Map<string, { data: unknown; timestamp: number }>();
  const CHART_CACHE_DURATION = 60 * 60 * 1000; // 1 hour

  app.get("/api/chart/:symbol", async (req, res) => {
    const raw   = req.params.symbol;
    const range = (req.query.range as string) || "3mo";
    const validRanges = ["1mo", "3mo", "6mo", "1y", "5y"];
    const safeRange   = validRanges.includes(range) ? range : "3mo";
    const interval    = safeRange === "5y" ? "1wk" : "1d";

    const cacheKey = `${raw}:${safeRange}`;
    const cached   = chartCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CHART_CACHE_DURATION) {
      return res.json(cached.data);
    }

    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(raw)}?range=${safeRange}&interval=${interval}`;
      const resp = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) return res.status(502).json({ error: "Yahoo Finance unavailable" });

      const data   = await resp.json() as any;
      const result = data?.chart?.result?.[0];
      if (!result) return res.status(404).json({ error: "No data for symbol" });

      const timestamps = (result.timestamp ?? []) as number[];
      const quote      = result.indicators?.quote?.[0] ?? {};
      const opens      = (quote.open  ?? []) as (number | null)[];
      const highs      = (quote.high  ?? []) as (number | null)[];
      const lows       = (quote.low   ?? []) as (number | null)[];
      const closes     = (quote.close ?? []) as (number | null)[];
      const volumes    = (quote.volume ?? []) as (number | null)[];

      const candles = timestamps
        .map((ts, i) => ({
          time:   new Date(ts * 1000).toISOString().split("T")[0],
          open:   opens[i],
          high:   highs[i],
          low:    lows[i],
          close:  closes[i],
          volume: volumes[i] ?? null,
        }))
        .filter(c => c.open != null && c.high != null && c.low != null && c.close != null);

      const responseData = {
        candles,
        currency:    result.meta?.currency ?? "USD",
        symbol:      result.meta?.symbol   ?? raw,
        lastUpdated: new Date().toISOString(),
      };
      chartCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
      res.json(responseData);
    } catch (e) {
      console.error("Chart data error:", e);
      res.status(500).json({ error: "Failed to fetch chart data" });
    }
  });

  // ─── COT Metals: CFTC Commitments of Traders ─────────────────────────────────
  // Source: CFTC Disaggregated Futures-Only COT Report (published every Friday)
  // Dataset: publicreporting.cftc.gov/resource/kh3c-gbw2.json
  // "Managed Money" category = hedge funds / CTAs
  const COT_METALS = [
    { name: "Gold",      emoji: "🥇", code: "088691", symbol: "GC=F",  description: "Primary safe-haven. Most liquid metal futures market globally." },
    { name: "Silver",    emoji: "🥈", code: "084691", symbol: "SI=F",  description: "Hybrid industrial/safe-haven. More volatile than gold." },
    { name: "Copper",    emoji: "🟠", code: "085692", symbol: "HG=F",  description: "Industrial barometer. Hedge fund positioning reflects global growth outlook." },
    { name: "Platinum",  emoji: "⚪", code: "076651", symbol: "PL=F",  description: "Auto-catalyst demand + safe haven. Less liquid than gold/silver." },
    { name: "Palladium", emoji: "🔵", code: "075651", symbol: "PA=F",  description: "Primarily auto-industry driven. Prone to supply squeezes." },
  ];

  const COT_CACHE_DURATION = 4 * 60 * 60 * 1000; // 4 hours
  let cotMetalsCache: { data: unknown; timestamp: number } | null = null;

  app.get("/api/futures/cot-metals", async (_req, res) => {
    if (cotMetalsCache && Date.now() - cotMetalsCache.timestamp < COT_CACHE_DURATION) {
      return res.json(cotMetalsCache.data);
    }
    try {
      const results = await Promise.all(
        COT_METALS.map(async (metal) => {
          const url = new URL("https://publicreporting.cftc.gov/resource/kh3c-gbw2.json");
          url.searchParams.set("cftc_contract_market_code", metal.code);
          url.searchParams.set("$order", "report_date_as_yyyy_mm_dd DESC");
          url.searchParams.set("$limit", "2");

          const resp = await fetch(url.toString(), {
            headers: { Accept: "application/json", "User-Agent": "Monysa/1.0" },
            signal: AbortSignal.timeout(12000),
          });
          if (!resp.ok) return null;
          const rows = await resp.json() as Record<string, string>[];
          if (!rows || rows.length === 0) return null;

          const latest = rows[0];
          const prev   = rows[1] ?? null;

          const longCurrent  = parseInt(latest.m_money_positions_long_all  ?? "0", 10);
          const shortCurrent = parseInt(latest.m_money_positions_short_all ?? "0", 10);
          const netCurrent   = longCurrent - shortCurrent;
          const total        = longCurrent + shortCurrent;
          const longPct      = total > 0 ? (longCurrent / total) * 100 : 50;

          let weekNetChange: number | null = null;
          let weekNetChangePct: number | null = null;
          if (prev) {
            const longPrev  = parseInt(prev.m_money_positions_long_all  ?? "0", 10);
            const shortPrev = parseInt(prev.m_money_positions_short_all ?? "0", 10);
            const netPrev   = longPrev - shortPrev;
            weekNetChange    = netCurrent - netPrev;
            weekNetChangePct = netPrev !== 0 ? ((netCurrent - netPrev) / Math.abs(netPrev)) * 100 : null;
          }

          const sentiment =
            longPct >= 70 ? "Strongly Bullish" :
            longPct >= 58 ? "Bullish"          :
            longPct >= 42 ? "Neutral"          :
            longPct >= 30 ? "Bearish"          : "Strongly Bearish";

          return {
            name:            metal.name,
            emoji:           metal.emoji,
            symbol:          metal.symbol,
            description:     metal.description,
            longContracts:   longCurrent,
            shortContracts:  shortCurrent,
            netPosition:     netCurrent,
            longPct:         Math.round(longPct * 10) / 10,
            sentiment,
            weekNetChange,
            weekNetChangePct: weekNetChangePct != null ? Math.round(weekNetChangePct * 10) / 10 : null,
            reportDate:      latest.report_date_as_yyyy_mm_dd ?? null,
            marketName:      latest.market_and_exchange_names ?? metal.name,
          };
        })
      );

      const metals = results.filter(Boolean);
      const reportDate = (metals[0] as { reportDate?: string } | null)?.reportDate ?? null;
      const responseData = {
        metals,
        reportDate,
        lastUpdated: new Date().toISOString(),
        source: "CFTC Disaggregated Commitments of Traders Report",
        sourceUrl: "https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm",
      };
      cotMetalsCache = { data: responseData, timestamp: Date.now() };
      res.json(responseData);
    } catch (e) {
      console.error("COT metals error:", e);
      res.status(500).json({ error: "Failed to fetch CFTC COT data" });
    }
  });

  // Volatility: Asset class response during geopolitical crises
  const VOLATILITY_ASSETS = [
    {
      symbol: "GC=F",
      name: "Gold",
      flag: "🥇",
      category: "Safe Haven",
      volatilityMult: 1,
      direction: "reference",
      description: "The primary safe haven — investors flood into gold when uncertainty spikes. Gold often rises 10–25% during geopolitical crises.",
    },
    {
      symbol: "GDX",
      name: "Gold Miners ETF",
      flag: "⛏️",
      category: "Leveraged Gold",
      volatilityMult: 3,
      direction: "same",
      description: "Mining companies' profits expand as gold rises — fixed costs mean revenue gains flow straight to the bottom line. Typically 2–3× gold's moves, not 7×.",
    },
    {
      symbol: "SI=F",
      name: "Silver",
      flag: "⚪",
      category: "Precious Metals",
      volatilityMult: 2,
      direction: "same",
      description: "Part safe haven, part industrial metal — so it follows gold but with more swing, typically 1.5–2.5×. Industrial demand can dampen gains if growth slows.",
    },
    {
      symbol: "CL=F",
      name: "Crude Oil (WTI)",
      flag: "🛢️",
      category: "Energy",
      volatilityMult: 2,
      direction: "same",
      description: "Supply disruptions and sanctions from geopolitical events push oil higher. The root cause of the inflation chain reaction.",
    },
    {
      symbol: "XLE",
      name: "Energy ETF (XLE)",
      flag: "⚡",
      category: "Energy",
      volatilityMult: 2,
      direction: "same",
      description: "Energy sector stocks profit when oil rises — revenue surges while existing infrastructure costs stay fixed.",
    },
    {
      symbol: "DX-Y.NYB",
      name: "US Dollar Index",
      flag: "💵",
      category: "Safe Haven",
      volatilityMult: 1,
      direction: "same",
      description: "Investors sell risky assets and buy US Treasuries during crises, driving dollar demand higher. Acts as a short-term safe haven.",
    },
  ];

  const volatilityCache: Map<string, { data: any; timestamp: number }> = new Map();
  const VOLATILITY_CACHE_DURATION = 10 * 60 * 1000;

  app.get("/api/volatility/assets", async (_req, res) => {
    const cacheKey = "volatility-assets-v3";
    const cached = volatilityCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < VOLATILITY_CACHE_DURATION) {
      return res.json({ ...cached.data, lastUpdated: new Date(cached.timestamp).toISOString() });
    }
    try {
      // Fetch VIX + all assets (today + 1W + 1M + 3M) all in parallel
      const [vixToday, vix1m, ...assetResults] = await Promise.all([
        fetchYahooPrice("^VIX"),
        fetchRangeData("^VIX", "1mo"),
        ...VOLATILITY_ASSETS.map(async (a) => {
          const [today, r1w, r1m, r3m] = await Promise.all([
            fetchYahooPrice(a.symbol),
            fetchRangeData(a.symbol, "5d"),
            fetchRangeData(a.symbol, "1mo"),
            fetchRangeData(a.symbol, "3mo"),
          ]);
          return { today, r1w, r1m, r3m };
        }),
      ]);

      const vixPrice = vixToday?.price ?? vix1m?.lastPrice ?? null;
      let vixBand = "calm";
      let vixBandLabel = "Calm";
      if (vixPrice != null) {
        if (vixPrice >= 35) { vixBand = "crisis"; vixBandLabel = "Crisis"; }
        else if (vixPrice >= 25) { vixBand = "elevated"; vixBandLabel = "Elevated Fear"; }
        else if (vixPrice >= 15) { vixBand = "nervous"; vixBandLabel = "Nervous"; }
      }

      const items = VOLATILITY_ASSETS.map((a, idx) => {
        const r = assetResults[idx];
        return {
          ...a,
          price: r.today?.price,
          change: r.today?.change,
          changePercent: r.today?.changePercent,
          change1W: r.r1w?.change,
          changePercent1W: r.r1w?.changePercent,
          change1M: r.r1m?.change,
          changePercent1M: r.r1m?.changePercent,
          change3M: r.r3m?.change,
          changePercent3M: r.r3m?.changePercent,
          sparkline: r.r1m?.sparkline ?? [],
        };
      });

      const responseData = {
        items,
        vix: { price: vixPrice, band: vixBand, bandLabel: vixBandLabel },
      };
      volatilityCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
      res.json({ ...responseData, lastUpdated: new Date().toISOString() });
    } catch (e) {
      console.error("Error in /api/volatility/assets:", e);
      res.status(500).json({ error: "Failed to fetch volatility assets" });
    }
  });

  // AI Crisis Briefing (streaming SSE)
  const briefingCache: Map<string, { briefing: string; generatedAt: string; timestamp: number }> = new Map();
  const BRIEFING_CACHE_DURATION = 30 * 60 * 1000;

  app.post("/api/volatility/briefing", async (req, res) => {
    const { vix, vixBand, goldPct1M, oilPct1M, dxyPct1M } = req.body as {
      vix?: number; vixBand?: string; goldPct1M?: number; oilPct1M?: number; dxyPct1M?: number;
    };

    // Cache key includes all inputs to avoid stale mismatches
    const cacheKey = [
      Math.round((vix || 0) * 10),
      Math.round((goldPct1M || 0) * 10),
      Math.round((oilPct1M || 0) * 10),
      Math.round((dxyPct1M || 0) * 10),
      vixBand || "unknown",
    ].join("-");

    // SSE headers — flush immediately so the client can start reading
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const cached = briefingCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < BRIEFING_CACHE_DURATION) {
      // Replay cached briefing as a single chunk
      res.write(`data: ${JSON.stringify({ content: cached.briefing })}\n\n`);
      res.write(`data: ${JSON.stringify({ generatedAt: cached.generatedAt })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
      res.write(`data: ${JSON.stringify({ error: "AI integration not available" })}\n\n`);
      res.end();
      return;
    }

    try {
      const { default: OpenAI } = await import("openai");
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });
      const fmt = (v?: number) => v != null ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : "N/A";

      const stream = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a concise macro analyst. Based on current market stress indicators, write exactly 3-4 sentences summarising the current stress level, what it means for investors, and which crisis assets look best positioned right now. Be direct and plain-English. No bullet points or headers.",
          },
          {
            role: "user",
            content: `Current market stress indicators:\n- VIX: ${vix?.toFixed(1) ?? "N/A"} (${vixBand ?? "unknown"} zone)\n- Gold (30-day): ${fmt(goldPct1M)}\n- Oil/WTI (30-day): ${fmt(oilPct1M)}\n- US Dollar Index (30-day): ${fmt(dxyPct1M)}\n\nProvide a 3-4 sentence market stress briefing:`,
          },
        ],
        max_tokens: 250,
        stream: true,
      });

      let fullText = "";
      const generatedAt = new Date().toISOString();

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          fullText += content;
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ generatedAt })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();

      // Cache the completed response
      briefingCache.set(cacheKey, { briefing: fullText, generatedAt, timestamp: Date.now() });
    } catch (err) {
      console.error("Briefing stream error:", err);
      res.write(`data: ${JSON.stringify({ error: "Failed to generate briefing" })}\n\n`);
      res.end();
    }
  });

  // Futures: News + AI Price Action Analysis
  const newsCache: Map<string, { data: any; timestamp: number }> = new Map();
  const NEWS_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

  app.get("/api/futures/news", async (req, res) => {
    const { symbol, name, type } = req.query as { symbol: string; name: string; type: string };
    if (!symbol || !name) {
      return res.status(400).json({ error: "symbol and name required" });
    }
    const cacheKey = `news-${symbol}`;
    const cached = newsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < NEWS_CACHE_DURATION) {
      return res.json(cached.data);
    }
    try {
      // Fetch news via Yahoo Finance RSS feed (no rate-limits, symbol-based)
      const rssUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;
      const rssResponse = await fetch(rssUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" }
      });
      let articles: { title: string; publisher: string; link: string; publishedAt: string | null; snippet: string }[] = [];
      if (rssResponse.ok) {
        const rssText = await rssResponse.text();
        const itemMatches = rssText.match(/<item>([\s\S]*?)<\/item>/g) || [];
        articles = itemMatches.slice(0, 3).map((item) => {
          const title = (item.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.replace(/<!--|-->/g, "").trim() || "";
          const link = (item.match(/<link>([\s\S]*?)<\/link>/) || [])[1]?.trim() || "";
          const pubDate = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1]?.trim() || "";
          const descRaw = (item.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || "";
          const snippet = descRaw
            .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
            .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 500);
          // Extract publisher from link domain
          let publisher = "Yahoo Finance";
          try {
            const u = new URL(link);
            const parts = u.hostname.replace("www.", "").split(".");
            publisher = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
          } catch {}
          const publishedAt = pubDate ? new Date(pubDate).toISOString() : null;
          return { title, publisher, link, publishedAt, snippet };
        });
      }

      // snippets are already embedded in articles
      const snippets = articles.map(a => a.snippet || a.title);

      // Generate AI price action summary (gracefully skipped if credentials unavailable)
      let aiSummary = "";
      if (articles.length > 0 && process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
        try {
          const { default: OpenAI } = await import("openai");
          const openai = new OpenAI({
            apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
            baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
          });
          const itemType = type === "forex" ? "currency pair" : type === "commodities" ? "commodity" : "market index";
          const contentText = articles.map((a, i) =>
            `Article ${i + 1}: "${a.title}" (${a.publisher})\n${snippets[i] || ""}`
          ).join("\n\n");
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `You are a concise financial analyst. Based on recent news headlines about a ${itemType}, write 2-3 sentences explaining what the news collectively implies for short-term price action. Be direct about likely direction, key catalysts, and any risk factors. No bullet points — flowing sentences only.`,
              },
              {
                role: "user",
                content: `${itemType}: ${name} (${symbol})\n\nRecent news:\n${contentText}\n\nPrice action implication:`,
              },
            ],
            max_tokens: 200,
          });
          aiSummary = completion.choices[0]?.message?.content?.trim() || "";
        } catch (aiErr) {
          console.warn("AI summary skipped:", (aiErr as Error).message);
        }
      }

      const cleanArticles = articles.map(({ snippet: _s, ...rest }) => rest);
      const result = { articles: cleanArticles, aiSummary };
      newsCache.set(cacheKey, { data: result, timestamp: Date.now() });
      res.json(result);
    } catch (error) {
      console.error("Error in /api/futures/news:", error);
      res.status(500).json({ error: "Failed to fetch news" });
    }
  });

  let debtCache: { data: any; timestamp: number } | null = null;
  const DEBT_CACHE_DURATION = 12 * 60 * 60 * 1000;

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

  // AI Trading Signals module
  app.use("/api/trading", createTradingRouter());

  const httpServer = createServer(app);
  return httpServer;
}
