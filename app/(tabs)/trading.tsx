import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { a11yButton, a11yTab } from "@/utils/accessibility";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  ScrollView,
  DimensionValue,
  Modal,
  Dimensions,
  KeyboardAvoidingView,
  PanResponder,
} from "react-native";
import Svg, { Polyline, Line, Path, Defs, LinearGradient, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueries } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { getApiUrl } from "@/lib/query-client";
import StaticColors from "@/constants/colors";
import { useColors } from "@/hooks/useColors";
import { useStrategy } from "@/context/StrategyContext";
import { useAlerts, PriceAlert } from "@/context/AlertContext";
import {
  formatTradingPrice,
  formatChangePct,
  formatConfidence,
} from "@/utils/tradingFormat";

// ─── Types ────────────────────────────────────────────────────────────────────

type TradingSubTab = "dashboard" | "signals" | "alerts";
type Category = "All" | "Commodities" | "Indices" | "Crypto" | "Forex";
type Direction = "ALL" | "BUY" | "HOLD" | "SELL";
type Timeframe = "1m" | "1h" | "4h" | "1d";

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

async function fetchSignal(
  symbol: string,
  strategy: string,
  interval: string,
  fresh?: number
): Promise<SignalResult> {
  const url = new URL(
    `/api/trading/signals/${encodeURIComponent(symbol)}`,
    getApiUrl()
  );
  url.searchParams.set("strategy", strategy);
  url.searchParams.set("interval", interval);
  if (fresh && fresh > 0) url.searchParams.set("fresh", String(fresh));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

interface SparklineData {
  prices: number[];
  dates: string[];
}

function formatCandleDate(t: string | number): string {
  const ms = typeof t === "number" ? t * 1000 : Date.parse(String(t));
  const d = new Date(ms);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

async function fetchSparkline(symbol: string): Promise<SparklineData> {
  try {
    const url = new URL(
      `/api/trading/history/${encodeURIComponent(symbol)}`,
      getApiUrl()
    );
    url.searchParams.set("interval", "1d");
    const res = await fetch(url.toString());
    if (!res.ok) return { prices: [], dates: [] };
    const data = await res.json();
    const candles: { close: number; time: string | number }[] = data.candles ?? [];
    const slice = candles.slice(-7);
    return {
      prices: slice.map((c) => c.close),
      dates: slice.map((c) => formatCandleDate(c.time)),
    };
  } catch {
    return { prices: [], dates: [] };
  }
}

function Sparkline({ prices, color }: { prices: number[]; color: string }) {
  const W = 30;
  const H = 20;

  if (prices.length < 2) {
    return (
      <Svg width={W} height={H}>
        <Line
          x1="0"
          y1={H / 2}
          x2={W}
          y2={H / 2}
          stroke={color}
          strokeWidth={1.5}
          strokeOpacity={0.4}
        />
      </Svg>
    );
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const pad = 2;

  const pts = prices
    .map((p, i) => {
      const x = (i / (prices.length - 1)) * (W - pad * 2) + pad;
      const y = (H - pad * 2) - ((p - min) / range) * (H - pad * 2) + pad;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <Svg width={W} height={H}>
      <Polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── Sub-tab bar ──────────────────────────────────────────────────────────────

function SubTabBar({
  active,
  onChange,
}: {
  active: TradingSubTab;
  onChange: (t: TradingSubTab) => void;
}) {
  const Colors = useColors();
  const { alerts } = useAlerts();
  const tabs: { key: TradingSubTab; label: string; icon: string }[] = [
    { key: "dashboard", label: "Markets", icon: "bar-chart-outline" },
    { key: "signals", label: "AI Signals", icon: "flash-outline" },
    { key: "alerts", label: "Alerts", icon: "notifications-outline" },
  ];
  return (
    <View style={[stab.bar, { backgroundColor: Colors.surface, borderBottomColor: Colors.border }]}>
      {tabs.map((t) => {
        const isActive = t.key === active;
        const showBadge = t.key === "alerts" && alerts.length > 0;
        return (
          <Pressable
            key={t.key}
            hitSlop={{ top: 5, bottom: 5 }}
            style={[stab.tab, isActive && { borderBottomColor: Colors.accent, borderBottomWidth: 2 }]}
            onPress={() => onChange(t.key)}
            testID={`subtab-${t.key}`}
            {...a11yTab(t.label, isActive)}
          >
            <View style={stab.iconWrap}>
              <Ionicons
                name={t.icon as React.ComponentProps<typeof Ionicons>["name"]}
                size={14}
                color={isActive ? Colors.accent : Colors.textMuted}
              />
              {showBadge && (
                <View style={[stab.badge, { backgroundColor: Colors.warning }]}>
                  <Text style={stab.badgeText}>{alerts.length}</Text>
                </View>
              )}
            </View>
            <Text style={[stab.label, { color: isActive ? Colors.accent : Colors.textMuted }]}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const stab = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 11,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  iconWrap: {
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -5,
    right: -7,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  badgeText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "#000",
  },
});

// ─── Strategy Info Modal ───────────────────────────────────────────────────────

interface StrategySection {
  icon: string;
  title: string;
  body: string;
}

const STRATEGY_INFO: Record<"1" | "2" | "3", {
  name: string;
  tagline: string;
  overview: string;
  sections: StrategySection[];
}> = {
  "1": {
    name: "S1 · Technical",
    tagline: "Pure price & indicator logic",
    overview:
      "S1 makes decisions entirely from price action and technical indicators. It scores each indicator independently then sums a weighted score to generate BUY, HOLD, or SELL. No news or macro data is used — making it fast, objective, and consistent across all asset types.",
    sections: [
      {
        icon: "trending-up-outline",
        title: "RSI (14-period)",
        body:
          "Measures momentum by comparing recent gains to losses. Readings below 30 are oversold (bullish signal), above 70 are overbought (bearish signal). RSI crossing 50 from below adds a secondary bullish point.",
      },
      {
        icon: "pulse-outline",
        title: "MACD (12/26/9)",
        body:
          "Tracks the relationship between two exponential moving averages. When the MACD line crosses above the signal line and the histogram is rising, momentum is bullish. A negative histogram growing in magnitude signals accelerating selling pressure.",
      },
      {
        icon: "layers-outline",
        title: "EMA 12 / 26 / 50 / 200",
        body:
          "Short-term (12/26) crossovers capture near-term momentum shifts. Price above the EMA 50 signals a medium-term uptrend; above EMA 200 signals a long-term bull market. A golden cross (EMA 50 crossing above EMA 200) is a strong long-term buy trigger.",
      },
      {
        icon: "resize-outline",
        title: "Bollinger Bands (20/2σ)",
        body:
          "A dynamic price channel that widens in high volatility and narrows in low volatility. A price touch or breach of the lower band with reversal candles is bullish; touching the upper band during weakness is bearish. A band squeeze often precedes a breakout.",
      },
      {
        icon: "speedometer-outline",
        title: "ROC — Rate of Change",
        body:
          "Measures the percentage price change over a lookback period. Strong positive ROC confirms upward momentum; negative ROC confirms downward momentum. Divergence between ROC and price is a leading reversal warning.",
      },
      {
        icon: "analytics-outline",
        title: "ATR — Average True Range",
        body:
          "Measures market volatility. Used by S1 to set stop loss and take profit distances so every trade respects current market conditions. A 1.5× ATR stop and 3× ATR take profit target give a default 2:1 risk-reward minimum.",
      },
      {
        icon: "flash-outline",
        title: "Signal generation",
        body:
          "Each indicator produces a partial score (−1 to +1). A weighted sum is computed. Scores above +0.4 → BUY, below −0.4 → SELL, everything else → HOLD. Confidence maps the score magnitude to 50–95%.",
      },
    ],
  },
  "2": {
    name: "S2 · Multi-Factor",
    tagline: "Volatility-adjusted technical scoring",
    overview:
      "S2 extends S1 by making signal thresholds adaptive. The ATR as a percentage of price (ATR%) represents how volatile the asset currently is. When volatility is high, the model demands stronger evidence before committing to a directional call. When volatility is low, smaller moves carry more weight.",
    sections: [
      {
        icon: "layers-outline",
        title: "Same indicators as S1",
        body:
          "RSI, MACD, EMA crossovers, Bollinger Bands, ROC, and ATR are all scored identically to S1. The weighting and raw scores are unchanged.",
      },
      {
        icon: "cellular-outline",
        title: "ATR% — volatility normalisation",
        body:
          "ATR is divided by the current price to get a percentage. An ATR% above 3% is considered high volatility. This figure adjusts the BUY/SELL score thresholds dynamically so the model doesn't over-trade in choppy, volatile markets.",
      },
      {
        icon: "funnel-outline",
        title: "Adaptive thresholds",
        body:
          "In low-volatility conditions (ATR% < 1.5%): a score of ±0.3 triggers a signal, making the strategy more responsive. In high-volatility conditions (ATR% > 3%): the threshold rises to ±0.55, requiring stronger conviction before signalling.",
      },
      {
        icon: "checkmark-circle-outline",
        title: "When to prefer S2",
        body:
          "Best suited for assets with stable, trending volatility profiles such as equity indices (S&P 500, DAX) and major commodity futures. It outperforms S1 when markets are mean-reverting or range-bound, filtering out noise that would otherwise trigger false S1 signals.",
      },
      {
        icon: "warning-outline",
        title: "Limitations",
        body:
          "Because S2 requires higher conviction in volatile environments, it misses the early part of sharp breakout moves. It also ignores news events and macro catalysts entirely, which can be a blind spot during earnings seasons or geopolitical shocks.",
      },
    ],
  },
  "3": {
    name: "S3 · News-Hybrid",
    tagline: "Technical signals + live news sentiment",
    overview:
      "S3 starts with the same technical score as S1, then overlays a news-sentiment modifier derived from real-time headlines fetched from Yahoo Finance. This makes it uniquely aware of market-moving events that pure price models cannot detect.",
    sections: [
      {
        icon: "newspaper-outline",
        title: "News sentiment layer",
        body:
          "Up to 8 recent headlines are fetched for the asset. Each headline is scored −100 to +100 using keyword analysis (e.g. 'record high', 'surge' → positive; 'crash', 'default', 'warning' → negative). The average sentiment converts to a score modifier of −0.3 to +0.3.",
      },
      {
        icon: "git-merge-outline",
        title: "Hybrid scoring",
        body:
          "Final score = (S1 technical score × 0.7) + (news sentiment modifier × 0.3). This blending ensures technical structure is the primary driver, while news adds a tilt. Very negative sentiment can suppress a BUY into a HOLD; very positive news can push a HOLD into a BUY.",
      },
      {
        icon: "shield-checkmark-outline",
        title: "Conflict resolution",
        body:
          "When technicals and sentiment strongly disagree (e.g. oversold RSI + very negative news), S3 opts for HOLD to avoid catching a falling knife. When they agree (bullish technicals + positive news), S3 can assign maximum BUY confidence.",
      },
      {
        icon: "time-outline",
        title: "Backtesting note",
        body:
          "Historical news is not available during walk-forward backtesting. In the Backtest tab, S3 results are identical to S1. The news advantage only applies to live signals where real-time headlines are accessible.",
      },
      {
        icon: "checkmark-circle-outline",
        title: "When to prefer S3",
        body:
          "Best for assets with high news sensitivity: gold (safe-haven flows), crude oil (geopolitical), crypto (regulatory/sentiment-driven), and individual country indices (political events). During earnings blackouts or data release weeks, S3's edge is most pronounced.",
      },
    ],
  },
};

function StrategyInfoModal({
  visible,
  stratKey,
  onClose,
}: {
  visible: boolean;
  stratKey: "1" | "2" | "3";
  onClose: () => void;
}) {
  const Colors = useColors();
  const insets = useSafeAreaInsets();
  const info = STRATEGY_INFO[stratKey];
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const siPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5,
      onPanResponderRelease: (_, gs) => { if (gs.dy > 60) onCloseRef.current(); },
    })
  ).current;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={si.backdrop} onPress={onClose} />
      <View
        style={[
          si.sheet,
          {
            backgroundColor: Colors.background,
            borderColor: Colors.border,
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
        {/* Handle — tap or drag down to dismiss */}
        <View style={si.handleWrap} {...siPan.panHandlers}>
          <View style={[si.handle, { backgroundColor: Colors.border }]} />
        </View>

        {/* Header */}
        <View style={[si.header, { borderBottomColor: Colors.border }]}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[si.headerTitle, { color: Colors.accent }]}>{info.name}</Text>
            <Text style={[si.headerTag, { color: Colors.textMuted }]}>{info.tagline}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={7} style={[si.closeBtn, { backgroundColor: Colors.surfaceElevated }]} {...a11yButton("Close")}>
            <Ionicons name="close" size={18} color={Colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 8 }}
        >
          {/* Overview */}
          <View style={[si.overviewBox, { backgroundColor: Colors.accentDim, borderColor: Colors.accent + "40" }]}>
            <Text style={[si.overviewText, { color: Colors.text }]}>{info.overview}</Text>
          </View>

          {/* Sections */}
          {info.sections.map((sec, i) => (
            <View key={i} style={[si.section, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
              <View style={si.sectionTitleRow}>
                <View style={[si.iconWrap, { backgroundColor: Colors.accentDim }]}>
                  <Ionicons name={sec.icon as any} size={14} color={Colors.accent} />
                </View>
                <Text style={[si.sectionTitle, { color: Colors.text }]}>{sec.title}</Text>
              </View>
              <Text style={[si.sectionBody, { color: Colors.textSecondary }]}>{sec.body}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const si = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "85%",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  handleWrap: { alignSelf: "stretch", alignItems: "center", paddingVertical: 8 },
  handle: { width: 38, height: 4, borderRadius: 2 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  headerTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  headerTag: { fontSize: 11, fontFamily: "Inter_400Regular" },
  closeBtn: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  overviewBox: { borderRadius: 12, borderWidth: 1, padding: 14 },
  overviewText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  section: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 8 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconWrap: { width: 26, height: 26, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 13, fontFamily: "Inter_700Bold", flex: 1 },
  sectionBody: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
});

// ─── Strategy Picker ──────────────────────────────────────────────────────────

function StrategyPicker({ onInfoPress }: { onInfoPress: () => void }) {
  const Colors = useColors();
  const { strategy, setStrategy } = useStrategy();
  const strategies: { key: "1" | "2" | "3"; label: string; desc: string }[] = [
    { key: "1", label: "S1", desc: "Technical" },
    { key: "2", label: "S2", desc: "Multi-Factor" },
    { key: "3", label: "S3", desc: "Hybrid" },
  ];
  return (
    <View style={[sp.row, { backgroundColor: Colors.surface, borderBottomColor: Colors.border }]}>
      <Text style={[sp.prefix, { color: Colors.textMuted }]}>Strategy:</Text>
      {strategies.map((s) => {
        const active = s.key === strategy;
        return (
          <Pressable
            key={s.key}
            onPress={() => setStrategy(s.key)}
            hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
            style={[
              sp.chip,
              {
                backgroundColor: active ? Colors.accentDim : Colors.surfaceElevated,
                borderColor: active ? Colors.accent + "60" : Colors.border,
              },
            ]}
            {...a11yTab(`${s.label} — ${s.desc}`, active)}
          >
            <Text style={[sp.chipLabel, { color: active ? Colors.accent : Colors.textSecondary }]}>
              {s.label}
            </Text>
            <Text style={[sp.chipDesc, { color: active ? Colors.accent : Colors.textMuted }]}>
              {" "}{s.desc}
            </Text>
          </Pressable>
        );
      })}
      {/* Info button */}
      <Pressable
        onPress={onInfoPress}
        style={[sp.infoBtn, { backgroundColor: Colors.surfaceElevated, borderColor: Colors.border }]}
        hitSlop={8}
        {...a11yButton("Strategy information")}
      >
        <Ionicons name="information-circle-outline" size={16} color={Colors.textMuted} />
      </Pressable>
    </View>
  );
}

const sp = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  prefix: { fontSize: 11, fontFamily: "Inter_500Medium", marginRight: 2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  chipLabel: { fontSize: 11, fontFamily: "Inter_700Bold" },
  chipDesc: { fontSize: 10, fontFamily: "Inter_400Regular" },
  infoBtn: {
    marginLeft: "auto",
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
});

// ─── Sparkline Chart Modal ────────────────────────────────────────────────────

function generateLastNDates(n: number): string[] {
  const today = new Date();
  const dates: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  }
  return dates;
}

function SparklineChartModal({
  symbol,
  name,
  flag,
  sparkPrices,
  sparkDates,
  onClose,
}: {
  symbol: string | null;
  name: string;
  flag: string;
  sparkPrices: number[];
  sparkDates: string[];
  onClose: () => void;
}) {
  const Colors = useColors();
  const insets = useSafeAreaInsets();
  const screenW = Dimensions.get("window").width;
  const smOnCloseRef = useRef(onClose);
  smOnCloseRef.current = onClose;
  const smPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5,
      onPanResponderRelease: (_, gs) => { if (gs.dy > 60) smOnCloseRef.current(); },
    })
  ).current;

  const PAD_L = 52;
  const PAD_R = 12;
  const PAD_T = 12;
  const PAD_B = 28;
  const CHART_W = screenW - 32;
  const CHART_H = 170;
  const PLOT_W = CHART_W - PAD_L - PAD_R;
  const PLOT_H = CHART_H - PAD_T - PAD_B;

  const closes = sparkPrices;
  const hasData = closes.length >= 2;
  const minP = hasData ? Math.min(...closes) : 0;
  const maxP = hasData ? Math.max(...closes) : 1;
  const priceRange = maxP - minP || 1;

  const toX = (i: number) => PAD_L + (i / Math.max(closes.length - 1, 1)) * PLOT_W;
  const toY = (p: number) => PAD_T + PLOT_H - ((p - minP) / priceRange) * PLOT_H;

  const linePoints = closes.map((p, i) => `${toX(i).toFixed(1)},${toY(p).toFixed(1)}`).join(" ");

  const areaPath = hasData
    ? `M${toX(0)},${toY(closes[0])} ` +
      closes.slice(1).map((p, i) => `L${toX(i + 1)},${toY(p)}`).join(" ") +
      ` L${toX(closes.length - 1)},${PAD_T + PLOT_H} L${toX(0)},${PAD_T + PLOT_H} Z`
    : "";

  const isUp = closes.length >= 2 ? closes[closes.length - 1] >= closes[0] : true;
  const lineColor = isUp ? Colors.positive : Colors.danger;

  const yLabels = hasData ? [maxP, minP + priceRange * 0.5, minP] : [];

  const lastClose = closes[closes.length - 1];
  const firstClose = closes[0];
  const changePct = hasData ? ((lastClose - firstClose) / firstClose) * 100 : null;

  const dateLabels = useMemo(
    () => sparkDates.length === closes.length && closes.length > 0
      ? sparkDates
      : generateLastNDates(closes.length || 7),
    [sparkDates, closes.length]
  );

  return (
    <Modal visible={symbol !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={sm.backdrop} onPress={onClose} />
      <View
        style={[
          sm.sheet,
          {
            backgroundColor: Colors.background,
            borderColor: Colors.border,
            paddingBottom: insets.bottom + 12,
          },
        ]}
      >
        {/* Handle — drag down to dismiss */}
        <View style={sm.handleWrap} {...smPan.panHandlers}>
          <View style={[sm.handle, { backgroundColor: Colors.border }]} />
        </View>

        {/* Header */}
        <View style={[sm.header, { borderBottomColor: Colors.border }]}>
          <Text style={sm.headerEmoji}>{flag}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[sm.headerName, { color: Colors.text }]}>{name}</Text>
            <Text style={[sm.headerSub, { color: Colors.textMuted }]}>
              {symbol} · 7-day chart (1D candles)
            </Text>
          </View>
          {changePct !== null && (
            <Text style={[sm.changePill, { color: isUp ? Colors.positive : Colors.danger, backgroundColor: isUp ? Colors.positive + "22" : Colors.danger + "22" }]}>
              {isUp ? "+" : ""}{changePct.toFixed(2)}%
            </Text>
          )}
          <Pressable onPress={onClose} hitSlop={7} style={[sm.closeBtn, { backgroundColor: Colors.surfaceElevated }]} {...a11yButton("Close chart")}>
            <Ionicons name="close" size={18} color={Colors.textSecondary} />
          </Pressable>
        </View>

        {!hasData ? (
          <View style={sm.loadingArea}>
            <Ionicons name="bar-chart-outline" size={36} color={Colors.textMuted} />
            <Text style={[sm.noData, { color: Colors.textMuted }]}>No chart data available</Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <Svg width={CHART_W} height={CHART_H}>
              <Defs>
                <LinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor={lineColor} stopOpacity={0.25} />
                  <Stop offset="100%" stopColor={lineColor} stopOpacity={0.02} />
                </LinearGradient>
              </Defs>

              {/* Horizontal grid lines */}
              {yLabels.map((_, i) => {
                const y = i === 0 ? PAD_T : i === 1 ? PAD_T + PLOT_H / 2 : PAD_T + PLOT_H;
                return (
                  <Line
                    key={i}
                    x1={PAD_L}
                    y1={y}
                    x2={CHART_W - PAD_R}
                    y2={y}
                    stroke={Colors.border}
                    strokeWidth={0.8}
                    strokeDasharray="3,3"
                  />
                );
              })}

              {/* Area fill */}
              <Path d={areaPath} fill="url(#areaGrad)" />

              {/* Line */}
              <Polyline
                points={linePoints}
                fill="none"
                stroke={lineColor}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Dots on each data point */}
              {closes.map((p, i) => (
                <Path
                  key={`dot${i}`}
                  d={`M${toX(i) - 3},${toY(p)} a3,3 0 1,0 6,0 a3,3 0 1,0 -6,0`}
                  fill={i === closes.length - 1 ? lineColor : Colors.background}
                  stroke={lineColor}
                  strokeWidth={1.5}
                />
              ))}
            </Svg>

            {/* Y-axis labels (outside SVG for easy Text styling) */}
            <View style={[sm.yAxisLabels, { height: CHART_H, right: CHART_W - PAD_L + 4 }]}>
              {yLabels.map((price, i) => {
                const topPct = i === 0 ? PAD_T : i === 1 ? PAD_T + PLOT_H / 2 : PAD_T + PLOT_H;
                const label = price >= 1000
                  ? price >= 10000
                    ? price.toFixed(0)
                    : price.toFixed(1)
                  : price >= 10
                  ? price.toFixed(1)
                  : price.toFixed(3);
                return (
                  <Text
                    key={i}
                    style={[sm.yLabel, { color: Colors.textMuted, position: "absolute", top: topPct - 7 }]}
                  >
                    {label}
                  </Text>
                );
              })}
            </View>

            {/* X-axis date labels */}
            <View style={[sm.xAxisRow, { width: CHART_W, paddingLeft: PAD_L, paddingRight: PAD_R }]}>
              {dateLabels.map((label, i) => {
                const show = i === 0 || i === Math.floor((closes.length - 1) / 2) || i === closes.length - 1;
                return (
                  <View key={i} style={{ flex: 1, alignItems: i === 0 ? "flex-start" : i === closes.length - 1 ? "flex-end" : "center" }}>
                    {show && (
                      <Text style={[sm.xLabel, { color: Colors.textMuted }]} numberOfLines={1}>
                        {label}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Stats row */}
        {hasData && (
          <View style={[sm.statsRow, { borderTopColor: Colors.border }]}>
            {[
              { label: "Open", value: firstClose },
              { label: "High", value: maxP },
              { label: "Low", value: minP },
              { label: "Close", value: lastClose },
            ].map((s) => (
              <View key={s.label} style={sm.statItem}>
                <Text style={[sm.statLabel, { color: Colors.textMuted }]}>{s.label}</Text>
                <Text style={[sm.statValue, { color: Colors.text }]}>
                  {s.value != null
                    ? s.value >= 1000
                      ? s.value.toFixed(2)
                      : s.value >= 1
                      ? s.value.toFixed(3)
                      : s.value.toFixed(5)
                    : "—"}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </Modal>
  );
}

const sm = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  handleWrap: { alignSelf: "stretch", alignItems: "center", paddingVertical: 8 },
  handle: { width: 38, height: 4, borderRadius: 2 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerEmoji: { fontSize: 24 },
  headerName: { fontSize: 15, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  changePill: { fontSize: 12, fontFamily: "Inter_700Bold", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  closeBtn: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  loadingArea: { height: 200, alignItems: "center", justifyContent: "center", gap: 10 },
  noData: { fontSize: 13, fontFamily: "Inter_400Regular" },
  yAxisLabels: { position: "absolute", top: 8 },
  yLabel: { fontSize: 9, fontFamily: "Inter_400Regular", textAlign: "right", minWidth: 44 },
  xAxisRow: { flexDirection: "row", marginTop: 2 },
  xLabel: { fontSize: 9, fontFamily: "Inter_400Regular" },
  statsRow: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 6,
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  statItem: { flex: 1, alignItems: "center", gap: 3 },
  statLabel: { fontSize: 9, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  statValue: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
});

// ─── Asset Card (Dashboard) ───────────────────────────────────────────────────

interface AssetCardProps {
  item: QuoteItem;
  signal?: SignalResult;
  sparkPrices?: number[];
  onPress: () => void;
  onSparklinePress?: () => void;
}

function AssetCard({ item, signal, sparkPrices, onPress, onSparklinePress }: AssetCardProps) {
  const Colors = useColors();
  const up = (item.changePercent ?? 0) >= 0;
  const changeColor = item.price !== null ? (up ? Colors.positive : Colors.danger) : Colors.textMuted;

  return (
    <Pressable
      style={({ pressed }) => [
        ac.row,
        { borderBottomColor: Colors.border },
        pressed && { backgroundColor: Colors.surfaceElevated },
      ]}
      onPress={onPress}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={`${item.name} (${item.symbol}), price ${formatTradingPrice(item.symbol, item.price)}${item.changePercent !== null ? `, ${(item.changePercent ?? 0) >= 0 ? "up" : "down"} ${Math.abs(item.changePercent ?? 0).toFixed(2)}%` : ""}`}
      accessibilityHint="Tap to view asset details"
    >
      <View style={[ac.iconWrap, { backgroundColor: Colors.surface }]}>
        <Text style={ac.emoji}>{item.flag}</Text>
      </View>

      <View style={ac.info}>
        <Text style={[ac.name, { color: Colors.text }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[ac.symbol, { color: Colors.textMuted }]}>{item.symbol}</Text>
      </View>

      <View style={ac.priceCol}>
        <Text style={[ac.price, { color: Colors.text }]}>
          {formatTradingPrice(item.symbol, item.price)}
        </Text>
        <Text style={[ac.change, { color: changeColor }]}>
          {item.changePercent !== null ? formatChangePct(item.changePercent) : "—"}
        </Text>
      </View>

      <Pressable
        onPress={(e) => { e.stopPropagation(); onSparklinePress?.(); }}
        hitSlop={6}
        disabled={!onSparklinePress}
        {...(onSparklinePress ? a11yButton("View price chart") : {})}
      >
        <Sparkline prices={sparkPrices ?? []} color={changeColor} />
      </Pressable>

      <View style={ac.signalCol}>
        {signal ? (
          <>
            <View style={[ac.badge, { backgroundColor: signalBg(signal.direction, Colors) }]}>
              <Text style={[ac.badgeText, { color: signalColor(signal.direction, Colors) }]}>
                {signal.direction}
              </Text>
            </View>
            <View style={[ac.confBar, { backgroundColor: Colors.border }]}>
              <View
                style={[
                  ac.confFill,
                  {
                    width: `${signal.confidence}%` as DimensionValue,
                    backgroundColor: signalColor(signal.direction, Colors),
                  },
                ]}
              />
            </View>
            <Text style={[ac.confText, { color: Colors.textMuted }]}>
              {formatConfidence(signal.confidence)}
            </Text>
          </>
        ) : (
          <View style={[ac.badge, { backgroundColor: Colors.surfaceElevated }]}>
            <ActivityIndicator size={10} color={Colors.textMuted} />
          </View>
        )}
      </View>

      <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} style={{ marginLeft: 4 }} />
    </Pressable>
  );
}

const ac = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  emoji: { fontSize: 20 },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  symbol: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 1 },
  priceCol: { alignItems: "flex-end", minWidth: 70 },
  price: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  change: { fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 1 },
  signalCol: { alignItems: "center", minWidth: 52, gap: 3 },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    minWidth: 44,
    alignItems: "center",
  },
  badgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  confBar: { height: 3, width: 44, borderRadius: 2, overflow: "hidden" },
  confFill: { height: "100%", borderRadius: 2 },
  confText: { fontSize: 9, fontFamily: "Inter_400Regular" },
});

// ─── Category badge row ───────────────────────────────────────────────────────

function CategoryHeader({ label }: { label: string }) {
  const Colors = useColors();
  return (
    <View style={[ch.row, { backgroundColor: Colors.surfaceElevated, borderBottomColor: Colors.border }]}>
      <Text style={[ch.label, { color: Colors.textMuted }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

const ch = StyleSheet.create({
  row: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
});

// ─── Dashboard view ───────────────────────────────────────────────────────────

function DashboardView({ bottomInset, onSparklinePress, onLoadingChange }: { bottomInset: number; onSparklinePress: (symbol: string, name: string, flag: string, prices: number[], dates: string[]) => void; onLoadingChange?: (v: boolean) => void }) {
  const Colors = useColors();
  const router = useRouter();
  const { strategy } = useStrategy();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category>("All");
  const [nonce, setNonce] = useState(0);

  const { data, isLoading, isRefetching, refetch } = useQuery<QuotesResponse>({
    queryKey: ["/api/trading/quotes", nonce],
    queryFn: async () => {
      const url = new URL("/api/trading/quotes", getApiUrl());
      if (nonce > 0) url.searchParams.set("fresh", String(nonce));
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json() as Promise<QuotesResponse>;
    },
    staleTime: 10_000,
    refetchInterval: 10_000,
  });

  const quotes = data?.quotes ?? [];

  const filtered = useMemo(() => {
    let list = quotes;
    if (category !== "All") list = list.filter((q) => q.category === category);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) => i.name.toLowerCase().includes(q) || i.symbol.toLowerCase().includes(q)
      );
    }
    return list;
  }, [quotes, category, search]);

  // Fetch signals for all visible symbols
  const signalQueries = useQueries({
    queries: filtered.map((q) => ({
      queryKey: ["/api/trading/signals", q.symbol, strategy, "1d", nonce],
      queryFn: () => fetchSignal(q.symbol, strategy, "1d", nonce),
      staleTime: 30_000,
    })),
  });

  // Fetch 7-day sparkline history for all visible symbols (staleTime: 4h)
  const sparklineQueries = useQueries({
    queries: filtered.map((q) => ({
      queryKey: ["/api/trading/sparkline", q.symbol],
      queryFn: () => fetchSparkline(q.symbol),
      staleTime: 4 * 60 * 60_000,
    })),
  });

  const signalMap = useMemo(() => {
    const map: Record<string, SignalResult> = {};
    signalQueries.forEach((sq, idx) => {
      if (sq.data && filtered[idx]) {
        map[filtered[idx].symbol] = sq.data;
      }
    });
    return map;
  }, [signalQueries, filtered]);

  const sparklineMap = useMemo(() => {
    const map: Record<string, SparklineData> = {};
    sparklineQueries.forEach((sq, idx) => {
      if (sq.data && filtered[idx]) {
        map[filtered[idx].symbol] = sq.data;
      }
    });
    return map;
  }, [sparklineQueries, filtered]);

  useEffect(() => {
    onLoadingChange?.(isLoading || isRefetching);
  }, [isLoading, isRefetching]);

  const onRefresh = useCallback(() => {
    setNonce((n) => n + 1);
    refetch();
  }, [refetch]);

  // Summary counts
  const buyCount = Object.values(signalMap).filter((s) => s.direction === "BUY").length;
  const sellCount = Object.values(signalMap).filter((s) => s.direction === "SELL").length;
  const holdCount = Object.values(signalMap).filter((s) => s.direction === "HOLD").length;

  const categories: Category[] = ["All", "Commodities", "Indices", "Crypto", "Forex"];

  type ListRow =
    | { type: "summary" }
    | { type: "search" }
    | { type: "catChips" }
    | { type: "catHeader"; label: string }
    | { type: "asset"; item: QuoteItem };

  const listData: ListRow[] = useMemo(() => {
    const rows: ListRow[] = [{ type: "summary" }, { type: "search" }, { type: "catChips" }];
    let lastCat = "";
    for (const item of filtered) {
      if (item.category !== lastCat && category === "All") {
        rows.push({ type: "catHeader", label: item.category });
        lastCat = item.category;
      }
      rows.push({ type: "asset", item });
    }
    return rows;
  }, [filtered, category]);

  return (
    <FlatList
      data={listData}
      keyExtractor={(item, idx) => {
        if (item.type === "asset") return `asset-${item.item.symbol}`;
        if (item.type === "catHeader") return `cat-${item.label}`;
        return `${item.type}-${idx}`;
      }}
      renderItem={({ item }) => {
        if (item.type === "summary") {
          return (
            <View style={[dv.summary, { backgroundColor: Colors.surfaceElevated, borderBottomColor: Colors.border }]}>
              <View style={[dv.summaryTile, { borderColor: Colors.positiveDim }]}>
                <Text style={[dv.summaryNum, { color: Colors.positive }]}>{buyCount}</Text>
                <Text style={[dv.summaryLabel, { color: Colors.textMuted }]}>BUY</Text>
              </View>
              <View style={[dv.summaryTile, { borderColor: Colors.warningDim }]}>
                <Text style={[dv.summaryNum, { color: Colors.warning }]}>{holdCount}</Text>
                <Text style={[dv.summaryLabel, { color: Colors.textMuted }]}>HOLD</Text>
              </View>
              <View style={[dv.summaryTile, { borderColor: Colors.dangerDim }]}>
                <Text style={[dv.summaryNum, { color: Colors.danger }]}>{sellCount}</Text>
                <Text style={[dv.summaryLabel, { color: Colors.textMuted }]}>SELL</Text>
              </View>
              <View style={dv.liveWrap}>
                <View style={[dv.liveDot, { backgroundColor: Colors.accent }]} />
                <Text style={[dv.liveText, { color: Colors.positive }]}>LIVE</Text>
              </View>
            </View>
          );
        }
        if (item.type === "search") {
          return (
            <View style={[dv.searchWrap, { backgroundColor: Colors.surface, borderBottomColor: Colors.border }]}>
              <Ionicons name="search" size={15} color={Colors.textMuted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search assets…"
                placeholderTextColor={Colors.textMuted}
                style={[dv.searchInput, { color: Colors.text }]}
                clearButtonMode="while-editing"
              />
            </View>
          );
        }
        if (item.type === "catChips") {
          return (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={[dv.chipsScroll, { backgroundColor: Colors.surface, borderBottomColor: Colors.border }]}
              contentContainerStyle={dv.chipsContent}
            >
              {categories.map((c) => {
                const active = c === category;
                return (
                  <Pressable
                    key={c}
                    onPress={() => setCategory(c)}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    style={[
                      dv.chip,
                      {
                        backgroundColor: active ? Colors.accentDim : Colors.surfaceElevated,
                        borderColor: active ? Colors.accent + "60" : Colors.border,
                      },
                    ]}
                    {...a11yTab(c, active)}
                  >
                    <Text style={[dv.chipText, { color: active ? Colors.accent : Colors.textSecondary }]}>
                      {c}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          );
        }
        if (item.type === "catHeader") {
          return <CategoryHeader label={item.label} />;
        }
        // asset row
        return (
          <AssetCard
            item={item.item}
            signal={signalMap[item.item.symbol]}
            sparkPrices={sparklineMap[item.item.symbol]?.prices}
            onPress={() =>
              router.push({ pathname: "/asset/[symbol]", params: { symbol: item.item.symbol } })
            }
            onSparklinePress={() => onSparklinePress(item.item.symbol, item.item.name, item.item.flag, sparklineMap[item.item.symbol]?.prices ?? [], sparklineMap[item.item.symbol]?.dates ?? [])}
          />
        );
      }}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching && quotes.length > 0}
          onRefresh={onRefresh}
          tintColor={Colors.accent}
        />
      }
      contentContainerStyle={{ paddingBottom: bottomInset + 20 }}
      showsVerticalScrollIndicator={false}
      ListFooterComponent={
        <Text style={dv.disclaimer}>
          Prices and signals are for informational purposes only and do not constitute financial advice.
        </Text>
      }
    />
  );
}

const dv = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  summaryTile: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    gap: 2,
  },
  summaryNum: { fontSize: 20, fontFamily: "Inter_700Bold" },
  summaryLabel: { fontSize: 10, fontFamily: "Inter_500Medium" },
  liveWrap: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", height: 32 },
  chipsScroll: { borderBottomWidth: StyleSheet.hairlineWidth },
  chipsContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, flexDirection: "row" },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  disclaimer: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#6E7A8F",
    textAlign: "center",
    lineHeight: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    opacity: 0.8,
  },
});

// ─── Signal Card (Signals view) ───────────────────────────────────────────────

interface SignalCardProps {
  quote: QuoteItem;
  signal: SignalResult | undefined;
  loading: boolean;
  sparkPrices?: number[];
  onPress: () => void;
  onSparklinePress?: () => void;
}

function SignalCard({ quote, signal, loading, sparkPrices, onPress, onSparklinePress }: SignalCardProps) {
  const Colors = useColors();
  const up = (quote.changePercent ?? 0) >= 0;
  const sparkColor = quote.price !== null ? (up ? Colors.positive : Colors.danger) : Colors.textMuted;

  return (
    <Pressable
      style={({ pressed }) => [
        sc.card,
        { backgroundColor: Colors.surface, borderColor: Colors.border },
        pressed && { opacity: 0.85 },
      ]}
      onPress={onPress}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={`${quote.name} (${quote.symbol}), ${signal ? `${signal.direction} signal, ${signal.confidence}% confidence` : "loading signal"}`}
      accessibilityHint="Tap to view asset details"
    >
      <View style={sc.header}>
        <Text style={sc.emoji}>{quote.flag}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[sc.name, { color: Colors.text }]} numberOfLines={1}>{quote.name}</Text>
          <Text style={[sc.symbol, { color: Colors.textMuted }]}>{quote.symbol}</Text>
        </View>
        <Pressable
          onPress={(e) => { e.stopPropagation(); onSparklinePress?.(); }}
          hitSlop={6}
          disabled={!onSparklinePress}
          {...(onSparklinePress ? a11yButton("View price chart") : {})}
        >
          <Sparkline prices={sparkPrices ?? []} color={sparkColor} />
        </Pressable>
        <View style={sc.priceWrap}>
          <Text style={[sc.price, { color: Colors.text }]}>
            {formatTradingPrice(quote.symbol, quote.price)}
          </Text>
          <Text
            style={[sc.change, { color: up ? Colors.positive : Colors.danger }]}
          >
            {formatChangePct(quote.changePercent)}
          </Text>
        </View>
        {signal ? (
          <View style={[sc.badge, { backgroundColor: signalBg(signal.direction, Colors) }]}>
            <Text style={[sc.badgeText, { color: signalColor(signal.direction, Colors) }]}>
              {signal.direction}
            </Text>
          </View>
        ) : loading ? (
          <ActivityIndicator size={16} color={Colors.textMuted} />
        ) : (
          <View style={[sc.badge, { backgroundColor: Colors.surfaceElevated }]}>
            <Text style={[sc.badgeText, { color: Colors.textMuted }]}>—</Text>
          </View>
        )}
      </View>

      {signal && (
        <>
          {/* Confidence bar */}
          <View style={sc.confRow}>
            <View style={[sc.confTrack, { backgroundColor: Colors.border }]}>
              <View
                style={[sc.confFill, { width: `${signal.confidence}%` as DimensionValue, backgroundColor: signalColor(signal.direction, Colors) }]}
              />
            </View>
            <Text style={[sc.confPct, { color: Colors.textMuted }]}>{signal.confidence}%</Text>
          </View>

          {/* Score pills */}
          {signal.scores && (
            <View style={sc.scoreRow}>
              {(["s1", "s2", "s3"] as const).map((k) => {
                const val = signal.scores?.[k];
                if (val == null) return null;
                const isPos = val >= 0;
                return (
                  <View
                    key={k}
                    style={[
                      sc.scorePill,
                      { backgroundColor: isPos ? Colors.positiveDim : Colors.dangerDim, borderColor: isPos ? Colors.positive + "40" : Colors.danger + "40" },
                    ]}
                  >
                    <Text style={[sc.scorePillLabel, { color: Colors.textMuted }]}>{k.toUpperCase()}</Text>
                    <Text style={[sc.scorePillVal, { color: isPos ? Colors.positive : Colors.danger }]}>
                      {val > 0 ? "+" : ""}
                      {val}
                    </Text>
                  </View>
                );
              })}
              <View style={[sc.stratBadge, { backgroundColor: Colors.accentDim }]}>
                <Text style={[sc.stratText, { color: Colors.accent }]}>{signal.strategy}</Text>
              </View>
            </View>
          )}

          {/* Top reasoning bullet */}
          {signal.reasoning.length > 0 && (
            <Text style={[sc.reasoning, { color: Colors.textSecondary }]} numberOfLines={1}>
              • {signal.reasoning[0]}
            </Text>
          )}
        </>
      )}
    </Pressable>
  );
}

const sc = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  emoji: { fontSize: 22, width: 32, textAlign: "center" },
  priceWrap: { alignItems: "flex-end", marginRight: 4 },
  price: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  change: { fontSize: 10, fontFamily: "Inter_500Medium" },
  name: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  symbol: { fontSize: 10, fontFamily: "Inter_400Regular" },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, minWidth: 44, alignItems: "center" },
  badgeText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  confRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  confTrack: { flex: 1, height: 4, borderRadius: 2, overflow: "hidden" },
  confFill: { height: "100%", borderRadius: 2 },
  confPct: { fontSize: 10, fontFamily: "Inter_500Medium", minWidth: 30, textAlign: "right" },
  scoreRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  scorePill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  scorePillLabel: { fontSize: 9, fontFamily: "Inter_600SemiBold" },
  scorePillVal: { fontSize: 10, fontFamily: "Inter_700Bold" },
  stratBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  stratText: { fontSize: 9, fontFamily: "Inter_600SemiBold" },
  reasoning: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },
});

// ─── Signals view ─────────────────────────────────────────────────────────────

function SignalsView({ bottomInset, onSparklinePress, onLoadingChange }: { bottomInset: number; onSparklinePress: (symbol: string, name: string, flag: string, prices: number[], dates: string[]) => void; onLoadingChange?: (v: boolean) => void }) {
  const Colors = useColors();
  const router = useRouter();
  const { strategy } = useStrategy();
  const [timeframe, setTimeframe] = useState<Timeframe>("1d");
  const [direction, setDirection] = useState<Direction>("ALL");
  const [search, setSearch] = useState("");
  const [nonce, setNonce] = useState(0);

  const { data: quotesData, isLoading: quotesLoading, isRefetching, refetch } = useQuery<QuotesResponse>({
    queryKey: ["/api/trading/quotes", nonce],
    queryFn: async () => {
      const url = new URL("/api/trading/quotes", getApiUrl());
      if (nonce > 0) url.searchParams.set("fresh", String(nonce));
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json() as Promise<QuotesResponse>;
    },
    staleTime: 10_000,
    refetchInterval: 10_000,
  });

  const quotes = quotesData?.quotes ?? [];

  const signalQueries = useQueries({
    queries: quotes.map((q) => ({
      queryKey: ["/api/trading/signals", q.symbol, strategy, timeframe, nonce],
      queryFn: () => fetchSignal(q.symbol, strategy, timeframe, nonce),
      staleTime: 30_000,
    })),
  });

  // Fetch 7-day sparkline history (staleTime: 4h)
  const sparklineQueries = useQueries({
    queries: quotes.map((q) => ({
      queryKey: ["/api/trading/sparkline", q.symbol],
      queryFn: () => fetchSparkline(q.symbol),
      staleTime: 4 * 60 * 60_000,
    })),
  });

  const pairs: { quote: QuoteItem; signal?: SignalResult; loading: boolean; sparkPrices?: number[]; sparkDates?: string[] }[] = useMemo(() => {
    return quotes.map((q, i) => ({
      quote: q,
      signal: signalQueries[i]?.data,
      loading: signalQueries[i]?.isLoading ?? false,
      sparkPrices: sparklineQueries[i]?.data?.prices,
      sparkDates: sparklineQueries[i]?.data?.dates,
    }));
  }, [quotes, signalQueries, sparklineQueries]);

  const filtered = useMemo(() => {
    return pairs.filter(({ quote, signal }) => {
      if (direction !== "ALL" && signal && signal.direction !== direction) return false;
      if (direction !== "ALL" && !signal) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!quote.name.toLowerCase().includes(q) && !quote.symbol.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [pairs, direction, search]);

  const timeframes: Timeframe[] = ["1m", "1h", "4h", "1d"];
  const directions: Direction[] = ["ALL", "BUY", "HOLD", "SELL"];

  useEffect(() => {
    onLoadingChange?.(quotesLoading || isRefetching);
  }, [quotesLoading, isRefetching]);

  const onRefresh = useCallback(() => {
    setNonce((n) => n + 1);
    refetch();
  }, [refetch]);

  return (
    <FlatList
      data={filtered}
      keyExtractor={(item) => `sig-${item.quote.symbol}-${timeframe}`}
      ListHeaderComponent={
        <View>
          {/* Timeframe selector */}
          <View style={[sv.tfRow, { backgroundColor: Colors.surface, borderBottomColor: Colors.border }]}>
            <Text style={[sv.rowLabel, { color: Colors.textMuted }]}>Timeframe:</Text>
            {timeframes.map((tf) => {
              const active = tf === timeframe;
              return (
                <Pressable
                  key={tf}
                  onPress={() => setTimeframe(tf)}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  style={[sv.tfChip, { backgroundColor: active ? Colors.accentDim : Colors.surfaceElevated, borderColor: active ? Colors.accent + "60" : Colors.border }]}
                  {...a11yTab(tf, active)}
                >
                  <Text style={[sv.tfText, { color: active ? Colors.accent : Colors.textSecondary }]}>{tf}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Direction filter */}
          <View style={[sv.dirRow, { backgroundColor: Colors.surface, borderBottomColor: Colors.border }]}>
            {directions.map((d) => {
              const active = d === direction;
              const color = d === "BUY" ? Colors.positive : d === "SELL" ? Colors.danger : d === "HOLD" ? Colors.warning : Colors.textSecondary;
              return (
                <Pressable
                  key={d}
                  onPress={() => setDirection(d)}
                  hitSlop={{ top: 9, bottom: 9 }}
                  style={[sv.dirChip, { flex: 1, backgroundColor: active ? color + "22" : "transparent", borderColor: active ? color + "60" : Colors.border }]}
                  {...a11yTab(d === "ALL" ? "All signals" : `${d} signals`, active)}
                >
                  <Text style={[sv.dirText, { color: active ? color : Colors.textMuted }]}>{d}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Search */}
          <View style={[sv.searchWrap, { backgroundColor: Colors.surface, borderBottomColor: Colors.border }]}>
            <Ionicons name="search" size={15} color={Colors.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Filter assets…"
              placeholderTextColor={Colors.textMuted}
              style={[sv.searchInput, { color: Colors.text }]}
              clearButtonMode="while-editing"
            />
          </View>

          <View style={{ height: 4 }} />
        </View>
      }
      renderItem={({ item }) => (
        <SignalCard
          quote={item.quote}
          signal={item.signal}
          loading={item.loading}
          sparkPrices={item.sparkPrices}
          onPress={() =>
            router.push({ pathname: "/asset/[symbol]", params: { symbol: item.quote.symbol } })
          }
          onSparklinePress={() => onSparklinePress(item.quote.symbol, item.quote.name, item.quote.flag, item.sparkPrices ?? [], item.sparkDates ?? [])}
        />
      )}
      refreshControl={
        <RefreshControl refreshing={isRefetching && quotes.length > 0} onRefresh={onRefresh} tintColor={Colors.accent} />
      }
      contentContainerStyle={{ paddingBottom: bottomInset + 20 }}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={
        <View style={sv.empty}>
          <Ionicons name="flash-off-outline" size={36} color={Colors.textMuted} />
          <Text style={[sv.emptyText, { color: Colors.textMuted }]}>No signals match your filters</Text>
        </View>
      }
      ListFooterComponent={
        <Text style={sv.disclaimer}>
          Prices and signals are for informational purposes only and do not constitute financial advice.
        </Text>
      }
    />
  );
}

const sv = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  tfRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  tfChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  tfText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  dirRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dirChip: {
    alignItems: "center",
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  dirText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", height: 32 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  disclaimer: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#6E7A8F",
    textAlign: "center",
    lineHeight: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    opacity: 0.8,
  },
});

// ─── Alerts View ──────────────────────────────────────────────────────────────

type AlertSortMode = "category" | "direction" | "name";

const CATEGORY_ORDER = ["Commodities", "Indices", "Crypto", "Forex", "Other"] as const;

function getCategoryForSymbol(symbol: string): string {
  if (symbol.endsWith("-USD")) return "Crypto";
  if (symbol.endsWith("=F")) return "Commodities";
  if (symbol.startsWith("^") || symbol === "DX-Y.NYB") return "Indices";
  if (symbol.endsWith("=X")) return "Forex";
  return "Other";
}

type AlertListRow =
  | { type: "sortBar" }
  | { type: "sectionHeader"; label: string; count: number }
  | { type: "alert"; item: PriceAlert };

function AlertSortBar({
  sortMode,
  onSort,
}: {
  sortMode: AlertSortMode;
  onSort: (m: AlertSortMode) => void;
}) {
  const Colors = useColors();
  const modes: { key: AlertSortMode; label: string }[] = [
    { key: "category", label: "Category" },
    { key: "direction", label: "Direction" },
    { key: "name", label: "Name A–Z" },
  ];
  return (
    <View
      style={[
        asb.row,
        { backgroundColor: Colors.surface, borderBottomColor: Colors.border },
      ]}
    >
      <Ionicons name="funnel-outline" size={13} color={Colors.textMuted} />
      {modes.map((m) => {
        const active = sortMode === m.key;
        return (
          <Pressable
            key={m.key}
            onPress={() => onSort(m.key)}
            hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
            style={[
              asb.chip,
              {
                backgroundColor: active ? Colors.accentDim : "transparent",
                borderColor: active ? Colors.accent + "60" : Colors.border,
              },
            ]}
            {...a11yTab(`Sort by ${m.label}`, active)}
          >
            <Text style={[asb.chipText, { color: active ? Colors.accent : Colors.textMuted }]}>
              {m.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const asb = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
  },
  chipText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
});

function AlertSectionHeader({ label, count }: { label: string; count: number }) {
  const Colors = useColors();
  return (
    <View
      style={[
        ash.row,
        {
          backgroundColor: Colors.surfaceElevated,
          borderBottomColor: Colors.border,
          borderTopColor: Colors.border,
        },
      ]}
    >
      <Text style={[ash.label, { color: Colors.textMuted }]}>
        {label.toUpperCase()}
      </Text>
      <View style={[ash.badge, { backgroundColor: Colors.accentDim }]}>
        <Text style={[ash.badgeText, { color: Colors.accent }]}>{count}</Text>
      </View>
    </View>
  );
}

const ash = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  label: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    minWidth: 20,
    alignItems: "center",
  },
  badgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
});

function AlertEditSheet({
  alert,
  onClose,
}: {
  alert: PriceAlert | null;
  onClose: () => void;
}) {
  const Colors = useColors();
  const insets = useSafeAreaInsets();
  const { updateAlert, removeAlert } = useAlerts();
  const [targetPrice, setTargetPrice] = useState("");
  const [direction, setDirection] = useState<"above" | "below">("above");

  useEffect(() => {
    if (alert) {
      setTargetPrice(String(alert.targetPrice));
      setDirection(alert.direction);
    }
  }, [alert]);

  const handleSave = async () => {
    if (!alert) return;
    const parsed = parseFloat(targetPrice.replace(/,/g, ""));
    if (isNaN(parsed) || parsed <= 0) return;
    await updateAlert(alert.id, { targetPrice: parsed, direction });
    onClose();
  };

  const handleRemove = async () => {
    if (!alert) return;
    await removeAlert(alert.id);
    onClose();
  };

  const isValid =
    !isNaN(parseFloat(targetPrice.replace(/,/g, ""))) &&
    parseFloat(targetPrice.replace(/,/g, "")) > 0;

  const aesOnCloseRef = useRef(onClose);
  aesOnCloseRef.current = onClose;
  const aesPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5,
      onPanResponderRelease: (_, gs) => { if (gs.dy > 60) aesOnCloseRef.current(); },
    })
  ).current;

  return (
    <Modal
      visible={!!alert}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={aes.overlay} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={aes.kav}
        >
          <Pressable
            style={[
              aes.sheet,
              {
                backgroundColor: Colors.surface,
                borderColor: Colors.border,
                paddingBottom: insets.bottom + 20,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Drag handle — drag down to dismiss */}
            <View style={aes.handleWrap} {...aesPan.panHandlers}>
              <View style={[aes.handle, { backgroundColor: Colors.border }]} />
            </View>
            <View style={aes.titleRow}>
              <View style={[aes.titleIcon, { backgroundColor: Colors.accentDim }]}>
                <Ionicons name="create-outline" size={18} color={Colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[aes.title, { color: Colors.text }]}>Edit Alert</Text>
                <Text style={[aes.subtitle, { color: Colors.textMuted }]}>
                  {alert?.name ?? ""}
                </Text>
              </View>
              <Pressable onPress={onClose} hitSlop={10} {...a11yButton("Close edit alert")}>
                <Ionicons name="close" size={20} color={Colors.textMuted} />
              </Pressable>
            </View>

            <Text style={[aes.label, { color: Colors.textMuted }]}>
              Alert me when price goes
            </Text>
            <View style={aes.dirRow}>
              {(["above", "below"] as const).map((d) => {
                const active = direction === d;
                const color = d === "above" ? Colors.positive : Colors.danger;
                const dimColor = d === "above" ? Colors.positiveDim : Colors.dangerDim;
                return (
                  <Pressable
                    key={d}
                    onPress={() => setDirection(d)}
                    style={[
                      aes.dirBtn,
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
                      style={[aes.dirText, { color: active ? color : Colors.textSecondary }]}
                    >
                      {d === "above" ? "Above" : "Below"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[aes.label, { color: Colors.textMuted }]}>Target price</Text>
            <View
              style={[
                aes.inputWrap,
                { backgroundColor: Colors.surfaceElevated, borderColor: Colors.border },
              ]}
            >
              <Text style={[aes.inputPrefix, { color: Colors.textMuted }]}>$</Text>
              <TextInput
                style={[aes.input, { color: Colors.text }]}
                value={targetPrice}
                onChangeText={setTargetPrice}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={Colors.textMuted}
                autoFocus
                selectTextOnFocus
              />
            </View>

            <View style={aes.actions}>
              <Pressable
                onPress={handleRemove}
                style={[
                  aes.removeBtn,
                  { backgroundColor: Colors.dangerDim, borderColor: Colors.danger + "40" },
                ]}
                testID="alert-edit-remove"
                {...a11yButton("Remove alert")}
              >
                <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                <Text style={[aes.removeBtnText, { color: Colors.danger }]}>
                  Remove Alert
                </Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                disabled={!isValid}
                style={[
                  aes.saveBtn,
                  {
                    backgroundColor: isValid ? Colors.accent : Colors.surfaceElevated,
                    opacity: isValid ? 1 : 0.5,
                  },
                ]}
                testID="alert-edit-save"
                {...a11yButton("Save alert", isValid ? undefined : "Enter a valid target price first")}
                accessibilityState={{ disabled: !isValid }}
              >
                <Ionicons
                  name="checkmark"
                  size={16}
                  color={isValid ? Colors.background : Colors.textMuted}
                />
                <Text
                  style={[aes.saveBtnText, { color: isValid ? Colors.background : Colors.textMuted }]}
                >
                  Save Changes
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const aes = StyleSheet.create({
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
  inputPrefix: { fontSize: 18, fontFamily: "Inter_600SemiBold", marginRight: 6 },
  input: { flex: 1, fontSize: 22, fontFamily: "Inter_700Bold", height: 50 },
  actions: { gap: 10, marginTop: 4 },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  saveBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
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

// ─── Alerts list ──────────────────────────────────────────────────────────────

function AlertsView({ bottomInset }: { bottomInset: number }) {
  const Colors = useColors();
  const { alerts, removeAlert } = useAlerts();
  const [editingAlert, setEditingAlert] = useState<PriceAlert | null>(null);
  const [sortMode, setSortMode] = useState<AlertSortMode>("category");

  const listData = useMemo((): AlertListRow[] => {
    const rows: AlertListRow[] = [{ type: "sortBar" }];

    if (sortMode === "category") {
      const groups: Record<string, PriceAlert[]> = {};
      for (const a of alerts) {
        const cat = getCategoryForSymbol(a.symbol);
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(a);
      }
      for (const g of Object.values(groups)) {
        g.sort((a, b) => a.name.localeCompare(b.name));
      }
      for (const cat of CATEGORY_ORDER) {
        const group = groups[cat];
        if (!group || group.length === 0) continue;
        rows.push({ type: "sectionHeader", label: cat, count: group.length });
        for (const a of group) rows.push({ type: "alert", item: a });
      }
    } else if (sortMode === "direction") {
      const above = alerts
        .filter((a) => a.direction === "above")
        .sort((a, b) => a.name.localeCompare(b.name));
      const below = alerts
        .filter((a) => a.direction === "below")
        .sort((a, b) => a.name.localeCompare(b.name));
      if (above.length > 0) {
        rows.push({ type: "sectionHeader", label: "Above Target ↑", count: above.length });
        for (const a of above) rows.push({ type: "alert", item: a });
      }
      if (below.length > 0) {
        rows.push({ type: "sectionHeader", label: "Below Target ↓", count: below.length });
        for (const a of below) rows.push({ type: "alert", item: a });
      }
    } else {
      const sorted = [...alerts].sort((a, b) => a.name.localeCompare(b.name));
      for (const a of sorted) rows.push({ type: "alert", item: a });
    }

    return rows;
  }, [alerts, sortMode]);

  if (alerts.length === 0) {
    return (
      <View style={alertv.empty}>
        <View style={[alertv.emptyIconWrap, { backgroundColor: Colors.surface }]}>
          <Ionicons name="notifications-off-outline" size={36} color={Colors.textMuted} />
        </View>
        <Text style={[alertv.emptyTitle, { color: Colors.text }]}>No active alerts</Text>
        <Text style={[alertv.emptyBody, { color: Colors.textMuted }]}>
          Set a price alert on any asset to get notified when it hits your target.
        </Text>
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={listData}
        keyExtractor={(item, idx) => {
          if (item.type === "alert") return `a-${item.item.id}`;
          if (item.type === "sectionHeader") return `hdr-${item.label}`;
          return `sortbar-${idx}`;
        }}
        contentContainerStyle={{ paddingBottom: bottomInset + 16 }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => {
          if (item.type === "sortBar") {
            return <AlertSortBar sortMode={sortMode} onSort={setSortMode} />;
          }
          if (item.type === "sectionHeader") {
            return <AlertSectionHeader label={item.label} count={item.count} />;
          }

          const a = item.item;
          const isAbove = a.direction === "above";
          const accentColor = isAbove ? Colors.positive : Colors.danger;
          const accentDimColor = isAbove ? Colors.positiveDim : Colors.dangerDim;

          // Show separator only between consecutive alert rows
          const prevItem = listData[index - 1];
          const showSeparator = prevItem?.type === "alert";

          return (
            <>
              {showSeparator && (
                <View style={[alertv.separator, { backgroundColor: Colors.border }]} />
              )}
              <Pressable
                onPress={() => setEditingAlert(a)}
                style={[alertv.row, { backgroundColor: Colors.background }]}
                testID={`alert-row-${a.id}`}
              >
                <View style={[alertv.iconWrap, { backgroundColor: accentDimColor }]}>
                  <Ionicons
                    name={isAbove ? "arrow-up" : "arrow-down"}
                    size={16}
                    color={accentColor}
                  />
                </View>

                <View style={alertv.info}>
                  <Text style={[alertv.name, { color: Colors.text }]} numberOfLines={1}>
                    {a.name}
                  </Text>
                  <View style={alertv.meta}>
                    <Text style={[alertv.symbol, { color: Colors.textMuted }]}>
                      {a.symbol}
                    </Text>
                    <View style={[alertv.dirPill, { backgroundColor: accentDimColor }]}>
                      <Text style={[alertv.dirText, { color: accentColor }]}>
                        {isAbove ? "Above" : "Below"}
                      </Text>
                    </View>
                    <Text style={[alertv.price, { color: Colors.textSecondary }]}>
                      {formatTradingPrice(a.symbol, a.targetPrice)}
                    </Text>
                  </View>
                </View>

                <Pressable
                  onPress={(e) => { e.stopPropagation(); removeAlert(a.id); }}
                  hitSlop={12}
                  style={[alertv.deleteBtn, { backgroundColor: Colors.dangerDim }]}
                  testID={`alert-delete-${a.id}`}
                >
                  <Ionicons name="trash-outline" size={15} color={Colors.danger} />
                </Pressable>
              </Pressable>
            </>
          );
        }}
      />
      <AlertEditSheet alert={editingAlert} onClose={() => setEditingAlert(null)} />
    </>
  );
}

const alertv = StyleSheet.create({
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  emptyBody: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 19,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 68,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  symbol: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  dirPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dirText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  price: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  deleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});

// ─── Header ───────────────────────────────────────────────────────────────────

function TradingHeader({ topInset, loading }: { topInset: number; loading: boolean }) {
  const Colors = useColors();
  return (
    <View
      style={[
        hdr.wrap,
        {
          paddingTop: topInset + (Platform.OS === "web" ? 67 : 10),
          backgroundColor: Colors.background,
          borderBottomColor: Colors.border,
        },
      ]}
    >
      <View style={hdr.row}>
        <View style={hdr.left}>
          <Ionicons name="analytics" size={20} color={Colors.accent} />
          <Text style={[hdr.title, { color: Colors.text }]}>AI Trading</Text>
        </View>
        <View style={[hdr.pill, { backgroundColor: Colors.accentDim }]}>
          {loading ? (
            <ActivityIndicator size={10} color={Colors.accent} style={{ marginRight: 2 }} />
          ) : (
            <View style={[hdr.pillDot, { backgroundColor: Colors.accent }]} />
          )}
          <Text style={[hdr.pillText, { color: Colors.accent }]}>49 Assets</Text>
        </View>
      </View>
    </View>
  );
}

const hdr = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  left: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
});

// ─── Root screen ──────────────────────────────────────────────────────────────

export default function TradingScreen() {
  const insets = useSafeAreaInsets();
  const Colors = useColors();
  const { strategy } = useStrategy();
  const [subTab, setSubTab] = useState<TradingSubTab>("dashboard");
  const [infoVisible, setInfoVisible] = useState(false);
  const [headerLoading, setHeaderLoading] = useState(false);
  const [chartModal, setChartModal] = useState<{ symbol: string; name: string; flag: string; sparkPrices: number[]; sparkDates: string[] } | null>(null);
  const bottomInset = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const handleSparklinePress = useCallback((symbol: string, name: string, flag: string, sparkPrices: number[], sparkDates: string[]) => {
    setChartModal({ symbol, name, flag, sparkPrices, sparkDates });
  }, []);

  return (
    <View style={[root.container, { backgroundColor: Colors.background }]}>
      <TradingHeader topInset={insets.top} loading={headerLoading} />
      <StrategyPicker onInfoPress={() => setInfoVisible(true)} />
      <SubTabBar active={subTab} onChange={setSubTab} />

      <View style={{ flex: 1 }}>
        {subTab === "dashboard" ? (
          <DashboardView bottomInset={bottomInset} onSparklinePress={handleSparklinePress} onLoadingChange={setHeaderLoading} />
        ) : subTab === "signals" ? (
          <SignalsView bottomInset={bottomInset} onSparklinePress={handleSparklinePress} onLoadingChange={setHeaderLoading} />
        ) : (
          <AlertsView bottomInset={bottomInset} />
        )}
      </View>

      <StrategyInfoModal
        visible={infoVisible}
        stratKey={strategy}
        onClose={() => setInfoVisible(false)}
      />

      <SparklineChartModal
        symbol={chartModal?.symbol ?? null}
        name={chartModal?.name ?? ""}
        flag={chartModal?.flag ?? ""}
        sparkPrices={chartModal?.sparkPrices ?? []}
        sparkDates={chartModal?.sparkDates ?? []}
        onClose={() => setChartModal(null)}
      />
    </View>
  );
}

const root = StyleSheet.create({
  container: { flex: 1 },
});
