export async function fetchYahooPrice(symbol: string): Promise<{ price?: number; change?: number; changePercent?: number; prevClose?: number } | null> {
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

export async function fetchRangeData(symbol: string, range: string): Promise<{ changePercent?: number; change?: number; sparkline?: number[]; lastPrice?: number } | null> {
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

export async function fetchBatch(symbols: string[]): Promise<Map<string, { price?: number; change?: number; changePercent?: number }>> {
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
