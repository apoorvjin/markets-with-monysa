import React, { useState, useEffect, useCallback, useMemo } from "react";
import { a11yButton, a11yTab } from "@/utils/accessibility";
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import WebView from "react-native-webview";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

// ─── Types ────────────────────────────────────────────────────────────────────

type ChartRange = "1mo" | "3mo" | "6mo" | "1y" | "5y";

interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
}

interface ChartData {
  candles: Candle[];
  currency: string;
  symbol: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  symbol: string;
  name: string;
  flag?: string;
  changePercent?: number;
  price?: number;
  type: "indices" | "commodities" | "forex";
}

// ─── Range buttons config ─────────────────────────────────────────────────────

const RANGES: { label: string; value: ChartRange }[] = [
  { label: "1M", value: "1mo" },
  { label: "3M", value: "3mo" },
  { label: "6M", value: "6mo" },
  { label: "1Y", value: "1y"  },
  { label: "5Y", value: "5y"  },
];

// ─── Build candlestick chart HTML ─────────────────────────────────────────────
// Uses Lightweight Charts v4 (MIT) via jsdelivr CDN.
// All OHLCV data is embedded as JSON — no external API calls from within the WebView.

function buildChartHtml(candles: Candle[], currency: string): string {
  const candlesJson = JSON.stringify(
    candles.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }))
  );
  const volumeJson = JSON.stringify(
    candles
      .filter(c => c.volume != null && c.volume > 0)
      .map(c => ({
        time:  c.time,
        value: c.volume,
        color: (c.close ?? 0) >= (c.open ?? 0) ? "#00D4AA33" : "#FF4D6A33",
      }))
  );

  return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:#0D1117;width:100%;height:100%;overflow:hidden}
