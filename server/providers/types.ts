export interface OHLCVCandle {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

export interface PriceData {
  price?: number;
  change?: number;
  changePercent?: number;
  prevClose?: number;
  preMarketPrice?: number | null;
  preMarketChangePercent?: number | null;
}

export interface RangeData {
  change?: number;
  changePercent?: number;
  sparkline?: number[];
  lastPrice?: number;
}

export interface ChartProvider {
  readonly name: string;
  readonly label: string;
  fetchCurrentPrice(symbol: string): Promise<PriceData | null>;
  fetchRangeData(symbol: string, range: string): Promise<RangeData | null>;
  fetchChartCandles(symbol: string, range: string, interval: string): Promise<OHLCVCandle[]>;
  fetchHistoryCandles(symbol: string, interval: string, range: string): Promise<OHLCVCandle[]>;
}
