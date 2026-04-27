import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { a11yButton, a11yTab } from "@/utils/accessibility";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Linking,
  DimensionValue,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Dimensions,
  PanResponder,
} from "react-native";
import Svg, { Polyline, Line } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import WebView from "react-native-webview";
import { useQuery, useQueries } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";
import StaticColors from "@/constants/colors";
import { useColors } from "@/hooks/useColors";
import { useStrategy } from "@/context/StrategyContext";
import { useAlerts } from "@/context/AlertContext";
import {
  formatTradingPrice,
  formatChangePct,
  formatRelativeTime,
  sentimentColor,
  sentimentLabel,
} from "@/utils/tradingFormat";

// ─── Types ────────────────────────────────────────────────────────────────────

type DetailTab = "chart" | "signal" | "indicators" | "backtest" | "news";
type HistoryInterval = "1m" | "5m" | "1h" | "4h" | "1d";

interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
}

interface HistoryResponse {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  count: number;
}

interface SignalResult {
  symbol: string;
  direction: "BUY" | "HOLD" | "SELL";
  confidence: number;
  strategy: string;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  riskPct: number;
  reasoning: string[];
  indicators: Record<string, number | null>;
  scores?: { s1?: number; s2?: number; s3?: number };
  timeframe: string;
}

interface TradeRecord {
  n: number;
  direction: "BUY" | "SELL";
  entryPrice: number;
  exitPrice: number;
  returnPct: number;
  win: boolean;
}

interface BacktestStrategyData {
  winRate: number;
  totalReturn: number;
  maxDrawdown: number;
  sharpe: number;
  trades: number;
  tradeLog: TradeRecord[];
}

interface BacktestResponse {
  symbol: string;
  timeframe: string;
  strategies: Record<string, BacktestStrategyData>;
}

const STRATEGY_NAMES: Record<string, string> = {
  "1": "Technical",
  "2": "Multi-Factor",
  "3": "Hybrid",
};

interface NewsArticle {
  title: string;
  publisher: string;
  link?: string;
  url?: string;
  publishedAt: string | null;
  sentiment: number;
}

interface NewsResponse {
  articles: NewsArticle[];
  aggregateSentiment: number;
}

interface QuoteItem {
  symbol: string;
  name: string;
  category: string;
  flag: string;
  currency: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
}

interface QuotesResponse {
  quotes: QuoteItem[];
  timestamp: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function signalColor(dir: string, Colors: typeof StaticColors) {
  if (dir === "BUY") return Colors.positive;
  if (dir === "SELL") return Colors.danger;
  return Colors.warning;
}

function signalBg(dir: string, Colors: typeof StaticColors) {
  if (dir === "BUY") return Colors.positiveDim;
  if (dir === "SELL") return Colors.dangerDim;
  return Colors.warningDim;
}

async function apiFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, getApiUrl());
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

function openLink(url: string) {
  if (!url) return;
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
  } else {
    Linking.openURL(url);
  }
}

// ─── Chart HTML builder ───────────────────────────────────────────────────────

function buildChartHtml(candles: Candle[], chartType: "candlestick" | "line"): string {
  const isLine = chartType === "line";
  const cJson = JSON.stringify(
    isLine
      ? candles.map((c) => ({ time: c.time, value: c.close }))
      : candles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }))
  );
  const vJson = JSON.stringify(
    candles
      .filter((c) => c.volume != null && c.volume > 0)
      .map((c) => ({
        time: c.time,
        value: c.volume,
        color: (c.close ?? 0) >= (c.open ?? 0) ? "#00D4AA33" : "#FF4D6A33",
      }))
  );
  const seriesInit = isLine
    ? `var cs=chart.addLineSeries({color:UP,lineWidth:2,crosshairMarkerVisible:true});`
    : `var cs=chart.addCandlestickSeries({upColor:UP,downColor:DN,borderUpColor:UP,borderDownColor:DN,wickUpColor:UP,wickDownColor:DN});`;
  const ohlcCb = isLine
    ? `chart.subscribeCrosshairMove(function(p){
    if(!p||!p.point){ohlcEl.innerHTML='';return;}
    var d=p.seriesData&&p.seriesData.get(cs);
    if(!d){ohlcEl.innerHTML='';return;}
    ohlcEl.innerHTML='<span style="color:'+UP+'">\u00A0'+d.value.toFixed(2)+'</span>';
  });`
    : `chart.subscribeCrosshairMove(function(p){
    if(!p||!p.point){ohlcEl.innerHTML='';return;}
    var d=p.seriesData&&p.seriesData.get(cs);
    if(!d){ohlcEl.innerHTML='';return;}
    var col=d.close>=d.open?UP:DN;
    ohlcEl.innerHTML='<span style="color:'+col+'">O\u00A0'+d.open.toFixed(2)+'\u00A0H\u00A0'+d.high.toFixed(2)+'\u00A0L\u00A0'+d.low.toFixed(2)+'\u00A0C\u00A0'+d.close.toFixed(2)+'</span>';
  });`;
  return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:#0D1117;width:100%;height:100%;overflow:hidden}