#chart{position:absolute;inset:0}
#ohlc{position:absolute;top:8px;left:12px;font:11px/1.6 monospace;pointer-events:none;z-index:5;max-width:92%}
#curr{position:absolute;bottom:7px;right:10px;font:9px monospace;color:#1E2A3D;letter-spacing:1.5px}
#errbox{position:absolute;inset:0;display:none;align-items:center;justify-content:center;color:#FF4D6A;font:13px sans-serif;padding:24px;text-align:center}
</style>
</head><body>
<div id="chart"></div>
<div id="ohlc"></div>
<div id="curr">${currency.toUpperCase()}</div>
<div id="errbox"></div>
<script src="https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js"></script>
<script>
try{
  var UP='#00D4AA',DN='#FF4D6A',GR='#1E2A3D',TX='#5A6478',BG='#0D1117';
  var chart=LightweightCharts.createChart(document.getElementById('chart'),{
    layout:{background:{type:'solid',color:BG},textColor:TX},
    grid:{vertLines:{color:GR},horzLines:{color:GR}},
    crosshair:{mode:LightweightCharts.CrosshairMode.Normal},
    rightPriceScale:{borderColor:GR,scaleMargins:{top:0.08,bottom:0.18}},
    timeScale:{borderColor:GR,timeVisible:true,secondsVisible:false,fixLeftEdge:true,fixRightEdge:true},
    width:window.innerWidth,height:window.innerHeight
  });

  var cs=chart.addCandlestickSeries({
    upColor:UP,downColor:DN,
    borderUpColor:UP,borderDownColor:DN,
    wickUpColor:UP,wickDownColor:DN
  });
  cs.setData(${candlesJson});

  var vol=${volumeJson};
  if(vol.length>0){
    var vs=chart.addHistogramSeries({
      priceFormat:{type:'volume'},priceScaleId:'vol'
    });
    chart.priceScale('vol').applyOptions({scaleMargins:{top:0.85,bottom:0}});
    vs.setData(vol);
  }

  chart.timeScale().fitContent();
  window.addEventListener('resize',function(){
    chart.applyOptions({width:window.innerWidth,height:window.innerHeight});
  });

  var ohlcEl=document.getElementById('ohlc');
  chart.subscribeCrosshairMove(function(p){
    if(!p||!p.point){ohlcEl.innerHTML='';return;}
    var d=p.seriesData&&p.seriesData.get(cs);
    if(!d){ohlcEl.innerHTML='';return;}
    var col=d.close>=d.open?UP:DN;
    ohlcEl.innerHTML='<span style="color:'+col+'">'+
      'O\u00A0'+d.open.toFixed(2)+'\u00A0\u00A0'+
      'H\u00A0'+d.high.toFixed(2)+'\u00A0\u00A0'+
      'L\u00A0'+d.low.toFixed(2)+'\u00A0\u00A0'+
      'C\u00A0'+d.close.toFixed(2)+'</span>';
  });
}catch(e){
  var b=document.getElementById('errbox');
  b.style.display='flex';b.textContent='Chart error: '+e.message;
}
</script>
</body></html>`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChartModal({
  visible,
  onClose,
  symbol,
  name,
  flag,
  changePercent,
  type,
}: Props) {
  const insets  = useSafeAreaInsets();
  const [range, setRange]         = useState<ChartRange>("3mo");
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [fetching, setFetching]   = useState(false);
  const [webLoading, setWebLoading] = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const up          = (changePercent ?? 0) >= 0;
  const changeColor = up ? Colors.positive : Colors.danger;
  const typeLabel   = type === "forex" ? "Forex" : type === "commodities" ? "Commodity" : "Index";

  const fetchData = useCallback(async () => {
    if (!symbol) return;
    setFetching(true);
    setError(null);
    setWebLoading(true);
    try {
      const base = getApiUrl();
      const url  = new URL(`/api/chart/${encodeURIComponent(symbol)}`, base);
      url.searchParams.set("range", range);
      const resp = await fetch(url.toString());
      if (!resp.ok) throw new Error(`Failed (${resp.status})`);
      const data: ChartData = await resp.json();
      if (!data.candles || data.candles.length === 0) throw new Error("No chart data available");
      setChartData(data);
    } catch (e: any) {
      setError(e?.message ?? "Could not load chart data");
    } finally {
      setFetching(false);
    }
  }, [symbol, range]);

  useEffect(() => {
    if (visible) {
      fetchData();
    } else {
      setChartData(null);
      setError(null);
      setFetching(false);
    }
  }, [visible, fetchData]);

  const chartHtml = useMemo(() => {
    if (!chartData || chartData.candles.length === 0) return null;
    return buildChartHtml(chartData.candles, chartData.currency);
  }, [chartData]);

  const showLoading = fetching || (!!chartHtml && webLoading);

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              {flag ? <Text style={styles.flag}>{flag}</Text> : null}
              <View style={styles.titleCol}>
                <Text style={styles.name} numberOfLines={1}>{name}</Text>
                <View style={styles.metaRow}>
                  <View style={styles.typeBadge}>
                    <Ionicons name="bar-chart-outline" size={9} color={Colors.accent} />
                    <Text style={styles.typeBadgeText}>{typeLabel}</Text>
                  </View>
                  <Text style={styles.symbolText}>{symbol}</Text>
                  {changePercent !== undefined && (
                    <Text style={[styles.changePct, { color: changeColor }]}>
                      {up ? "▲" : "▼"} {Math.abs(changePercent).toFixed(2)}%
                    </Text>
                  )}
                </View>
              </View>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8} {...a11yButton("Close chart")}>
              <Ionicons name="close" size={20} color={Colors.textMuted} />
            </Pressable>
          </View>

          {/* Range buttons */}
          <View style={styles.rangeRow}>
            {RANGES.map(r => {
              const active = r.value === range;
              return (
                <Pressable
                  key={r.value}
                  onPress={() => setRange(r.value)}
                  style={[styles.rangeBtn, active && styles.rangeBtnActive]}
                  {...a11yTab(r.label, active)}
                >
                  <Text style={[styles.rangeBtnText, active && styles.rangeBtnTextActive]}>
                    {r.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── Chart area ─────────────────────────────────────────────── */}
        <View style={styles.chartContainer}>
          {showLoading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color={Colors.accent} size="large" />
              <Text style={styles.loadingText}>
                {fetching ? "Fetching data…" : "Rendering chart…"}
              </Text>
            </View>
          )}

          {error && !fetching && (
            <View style={styles.errorOverlay}>
              <Ionicons name="alert-circle-outline" size={36} color={Colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
              <Pressable onPress={fetchData} style={styles.retryBtn} {...a11yButton("Try again", "Retry loading the chart")}>
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          )}

          {chartHtml && !error && (
            <WebView
              source={{ html: chartHtml, baseUrl: "https://cdn.jsdelivr.net" }}
              style={styles.webview}
              onLoadStart={() => setWebLoading(true)}
              onLoadEnd={() => setWebLoading(false)}
              onLoad={() => setWebLoading(false)}
              onError={() => { setWebLoading(false); setError("Chart failed to render"); }}
              javaScriptEnabled
              domStorageEnabled
              scrollEnabled={false}
              mixedContentMode="always"
              originWhitelist={["*"]}
              allowsLinkPreview={false}
            />
          )}
        </View>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 4 }]}>
          <Ionicons name="analytics-outline" size={11} color={Colors.textMuted} />
          <Text style={styles.footerText}>
            Yahoo Finance · Lightweight Charts (MIT) · 1h cache
          </Text>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0D1117",
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: "#0D1117",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  titleCol: { flex: 1 },
  flag: { fontSize: 26 },
  name: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    letterSpacing: -0.3,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 3,
    flexWrap: "wrap",
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.accentDim,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  typeBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: Colors.accent,
  },
  symbolText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  changePct: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rangeRow: {
    flexDirection: "row",
    gap: 6,
  },
  rangeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rangeBtnActive: {
    backgroundColor: Colors.accentDim,
    borderColor: Colors.accent + "60",
  },
  rangeBtnText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
  },
  rangeBtnTextActive: {
    color: Colors.accent,
    fontFamily: "Inter_600SemiBold",
  },
  chartContainer: {
    flex: 1,
    position: "relative",
    backgroundColor: "#0D1117",
  },
  webview: {
    flex: 1,
    backgroundColor: "#0D1117",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0D1117",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0D1117",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    gap: 12,
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    textAlign: "center",
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.accentDim,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.accent + "50",
    marginTop: 4,
  },
  retryText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.accent,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingTop: 6,
    backgroundColor: "#0D1117",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  footerText: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
});