#chart{position:absolute;inset:0}
#ohlc{position:absolute;top:8px;left:12px;font:11px/1.6 monospace;pointer-events:none;z-index:5;max-width:92%}
</style>
</head><body>
<div id="chart"></div>
<div id="ohlc"></div>
<script src="https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js"></script>
<script>
try{
  var UP='#00D4AA',DN='#FF4D6A',GR='#1E2A3D',TX='#5A6478',BG='#0D1117';
  var chart=LightweightCharts.createChart(document.getElementById('chart'),{
    layout:{background:{type:'solid',color:BG},textColor:TX},
    grid:{vertLines:{color:GR},horzLines:{color:GR}},
    crosshair:{mode:LightweightCharts.CrosshairMode.Normal},
    rightPriceScale:{borderColor:GR,scaleMargins:{top:0.08,bottom:${isLine ? "0.05" : "0.18"}}},
    timeScale:{borderColor:GR,timeVisible:true,secondsVisible:false,fixLeftEdge:true,fixRightEdge:true},
    width:window.innerWidth,height:window.innerHeight
  });
  ${seriesInit}
  cs.setData(${cJson});
  ${isLine ? "" : `var vol=${vJson};
  if(vol.length>0){
    var vs=chart.addHistogramSeries({priceFormat:{type:'volume'},priceScaleId:'vol'});
    chart.priceScale('vol').applyOptions({scaleMargins:{top:0.85,bottom:0}});
    vs.setData(vol);
  }`}
  chart.timeScale().fitContent();
  window.addEventListener('resize',function(){chart.applyOptions({width:window.innerWidth,height:window.innerHeight});});
  var ohlcEl=document.getElementById('ohlc');
  ${ohlcCb}
}catch(e){}
</script>
</body></html>`;
}

// ─── Sub-tab bar ──────────────────────────────────────────────────────────────

const DETAIL_TABS: { key: DetailTab; label: string; icon: string }[] = [
  { key: "chart",      label: "Chart",      icon: "bar-chart-outline" },
  { key: "signal",     label: "Signal",     icon: "flash-outline" },
  { key: "indicators", label: "Indicators", icon: "pulse-outline" },
  { key: "backtest",   label: "Backtest",   icon: "trophy-outline" },
  { key: "news",       label: "News",       icon: "newspaper-outline" },
];

function DetailTabBar({
  active,
  onChange,
}: {
  active: DetailTab;
  onChange: (t: DetailTab) => void;
}) {
  const Colors = useColors();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[dtb.scroll, { backgroundColor: Colors.surface, borderBottomColor: Colors.border }]}
      contentContainerStyle={dtb.content}
    >
      {DETAIL_TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            hitSlop={{ top: 5, bottom: 5 }}
            style={[
              dtb.tab,
              { borderBottomColor: isActive ? Colors.accent : "transparent" },
            ]}
            {...a11yTab(t.label, isActive)}
          >
            <Ionicons name={t.icon as React.ComponentProps<typeof Ionicons>["name"]} size={13} color={isActive ? Colors.accent : Colors.textMuted} />
            <Text style={[dtb.label, { color: isActive ? Colors.accent : Colors.textMuted }]}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const dtb = StyleSheet.create({
  scroll: { borderBottomWidth: StyleSheet.hairlineWidth, flexGrow: 0 },
  content: { flexDirection: "row", paddingHorizontal: 4 },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: 44,
    gap: 5,
    borderBottomWidth: 2,
  },
  label: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});

// ─── Chart Tab ────────────────────────────────────────────────────────────────

function ChartTab({ symbol }: { symbol: string }) {
  const Colors = useColors();
  const [interval, setIntervalState] = useState<HistoryInterval>("1d");
  const [chartType, setChartType] = useState<"candlestick" | "line">("candlestick");
  const [webLoading, setWebLoading] = useState(true);

  const { data, isLoading, error, refetch } = useQuery<HistoryResponse>({
    queryKey: ["/api/trading/history", symbol, interval],
    queryFn: () =>
      apiFetch<HistoryResponse>(`/api/trading/history/${encodeURIComponent(symbol)}`, {
        interval,
      }),
    staleTime: 5 * 60_000,
  });

  const chartHtml = useMemo(() => {
    if (!data || data.candles.length === 0) return null;
    return buildChartHtml(data.candles, chartType);
  }, [data, chartType]);

  useEffect(() => {
    setWebLoading(true);
  }, [chartHtml]);

  const intervals: HistoryInterval[] = ["1m", "5m", "1h", "4h", "1d"];

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* Interval + chart type selector */}
      <View style={[ct.intervals, { backgroundColor: Colors.background, borderBottomColor: Colors.border }]}>
        {intervals.map((tf) => {
          const active = tf === interval;
          return (
            <Pressable
              key={tf}
              onPress={() => setIntervalState(tf)}
              hitSlop={{ top: 12, bottom: 12, left: 4, right: 4 }}
              style={[
                ct.tfBtn,
                active
                  ? { backgroundColor: Colors.accentDim, borderColor: Colors.accent + "60" }
                  : { backgroundColor: "transparent", borderColor: Colors.border },
              ]}
              {...a11yTab(tf, active)}
            >
              <Text style={[ct.tfText, { color: active ? Colors.accent : Colors.textMuted }]}>
                {tf}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => setChartType((t) => (t === "candlestick" ? "line" : "candlestick"))}
          hitSlop={12}
          style={[ct.tfBtn, { borderColor: Colors.border, marginLeft: "auto" }]}
          {...a11yButton(chartType === "candlestick" ? "Switch to line chart" : "Switch to candlestick chart")}
        >
          <Ionicons
            name={chartType === "candlestick" ? "bar-chart-outline" : "trending-up-outline"}
            size={14}
            color={Colors.textMuted}
          />
        </Pressable>
      </View>

      {/* Chart area */}
      <View style={{ flex: 1, position: "relative" }}>
        {(isLoading || (!!chartHtml && webLoading)) && (
          <View style={[ct.overlay, { backgroundColor: Colors.background }]}>
            <ActivityIndicator color={Colors.accent} size="large" />
            <Text style={[ct.overlayText, { color: Colors.textMuted }]}>
              {isLoading ? "Fetching candles…" : "Rendering chart…"}
            </Text>
          </View>
        )}
        {!!error && !isLoading && (
          <View style={[ct.overlay, { backgroundColor: Colors.background }]}>
            <Ionicons name="alert-circle-outline" size={36} color={Colors.danger} />
            <Text style={[ct.overlayText, { color: Colors.textMuted }]}>Could not load chart</Text>
            <Pressable onPress={() => refetch()} style={[ct.retryBtn, { backgroundColor: Colors.accentDim, borderColor: Colors.accent + "50" }]}>
              <Text style={[ct.retryText, { color: Colors.accent }]}>Retry</Text>
            </Pressable>
          </View>
        )}
        {chartHtml && !error && Platform.OS === "web" && (
          <iframe
            // @ts-ignore — valid on web
            srcDoc={chartHtml}
            style={{ flex: 1, border: "none", background: "#0D1117", width: "100%", height: "100%" } as unknown as object}
            onLoad={() => setWebLoading(false)}
            onError={() => setWebLoading(false)}
            title="chart"
            sandbox="allow-scripts allow-same-origin"
          />
        )}
        {chartHtml && !error && Platform.OS !== "web" && (
          <WebView
            source={{ html: chartHtml, baseUrl: "https://cdn.jsdelivr.net" }}
            style={{ flex: 1, backgroundColor: "#0D1117" }}
            onLoadStart={() => setWebLoading(true)}
            onLoadEnd={() => setWebLoading(false)}
            onLoad={() => setWebLoading(false)}
            onError={() => setWebLoading(false)}
            javaScriptEnabled
            domStorageEnabled
            scrollEnabled={false}
            mixedContentMode="always"
            originWhitelist={["*"]}
          />
        )}
        {!chartHtml && !isLoading && !error && (
          <View style={[ct.overlay, { backgroundColor: Colors.background }]}>
            <Text style={[ct.overlayText, { color: Colors.textMuted }]}>No chart data available</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const ct = StyleSheet.create({
  intervals: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tfBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 7, borderWidth: 1 },
  tfText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    zIndex: 10,
  },
  overlayText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, borderWidth: 1, marginTop: 4 },
  retryText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});

// ─── Signal Tab ───────────────────────────────────────────────────────────────

function SignalTab({ symbol, strategy }: { symbol: string; strategy: string }) {
  const Colors = useColors();
  const [interval, setIntervalState] = useState<HistoryInterval>("1d");

  const { data, isLoading, error, refetch } = useQuery<SignalResult>({
    queryKey: ["/api/trading/signals", symbol, strategy, interval],
    queryFn: () =>
      apiFetch<SignalResult>(`/api/trading/signals/${encodeURIComponent(symbol)}`, {
        strategy,
        interval,
      }),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <View style={st.center}>
        <ActivityIndicator color={Colors.accent} size="large" />
        <Text style={[st.subText, { color: Colors.textMuted }]}>Analysing indicators…</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={st.center}>
        <Ionicons name="alert-circle-outline" size={36} color={Colors.danger} />
        <Text style={[st.subText, { color: Colors.textMuted }]}>Could not load signal</Text>
        <Pressable onPress={() => refetch()} style={[st.retryBtn, { backgroundColor: Colors.accentDim }]}>
          <Text style={[st.retryText, { color: Colors.accent }]}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const dirColor = signalColor(data.direction, Colors);
  const dirBg = signalBg(data.direction, Colors);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Direction headline */}
      <View style={[st.heroCard, { backgroundColor: dirBg, borderColor: dirColor + "50" }]}>
        <View style={st.heroRow}>
          <View style={[st.heroBadge, { backgroundColor: dirColor }]}>
            <Text style={st.heroBadgeText}>{data.direction}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[st.heroConf, { color: dirColor }]}>
              {data.confidence}% confidence
            </Text>
            <Text style={[st.heroStrategy, { color: Colors.textMuted }]}>
              {data.strategy === "1" ? "S1 Technical" : data.strategy === "2" ? "S2 Multi-Factor" : "S3 Hybrid"}
            </Text>
          </View>
        </View>
        {/* Confidence bar */}
        <View style={[st.heroBar, { backgroundColor: Colors.border }]}>
          <View style={[st.heroBarFill, { width: `${data.confidence}%` as DimensionValue, backgroundColor: dirColor }]} />
        </View>
      </View>

      {/* Interval selector */}
      <View style={[st.intervals, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
        <Text style={[st.intervalLabel, { color: Colors.textMuted }]}>Timeframe:</Text>
        {(["1m","1h","4h","1d"] as HistoryInterval[]).map((tf) => {
          const active = tf === interval;
          return (
            <Pressable
              key={tf}
              onPress={() => setIntervalState(tf)}
              hitSlop={{ top: 9, bottom: 9 }}
              style={[st.tfChip, { backgroundColor: active ? Colors.accentDim : Colors.surfaceElevated, borderColor: active ? Colors.accent + "60" : Colors.border }]}
              {...a11yTab(tf, active)}
            >
              <Text style={[st.tfText, { color: active ? Colors.accent : Colors.textSecondary }]}>{tf}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Price ladder */}
      <View style={[st.ladder, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
        <Text style={[st.ladderTitle, { color: Colors.textMuted }]}>PRICE LEVELS</Text>

        <View style={st.ladderRow}>
          <View style={[st.ladderDot, { backgroundColor: Colors.positive }]} />
          <Text style={[st.ladderLabel, { color: Colors.textSecondary }]}>Take Profit</Text>
          <Text style={[st.ladderValue, { color: Colors.positive }]}>
            {formatTradingPrice(symbol, data.takeProfit)}
          </Text>
        </View>

        <View style={[st.ladderDivider, { backgroundColor: Colors.border }]} />

        <View style={st.ladderRow}>
          <View style={[st.ladderDot, { backgroundColor: Colors.accent }]} />
          <Text style={[st.ladderLabel, { color: Colors.textSecondary }]}>Entry</Text>
          <Text style={[st.ladderValue, { color: Colors.text }]}>
            {formatTradingPrice(symbol, data.entry)}
          </Text>
        </View>

        <View style={[st.ladderDivider, { backgroundColor: Colors.border }]} />

        <View style={st.ladderRow}>
          <View style={[st.ladderDot, { backgroundColor: Colors.danger }]} />
          <Text style={[st.ladderLabel, { color: Colors.textSecondary }]}>Stop Loss</Text>
          <Text style={[st.ladderValue, { color: Colors.danger }]}>
            {formatTradingPrice(symbol, data.stopLoss)}
          </Text>
        </View>

        <View style={[st.ladderMeta, { borderTopColor: Colors.border }]}>
          <Text style={[st.metaItem, { color: Colors.textMuted }]}>
            R:R <Text style={[st.metaVal, { color: Colors.text }]}>1:{(data.riskReward ?? 0).toFixed(2)}</Text>
          </Text>
          {data.riskPct != null && (
            <Text style={[st.metaItem, { color: Colors.textMuted }]}>
              Risk <Text style={[st.metaVal, { color: Colors.danger }]}>{data.riskPct.toFixed(2)}%</Text>
            </Text>
          )}
        </View>
      </View>

      {/* Per-strategy scores */}
      {data.scores && (
        <View style={[st.scoreCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
          <Text style={[st.scoreTitle, { color: Colors.textMuted }]}>STRATEGY SCORES</Text>
          <View style={st.scoreRow}>
            {([["s1", "Technical"], ["s2", "Multi-Factor"], ["s3", "Hybrid"]] as const).map(([k, name]) => {
              const val = data.scores?.[k];
              if (val == null) return null;
              const isPos = val >= 0;
              return (
                <View key={k} style={[st.scoreTile, { backgroundColor: isPos ? Colors.positiveDim : Colors.dangerDim, borderColor: isPos ? Colors.positive + "40" : Colors.danger + "40" }]}>
                  <Text style={[st.scoreTileKey, { color: isPos ? Colors.positive : Colors.danger }]}>{k.toUpperCase()}</Text>
                  <Text style={[st.scoreTileVal, { color: isPos ? Colors.positive : Colors.danger }]}>
                    {val > 0 ? "+" : ""}{val}
                  </Text>
                  <Text style={[st.scoreTileName, { color: Colors.textMuted }]}>{name}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Reasoning bullets */}
      {data.reasoning.length > 0 && (
        <View style={[st.reasonCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
          <Text style={[st.reasonTitle, { color: Colors.textMuted }]}>ANALYSIS</Text>
          {data.reasoning.map((bullet, i) => (
            <View key={i} style={st.bulletRow}>
              <View style={[st.bulletDot, { backgroundColor: dirColor }]} />
              <Text style={[st.bulletText, { color: Colors.textSecondary }]}>{bullet}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  subText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  heroCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroBadge: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 },
  heroBadgeText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#000" },
  heroConf: { fontSize: 18, fontFamily: "Inter_700Bold" },
  heroStrategy: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  heroBar: { height: 6, borderRadius: 3, overflow: "hidden" },
  heroBarFill: { height: "100%", borderRadius: 3 },
  intervals: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, borderRadius: 10, borderWidth: 1 },
  intervalLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  tfChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, borderWidth: 1 },
  tfText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  ladder: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 0 },
  ladderTitle: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginBottom: 10 },
  ladderRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  ladderDot: { width: 10, height: 10, borderRadius: 5 },
  ladderLabel: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  ladderValue: { fontSize: 15, fontFamily: "Inter_700Bold" },
  ladderDivider: { height: StyleSheet.hairlineWidth, marginVertical: 0 },
  ladderMeta: { flexDirection: "row", justifyContent: "space-around", paddingTop: 10, marginTop: 6, borderTopWidth: StyleSheet.hairlineWidth },
  metaItem: { fontSize: 12, fontFamily: "Inter_400Regular" },
  metaVal: { fontFamily: "Inter_700Bold" },
  scoreCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  scoreTitle: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  scoreRow: { flexDirection: "row", gap: 8 },
  scoreTile: { flex: 1, alignItems: "center", padding: 10, borderRadius: 10, borderWidth: 1, gap: 2 },
  scoreTileKey: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  scoreTileVal: { fontSize: 18, fontFamily: "Inter_700Bold" },
  scoreTileName: { fontSize: 9, fontFamily: "Inter_400Regular" },
  reasonCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  reasonTitle: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  bulletRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  bulletDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5, flexShrink: 0 },
  bulletText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
});

// ─── Indicators Tab ───────────────────────────────────────────────────────────

const INDICATOR_INFO: Record<string, { label: string; desc: string; format: (v: number) => string }> = {
  rsi:          { label: "RSI (14)",          desc: "Relative Strength Index. Above 70 = overbought, below 30 = oversold.",   format: (v) => v.toFixed(1) },
  macd:         { label: "MACD",             desc: "Trend-following momentum. Positive = bullish momentum.",                  format: (v) => v.toFixed(3) },
  macdSignal:   { label: "MACD Signal",      desc: "9-period EMA of MACD. Crossovers hint at direction changes.",             format: (v) => v.toFixed(3) },
  macdHistogram:{ label: "MACD Histogram",   desc: "MACD minus Signal. Positive bars = growing bullish momentum.",            format: (v) => v.toFixed(3) },
  ema12:        { label: "EMA 12",           desc: "Short-term trend. Price above EMA12 = short-term uptrend.",               format: (v) => v.toFixed(2) },
  ema26:        { label: "EMA 26",           desc: "Medium-term trend. Crossover of EMA12/26 generates signals.",             format: (v) => v.toFixed(2) },
  ema50:        { label: "EMA 50",           desc: "Intermediate trend. Key support/resistance level.",                        format: (v) => v.toFixed(2) },
  ema200:       { label: "EMA 200",          desc: "Long-term trend filter. Price above = bull market.",                       format: (v) => v.toFixed(2) },
  bbUpper:      { label: "Bollinger Upper",  desc: "Upper band (2σ). Price touching it signals potential reversal.",           format: (v) => v.toFixed(2) },
  bbMid:        { label: "Bollinger Mid",    desc: "20-period SMA. Midline support/resistance.",                               format: (v) => v.toFixed(2) },
  bbLower:      { label: "Bollinger Lower",  desc: "Lower band (2σ). Price touching it may signal oversold conditions.",       format: (v) => v.toFixed(2) },
  atr:          { label: "ATR (14)",         desc: "Average True Range. Measures volatility. Higher = larger price swings.",   format: (v) => v.toFixed(2) },
  roc:          { label: "ROC (14)",         desc: "Rate of Change %. Positive = price rising vs 14 bars ago.",               format: (v) => v.toFixed(2) + "%" },
};

function IndicatorsTab({ symbol, strategy }: { symbol: string; strategy: string }) {
  const Colors = useColors();

  const { data, isLoading, error } = useQuery<SignalResult>({
    queryKey: ["/api/trading/signals", symbol, strategy, "1d"],
    queryFn: () => apiFetch<SignalResult>(`/api/trading/signals/${encodeURIComponent(symbol)}`, { strategy, interval: "1d" }),
    staleTime: 30_000,
  });

  if (isLoading) {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={Colors.accent} size="large" /></View>;
  }
  if (error || !data) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
        <Ionicons name="alert-circle-outline" size={36} color={Colors.danger} />
        <Text style={{ color: Colors.textMuted, fontFamily: "Inter_400Regular" }}>Could not load indicators</Text>
      </View>
    );
  }

  const indicators = data.indicators;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      {Object.entries(INDICATOR_INFO).map(([key, info]) => {
        const val = indicators[key];
        if (val == null) return null;
        return (
          <View key={key} style={[ind.row, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
            <View style={ind.left}>
              <Text style={[ind.label, { color: Colors.text }]}>{info.label}</Text>
              <Text style={[ind.desc, { color: Colors.textMuted }]}>{info.desc}</Text>
            </View>
            <Text style={[ind.value, { color: Colors.accent }]}>{info.format(val)}</Text>
          </View>
        );
      })}
      <View style={{ height: 8 }} />
      <Text style={[ind.disclaimer, { color: Colors.textMuted }]}>
        Indicators computed on daily closes. Not financial advice.
      </Text>
    </ScrollView>
  );
}

const ind = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 12, borderWidth: 1, gap: 12 },
  left: { flex: 1, gap: 3 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  desc: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },
  value: { fontSize: 15, fontFamily: "Inter_700Bold", textAlign: "right", minWidth: 70 },
  disclaimer: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 12 },
});

// ─── Trade List Modal ──────────────────────────────────────────────────────────

interface TradeListModalProps {
  visible: boolean;
  onClose: () => void;
  stratKey: string;
  interval: string;
  trades: TradeRecord[];
  symbol: string;
}

function TradeListModal({ visible, onClose, stratKey, interval, trades, symbol }: TradeListModalProps) {
  const Colors = useColors();
  const insets = useSafeAreaInsets();
  const tlOnCloseRef = useRef(onClose);
  tlOnCloseRef.current = onClose;
  const tlPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5,
      onPanResponderRelease: (_, gs) => { if (gs.dy > 60) tlOnCloseRef.current(); },
    })
  ).current;

  const wins = trades.filter((t) => t.win).length;
  const losses = trades.length - wins;

  const renderTrade = ({ item: t }: { item: TradeRecord }) => {
    const isBuy = t.direction === "BUY";
    const dirColor = isBuy ? Colors.positive : Colors.danger;
    const retColor = t.win ? Colors.positive : Colors.danger;
    const sign = t.returnPct >= 0 ? "+" : "";
    return (
      <View style={[tl.tradeRow, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
        <View style={[tl.tradeNum, { backgroundColor: Colors.surfaceElevated }]}>
          <Text style={[tl.tradeNumText, { color: Colors.textMuted }]}>#{t.n}</Text>
        </View>
        <View style={[tl.dirBadge, { backgroundColor: dirColor + "22", borderColor: dirColor + "55" }]}>
          <Text style={[tl.dirText, { color: dirColor }]}>{t.direction}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
            <Text style={[tl.priceText, { color: Colors.textSecondary }]}>
              {formatTradingPrice(symbol, t.entryPrice)}
            </Text>
            <Ionicons name="arrow-forward" size={10} color={Colors.textMuted} />
            <Text style={[tl.priceText, { color: Colors.text }]}>
              {formatTradingPrice(symbol, t.exitPrice)}
            </Text>
          </View>
          <Text style={[tl.holdLabel, { color: Colors.textMuted }]}>
            5-bar hold
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 2 }}>
          <Text style={[tl.retText, { color: retColor }]}>
            {sign}{t.returnPct.toFixed(2)}%
          </Text>
          <View style={{ flexDirection: "row", gap: 3, alignItems: "center" }}>
            <Ionicons
              name={t.win ? "checkmark-circle" : "close-circle"}
              size={11}
              color={t.win ? Colors.positive : Colors.danger}
            />
            <Text style={[tl.winLossText, { color: t.win ? Colors.positive : Colors.danger }]}>
              {t.win ? "Win" : "Loss"}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={tl.backdrop} onPress={onClose} />
      <View
        style={[
          tl.sheet,
          {
            backgroundColor: Colors.background,
            borderColor: Colors.border,
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
        {/* Handle — drag down to dismiss */}
        <View style={tl.handleWrap} {...tlPan.panHandlers}>
          <View style={[tl.handle, { backgroundColor: Colors.border }]} />
        </View>

        {/* Header */}
        <View style={[tl.sheetHeader, { borderBottomColor: Colors.border }]}>
          <View style={{ gap: 2 }}>
            <Text style={[tl.sheetTitle, { color: Colors.text }]}>
              S{stratKey} · {STRATEGY_NAMES[stratKey] ?? stratKey}
            </Text>
            <Text style={[tl.sheetSub, { color: Colors.textMuted }]}>
              {interval} timeframe · {trades.length} trades · {wins}W {losses}L
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={7} style={[tl.closeBtn, { backgroundColor: Colors.surfaceElevated }]}>
            <Ionicons name="close" size={18} color={Colors.textSecondary} />
          </Pressable>
        </View>

        {/* Column headers */}
        <View style={[tl.colHeader, { backgroundColor: Colors.surfaceElevated }]}>
          <Text style={[tl.colText, { color: Colors.textMuted, width: 30 }]}>#</Text>
          <Text style={[tl.colText, { color: Colors.textMuted, width: 46 }]}>Dir</Text>
          <Text style={[tl.colText, { color: Colors.textMuted, flex: 1 }]}>Entry → Exit</Text>
          <Text style={[tl.colText, { color: Colors.textMuted, width: 64, textAlign: "right" }]}>Return</Text>
        </View>

        {trades.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Ionicons name="bar-chart-outline" size={36} color={Colors.textMuted} />
            <Text style={{ color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 13 }}>
              No trades for this timeframe
            </Text>
          </View>
        ) : (
          <FlatList
            data={trades}
            keyExtractor={(t) => String(t.n)}
            renderItem={renderTrade}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6 }}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </Modal>
  );
}

const tl = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "75%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  handleWrap: { alignSelf: "stretch", alignItems: "center", paddingVertical: 8 },
  handle: { width: 38, height: 4, borderRadius: 2 },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  sheetSub: { fontSize: 11, fontFamily: "Inter_400Regular" },
  closeBtn: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  colHeader: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 6,
    alignItems: "center",
  },
  colText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  tradeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tradeNum: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  tradeNumText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  dirBadge: {
    width: 40,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
  },
  dirText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  priceText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  holdLabel: { fontSize: 9, fontFamily: "Inter_400Regular" },
  retText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  winLossText: { fontSize: 9, fontFamily: "Inter_600SemiBold" },
});

// ─── Backtest Tab ─────────────────────────────────────────────────────────────

function BacktestTab({ symbol }: { symbol: string }) {
  const Colors = useColors();
  const [interval, setIntervalState] = useState<HistoryInterval>("1d");
  const [selectedStrat, setSelectedStrat] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery<BacktestResponse>({
    queryKey: ["/api/trading/backtest", symbol, interval],
    queryFn: () => apiFetch<BacktestResponse>(`/api/trading/backtest/${encodeURIComponent(symbol)}`, { interval }),
    staleTime: 10 * 60_000,
  });

  if (isLoading) {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={Colors.accent} size="large" /></View>;
  }
  if (error || !data) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
        <Ionicons name="alert-circle-outline" size={36} color={Colors.danger} />
        <Text style={{ color: Colors.textMuted, fontFamily: "Inter_400Regular" }}>Could not load backtest</Text>
        <Pressable onPress={() => refetch()} style={[bt.retryBtn, { backgroundColor: Colors.accentDim }]}>
          <Text style={{ color: Colors.accent, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const selectedData = selectedStrat ? data.strategies[selectedStrat] : null;

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Interval selector */}
        <View style={[bt.intervals, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
          <Text style={[bt.intervalLabel, { color: Colors.textMuted }]}>Timeframe:</Text>
          {(["1m","1h","4h","1d"] as HistoryInterval[]).map((tf) => {
            const active = tf === interval;
            return (
              <Pressable key={tf} onPress={() => setIntervalState(tf)} hitSlop={{ top: 9, bottom: 9 }} style={[bt.tfChip, { backgroundColor: active ? Colors.accentDim : Colors.surfaceElevated, borderColor: active ? Colors.accent + "60" : Colors.border }]} {...a11yTab(tf, active)}>
                <Text style={[bt.tfText, { color: active ? Colors.accent : Colors.textSecondary }]}>{tf}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[bt.sectionHead, { color: Colors.textMuted }]}>
          Walk-forward backtest (70/30 split) · {data.symbol}
        </Text>

        {/* Comparison table */}
        <View style={[bt.tableHeader, { backgroundColor: Colors.surfaceElevated, borderColor: Colors.border }]}>
          <Text style={[bt.thCell, { color: Colors.textMuted, flex: 1.5 }]}>Strategy</Text>
          {["Win%", "Return", "MaxDD", "Sharpe", "Trades"].map((h) => (
            <Text key={h} style={[bt.thCell, { color: Colors.textMuted }]}>{h}</Text>
          ))}
          <View style={{ width: 18 }} />
        </View>

        {Object.entries(data.strategies).map(([key, s]) => {
          const isPos = s.totalReturn >= 0;
          return (
            <Pressable
              key={key}
              onPress={() => setSelectedStrat(key)}
              style={({ pressed }) => [
                bt.tableRow,
                { backgroundColor: pressed ? Colors.surfaceElevated : Colors.surface, borderColor: Colors.border },
              ]}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel={`${STRATEGY_NAMES[key] ?? key}, win rate ${s.winRate.toFixed(0)}%, return ${s.totalReturn >= 0 ? "+" : ""}${s.totalReturn.toFixed(1)}%, drawdown ${s.maxDrawdown.toFixed(1)}%, Sharpe ${s.sharpe.toFixed(2)}, ${s.trades} trades`}
              accessibilityHint="Tap to view individual trades"
            >
              <View style={{ flex: 1.5, gap: 2 }}>
                <Text style={[bt.stratKey, { color: Colors.accent }]}>S{key}</Text>
                <Text style={[bt.stratName, { color: Colors.textMuted }]}>{STRATEGY_NAMES[key] ?? key}</Text>
              </View>
              <Text style={[bt.tdCell, { color: s.winRate >= 50 ? Colors.positive : Colors.danger }]}>
                {s.winRate.toFixed(0)}%
              </Text>
              <Text style={[bt.tdCell, { color: isPos ? Colors.positive : Colors.danger }]}>
                {isPos ? "+" : ""}{s.totalReturn.toFixed(1)}%
              </Text>
              <Text style={[bt.tdCell, { color: Colors.warning }]}>
                {s.maxDrawdown.toFixed(1)}%
              </Text>
              <Text style={[bt.tdCell, { color: Colors.text }]}>
                {s.sharpe.toFixed(2)}
              </Text>
              <Text style={[bt.tdCell, { color: Colors.textSecondary }]}>
                {s.trades}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} style={{ width: 18 }} />
            </Pressable>
          );
        })}

        <Text style={[bt.tapHint, { color: Colors.textMuted }]}>
          Tap a strategy row to see individual trades
        </Text>

        <Text style={[bt.disclaimer, { color: Colors.textMuted }]}>
          Past performance does not guarantee future results. Not financial advice.
        </Text>
      </ScrollView>

      {/* Trade list modal */}
      {selectedData && (
        <TradeListModal
          visible={!!selectedStrat}
          onClose={() => setSelectedStrat(null)}
          stratKey={selectedStrat!}
          interval={interval}
          trades={selectedData.tradeLog ?? []}
          symbol={symbol}
        />
      )}
    </>
  );
}

const bt = StyleSheet.create({
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  intervals: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, borderRadius: 10, borderWidth: 1 },
  intervalLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  tfChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, borderWidth: 1 },
  tfText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  sectionHead: { fontSize: 11, fontFamily: "Inter_500Medium", textAlign: "center" },
  tableHeader: { flexDirection: "row", padding: 10, borderRadius: 10, borderWidth: 1, gap: 4 },
  thCell: { fontSize: 10, fontFamily: "Inter_600SemiBold", minWidth: 44, textAlign: "right" },
  tableRow: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 12, borderWidth: 1, gap: 4 },
  stratKey: { fontSize: 12, fontFamily: "Inter_700Bold" },
  stratName: { fontSize: 10, fontFamily: "Inter_400Regular" },
  tdCell: { fontSize: 12, fontFamily: "Inter_600SemiBold", minWidth: 44, textAlign: "right" },
  tapHint: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center" },
  disclaimer: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 12, marginTop: 4 },
});

// ─── News Tab ─────────────────────────────────────────────────────────────────

function NewsTab({ symbol }: { symbol: string }) {
  const Colors = useColors();

  const { data, isLoading, error, refetch } = useQuery<NewsResponse>({
    queryKey: ["/api/trading/news", symbol],
    queryFn: () => apiFetch<NewsResponse>(`/api/trading/news/${encodeURIComponent(symbol)}`),
    staleTime: 15 * 60_000,
  });

  if (isLoading) {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={Colors.accent} size="large" /></View>;
  }
  if (error || !data) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
        <Ionicons name="alert-circle-outline" size={36} color={Colors.danger} />
        <Text style={{ color: Colors.textMuted, fontFamily: "Inter_400Regular" }}>Could not load news</Text>
        <Pressable onPress={() => refetch()} style={[{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.accentDim }]}>
          <Text style={{ color: Colors.accent, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const agg = data.aggregateSentiment;
  const aggColor = sentimentColor(agg);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Aggregate sentiment badge */}
      <View style={[nt.aggCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
        <View style={nt.aggLeft}>
          <Text style={[nt.aggLabel, { color: Colors.textMuted }]}>Aggregate Sentiment</Text>
          <Text style={[nt.aggVal, { color: aggColor }]}>
            {agg > 0 ? "+" : ""}{agg}
          </Text>
        </View>
        <View style={[nt.aggBadge, { backgroundColor: aggColor + "22", borderColor: aggColor + "50" }]}>
          <Text style={[nt.aggBadgeText, { color: aggColor }]}>{sentimentLabel(agg)}</Text>
        </View>
      </View>

      {data.articles.length === 0 ? (
        <View style={{ alignItems: "center", paddingTop: 40, gap: 10 }}>
          <Ionicons name="newspaper-outline" size={36} color={Colors.textMuted} />
          <Text style={{ color: Colors.textMuted, fontFamily: "Inter_400Regular" }}>No recent news found</Text>
        </View>
      ) : (
        data.articles.map((article, i) => {
          const sc = sentimentColor(article.sentiment);
          return (
            <Pressable
              key={i}
              style={({ pressed }) => [nt.articleCard, { backgroundColor: Colors.surface, borderColor: Colors.border }, pressed && { opacity: 0.8 }]}
              onPress={() => openLink(article.url ?? article.link ?? "")}
              accessible={true}
              accessibilityRole="link"
              accessibilityLabel={`${article.title}${article.publisher ? `, ${article.publisher}` : ""}${article.publishedAt ? `, ${formatRelativeTime(article.publishedAt)}` : ""}, sentiment ${article.sentiment > 0 ? "positive" : article.sentiment < 0 ? "negative" : "neutral"}`}
              accessibilityHint="Opens article in browser"
            >
              <View style={nt.articleRow}>
                <Text style={[nt.articleTitle, { color: Colors.text }]} numberOfLines={3}>
                  {article.title}
                </Text>
                <View style={[nt.sentBadge, { backgroundColor: sc + "22", borderColor: sc + "50" }]}>
                  <Text style={[nt.sentText, { color: sc }]}>
                    {article.sentiment > 0 ? "+" : ""}{article.sentiment}
                  </Text>
                </View>
              </View>
              <View style={nt.articleMeta}>
                <Text style={[nt.publisher, { color: Colors.textMuted }]}>{article.publisher}</Text>
                {article.publishedAt && (
                  <Text style={[nt.timeAgo, { color: Colors.textMuted }]}>
                    · {formatRelativeTime(article.publishedAt)}
                  </Text>
                )}
                <View style={{ flex: 1 }} />
                <Ionicons name="open-outline" size={12} color={Colors.textMuted} />
              </View>
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

const nt = StyleSheet.create({
  aggCard: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 12, borderWidth: 1 },
  aggLeft: { flex: 1, gap: 2 },
  aggLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  aggVal: { fontSize: 24, fontFamily: "Inter_700Bold" },
  aggBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  aggBadgeText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  articleCard: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 8 },
  articleRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  articleTitle: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 19 },
  sentBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, borderWidth: 1, minWidth: 44, alignItems: "center" },
  sentText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  articleMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  publisher: { fontSize: 11, fontFamily: "Inter_400Regular" },
  timeAgo: { fontSize: 11, fontFamily: "Inter_400Regular" },
});

// ─── Multi-timeframe Sparkline Row ────────────────────────────────────────────

const TF_CANDLE_COUNT: Record<"1h" | "4h" | "1d", number> = {
  "1h": 24,
  "4h": 20,
  "1d": 30,
};

function MiniSparkline({
  prices,
  color,
  width,
}: {
  prices: number[];
  color: string;
  width: number;
}) {
  const H = 44;
  const PAD = 3;

  if (prices.length < 2) {
    return (
      <Svg width={width} height={H}>
        <Line
          x1={PAD}
          y1={H / 2}
          x2={width - PAD}
          y2={H / 2}
          stroke={color}
          strokeWidth={1.5}
          strokeOpacity={0.35}
        />
      </Svg>
    );
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const pts = prices
    .map((p, i) => {
      const x = PAD + (i / (prices.length - 1)) * (width - PAD * 2);
      const y = H - PAD - ((p - min) / range) * (H - PAD * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <Svg width={width} height={H}>
      <Polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function TimeframeSparklineRow({ symbol }: { symbol: string }) {
  const Colors = useColors();
  const screenW = Dimensions.get("window").width;
  const PANEL_W = Math.floor((screenW - 32) / 3);
  const timeframes = ["1h", "4h", "1d"] as const;

  const queries = useQueries({
    queries: timeframes.map((tf) => ({
      queryKey: ["/api/trading/sparkline-tf", symbol, tf],
      queryFn: async (): Promise<number[]> => {
        const url = new URL(
          `/api/trading/history/${encodeURIComponent(symbol)}`,
          getApiUrl()
        );
        url.searchParams.set("interval", tf);
        const res = await fetch(url.toString());
        if (!res.ok) return [];
        const json = await res.json();
        const candles: Candle[] = json.candles ?? [];
        return candles.slice(-TF_CANDLE_COUNT[tf]).map((c) => c.close);
      },
      staleTime: 4 * 60 * 60_000,
    })),
  });

  return (
    <View
      style={[
        tsr.row,
        { backgroundColor: Colors.surface, borderBottomColor: Colors.border },
      ]}
    >
      {timeframes.map((tf, i) => {
        const prices = queries[i]?.data ?? [];
        const loading = queries[i]?.isLoading ?? false;
        const hasData = prices.length >= 2;
        const isUp = hasData ? prices[prices.length - 1] >= prices[0] : true;
        const changeColor = hasData
          ? isUp
            ? Colors.positive
            : Colors.danger
          : Colors.textMuted;
        const changePct =
          hasData && prices[0] !== 0
            ? ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100
            : null;

        return (
          <React.Fragment key={tf}>
            {i > 0 && (
              <View
                style={[tsr.divider, { backgroundColor: Colors.border }]}
              />
            )}
            <View style={[tsr.panel, { width: PANEL_W }]}>
              <View style={tsr.labelRow}>
                <Text style={[tsr.tfLabel, { color: Colors.textSecondary }]}>
                  {tf.toUpperCase()}
                </Text>
                {loading ? (
                  <ActivityIndicator size={10} color={Colors.textMuted} />
                ) : changePct !== null ? (
                  <Text
                    style={[tsr.changePct, { color: changeColor }]}
                  >
                    {isUp ? "+" : ""}
                    {changePct.toFixed(2)}%
                  </Text>
                ) : null}
              </View>
              {loading ? (
                <View
                  style={[
                    tsr.placeholder,
                    { backgroundColor: Colors.border },
                  ]}
                />
              ) : (
                <MiniSparkline
                  prices={prices}
                  color={changeColor}
                  width={PANEL_W - 12}
                />
              )}
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

const tsr = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 52,
    marginHorizontal: 4,
  },
  panel: { alignItems: "center", paddingHorizontal: 6 },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 3,
  },
  tfLabel: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },
  changePct: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  placeholder: { width: "100%", height: 2, borderRadius: 1, marginTop: 21 },
});

// ─── Asset Header ─────────────────────────────────────────────────────────────

function AssetHeader({
  topInset,
  quote,
  onBack,
  onAlertPress,
  hasAlert,
}: {
  topInset: number;
  quote?: QuoteItem;
  onBack: () => void;
  onAlertPress: () => void;
  hasAlert: boolean;
}) {
  const Colors = useColors();
  const up = (quote?.changePercent ?? 0) >= 0;

  return (
    <View
      style={[
        ah.wrap,
        {
          paddingTop: topInset + (Platform.OS === "web" ? 67 : 10),
          backgroundColor: Colors.background,
          borderBottomColor: Colors.border,
        },
      ]}
    >
      <View style={ah.row}>
        <Pressable onPress={onBack} style={ah.back} hitSlop={8} {...a11yButton("Go back")}>
          <Ionicons name="chevron-back" size={22} color={Colors.accent} />
        </Pressable>

        <Text style={ah.emoji}>{quote?.flag ?? "📊"}</Text>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[ah.name, { color: Colors.text }]} numberOfLines={1}>
            {quote?.name ?? "—"}
          </Text>
          <Text style={[ah.symbol, { color: Colors.textMuted }]}>{quote?.symbol}</Text>
        </View>

        {quote && (
          <View style={ah.priceWrap}>
            <Text style={[ah.price, { color: Colors.text }]}>
              {formatTradingPrice(quote.symbol, quote.price)}
            </Text>
            <Text style={[ah.change, { color: up ? Colors.positive : Colors.danger }]}>
              {formatChangePct(quote.changePercent)}
            </Text>
          </View>
        )}

        <Pressable
          onPress={onAlertPress}
          hitSlop={8}
          style={ah.bellBtn}
          {...a11yButton(hasAlert ? "Edit price alert" : "Set price alert")}
        >
          <Ionicons
            name={hasAlert ? "notifications" : "notifications-outline"}
            size={22}
            color={hasAlert ? Colors.accent : Colors.textMuted}
          />
        </Pressable>
      </View>
    </View>
  );
}

const ah = StyleSheet.create({
  wrap: { paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  back: { padding: 4 },
  emoji: { fontSize: 26 },
  name: { fontSize: 16, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  symbol: { fontSize: 11, fontFamily: "Inter_400Regular" },
  priceWrap: { alignItems: "flex-end" },
  price: { fontSize: 16, fontFamily: "Inter_700Bold" },
  change: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  bellBtn: { padding: 4 },
});

// ─── Alert Modal ──────────────────────────────────────────────────────────────

function AlertModal({
  visible,
  onClose,
  symbol,
  name,
  currentPrice,
}: {
  visible: boolean;
  onClose: () => void;
  symbol: string;
  name: string;
  currentPrice: number | null;
}) {
  const Colors = useColors();
  const insets = useSafeAreaInsets();
  const { alerts, addAlert, removeAlert, updateAlert } = useAlerts();
  const [targetPrice, setTargetPrice] = useState("");
  const [direction, setDirection] = useState<"above" | "below">("above");

  const existingAlert = alerts.find((a) => a.symbol === symbol);

  useEffect(() => {
    if (visible) {
      if (existingAlert) {
        setTargetPrice(String(existingAlert.targetPrice));
        setDirection(existingAlert.direction);
      } else if (currentPrice != null) {
        setTargetPrice(String(currentPrice.toFixed(2)));
        setDirection("above");
      } else {
        setTargetPrice("");
        setDirection("above");
      }
    }
  }, [visible, existingAlert, currentPrice]);

  const handleSet = async () => {
    const parsed = parseFloat(targetPrice.replace(/,/g, ""));
    if (isNaN(parsed) || parsed <= 0) return;
    if (existingAlert) {
      await updateAlert(existingAlert.id, { targetPrice: parsed, direction });
    } else {
      await addAlert({ symbol, name, targetPrice: parsed, direction });
    }
    onClose();
  };

  const handleRemove = async () => {
    if (existingAlert) await removeAlert(existingAlert.id);
    onClose();
  };

  const isValid = !isNaN(parseFloat(targetPrice.replace(/,/g, ""))) && parseFloat(targetPrice.replace(/,/g, "")) > 0;

  const amOnCloseRef = useRef(onClose);
  amOnCloseRef.current = onClose;
  const amPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5,
      onPanResponderRelease: (_, gs) => { if (gs.dy > 60) amOnCloseRef.current(); },
    })
  ).current;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={am.overlay} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={am.kav}
        >
          <Pressable
            style={[
              am.sheet,
              {
                backgroundColor: Colors.surface,
                borderColor: Colors.border,
                paddingBottom: insets.bottom + 20,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Drag handle — drag down to dismiss */}
            <View style={am.handleWrap} {...amPan.panHandlers}>
              <View style={[am.handle, { backgroundColor: Colors.border }]} />
            </View>
            {/* Title row */}
            <View style={am.titleRow}>
              <View style={[am.titleIcon, { backgroundColor: Colors.accentDim }]}>
                <Ionicons name="notifications" size={18} color={Colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[am.title, { color: Colors.text }]}>Set Price Alert</Text>
                <Text style={[am.subtitle, { color: Colors.textMuted }]}>{name}</Text>
              </View>
              <Pressable onPress={onClose} hitSlop={10} {...a11yButton("Close alert")}>
                <Ionicons name="close" size={20} color={Colors.textMuted} />
              </Pressable>
            </View>

            {/* Direction picker */}
            <Text style={[am.label, { color: Colors.textMuted }]}>Alert me when price goes</Text>
            <View style={am.dirRow}>
              {(["above", "below"] as const).map((d) => {
                const active = direction === d;
                const color = d === "above" ? Colors.positive : Colors.danger;
                const dimColor = d === "above" ? Colors.positiveDim : Colors.dangerDim;
                return (
                  <Pressable
                    key={d}
                    onPress={() => setDirection(d)}
                    style={[
                      am.dirBtn,
                      {
                        backgroundColor: active ? dimColor : Colors.surfaceElevated,
                        borderColor: active ? color + "60" : Colors.border,
                      },
                    ]}
                    {...a11yTab(d === "above" ? "Above target" : "Below target", active)}
                  >
                    <Ionicons
                      name={d === "above" ? "trending-up" : "trending-down"}
                      size={16}
                      color={active ? color : Colors.textMuted}
                    />
                    <Text
                      style={[
                        am.dirText,
                        { color: active ? color : Colors.textSecondary },
                      ]}
                    >
                      {d === "above" ? "Above" : "Below"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Price input */}
            <Text style={[am.label, { color: Colors.textMuted }]}>Target price</Text>
            <View
              style={[
                am.inputWrap,
                {
                  backgroundColor: Colors.surfaceElevated,
                  borderColor: Colors.border,
                },
              ]}
            >
              <Text style={[am.inputPrefix, { color: Colors.textMuted }]}>$</Text>
              <TextInput
                style={[am.input, { color: Colors.text }]}
                value={targetPrice}
                onChangeText={setTargetPrice}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={Colors.textMuted}
                autoFocus
                selectTextOnFocus
              />
            </View>

            {currentPrice != null && (
              <Text style={[am.hint, { color: Colors.textMuted }]}>
                Current price: {formatTradingPrice(symbol, currentPrice)}
              </Text>
            )}

            {/* Action buttons */}
            <View style={am.actions}>
              {existingAlert && (
                <Pressable
                  onPress={handleRemove}
                  style={[am.removeBtn, { backgroundColor: Colors.dangerDim, borderColor: Colors.danger + "40" }]}
                  {...a11yButton("Remove alert")}
                >
                  <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                  <Text style={[am.removeBtnText, { color: Colors.danger }]}>Remove Alert</Text>
                </Pressable>
              )}
              <Pressable
                onPress={handleSet}
                disabled={!isValid}
                style={[
                  am.setBtn,
                  {
                    backgroundColor: isValid ? Colors.accent : Colors.surfaceElevated,
                    opacity: isValid ? 1 : 0.5,
                  },
                ]}
                {...a11yButton(existingAlert ? "Update alert" : "Set alert", isValid ? undefined : "Enter a valid target price first")}
                accessibilityState={{ disabled: !isValid }}
              >
                <Ionicons name="notifications" size={16} color={isValid ? Colors.background : Colors.textMuted} />
                <Text style={[am.setBtnText, { color: isValid ? Colors.background : Colors.textMuted }]}>
                  {existingAlert ? "Update Alert" : "Set Alert"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const am = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  kav: { justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 0,
    paddingHorizontal: 20,
    gap: 12,
  },
  handleWrap: { alignSelf: "stretch", alignItems: "center", paddingVertical: 8 },
  handle: { width: 38, height: 4, borderRadius: 2 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 4,
  },
  titleIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 16, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  label: { fontSize: 11, fontFamily: "Inter_500Medium", letterSpacing: 0.4 },
  dirRow: { flexDirection: "row", gap: 10 },
  dirBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  dirText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 50,
  },
  inputPrefix: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    marginRight: 6,
  },
  input: {
    flex: 1,
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    height: 50,
  },
  hint: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: -4 },
  actions: { gap: 10, marginTop: 4 },
  setBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  setBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  removeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  removeBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});

// ─── Root screen ──────────────────────────────────────────────────────────────

export default function AssetDetailScreen() {
  const { symbol: rawSymbol } = useLocalSearchParams<{ symbol: string }>();
  const symbol = Array.isArray(rawSymbol) ? rawSymbol[0] : (rawSymbol ?? "");
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const Colors = useColors();
  const { strategy } = useStrategy();
  const { hasAlertForSymbol } = useAlerts();
  const [activeTab, setActiveTab] = useState<DetailTab>("chart");
  const [alertModalVisible, setAlertModalVisible] = useState(false);

  // Fetch quote for the header
  const { data: quotesData } = useQuery<QuotesResponse>({
    queryKey: ["/api/trading/quotes"],
    staleTime: 10_000,
  });
  const quote = quotesData?.quotes.find((q) => q.symbol === symbol);

  const bottomInset = insets.bottom + (Platform.OS === "web" ? 34 : 0);
  const hasAlert = hasAlertForSymbol(symbol);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <AssetHeader
        topInset={insets.top}
        quote={quote}
        onBack={() => router.back()}
        onAlertPress={() => setAlertModalVisible(true)}
        hasAlert={hasAlert}
      />
      <TimeframeSparklineRow symbol={symbol} />
      <DetailTabBar active={activeTab} onChange={setActiveTab} />

      <View style={{ flex: 1, paddingBottom: bottomInset }}>
        {activeTab === "chart"      && <ChartTab symbol={symbol} />}
        {activeTab === "signal"     && <SignalTab symbol={symbol} strategy={strategy} />}
        {activeTab === "indicators" && <IndicatorsTab symbol={symbol} strategy={strategy} />}
        {activeTab === "backtest"   && <BacktestTab symbol={symbol} />}
        {activeTab === "news"       && <NewsTab symbol={symbol} />}
      </View>

      <Text style={asc.disclaimer}>
        Prices and signals are for informational purposes only and do not constitute financial advice.
      </Text>

      <AlertModal
        visible={alertModalVisible}
        onClose={() => setAlertModalVisible(false)}
        symbol={symbol}
        name={quote?.name ?? symbol}
        currentPrice={quote?.price ?? null}
      />
    </View>
  );
}

const asc = StyleSheet.create({
  disclaimer: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#6E7A8F",
    textAlign: "center",
    paddingHorizontal: 16,
    paddingVertical: 6,
    opacity: 0.8,
  },
});
