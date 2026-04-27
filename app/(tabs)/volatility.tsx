import React, { useState, useRef, useCallback, useEffect } from "react";
import { a11yButton, a11yTab } from "@/utils/accessibility";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  Modal,
  Animated,
} from "react-native";
import { fetch } from "expo/fetch";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { useColors } from "@/hooks/useColors";
import ChartModal from "@/components/ChartModal";

// ─── Types ───────────────────────────────────────────────────────────────────

type Period = "today" | "1W" | "1M" | "3M";
type Accuracy = "strong" | "nuanced" | "conditional";

interface VolatilityAsset {
  symbol: string;
  name: string;
  flag: string;
  category: string;
  volatilityMult: number;
  direction: "reference" | "same" | "inverse";
  description: string;
  price?: number;
  change?: number;
  changePercent?: number;
  change1W?: number;
  changePercent1W?: number;
  change1M?: number;
  changePercent1M?: number;
  change3M?: number;
  changePercent3M?: number;
  sparkline?: number[];
}

interface VixInfo {
  price: number | null;
  band: string;
  bandLabel: string;
}

interface VolatilityResponse {
  items: VolatilityAsset[];
  vix: VixInfo;
  lastUpdated: string;
}

// ─── Static Data ─────────────────────────────────────────────────────────────

const CHAIN_OF_EVENTS = [
  {
    icon: "flame" as const,
    color: "#FF6B35",
    accuracy: "strong" as Accuracy,
    title: "Oil rises as supply drops",
    nuance: "Strong historical backing — Middle East conflicts, Russia/Ukraine sanctions all confirm this.",
    caveat: null,
  },
  {
    icon: "trending-up" as const,
    color: "#FFB84D",
    accuracy: "nuanced" as Accuracy,
    title: "Headline inflation rises",
    nuance: "Oil lifts energy and transport costs immediately. Core inflation is weaker and slower to move.",
    caveat: "Later: demand destruction can flip this — oil shock can become disinflationary if growth slows.",
  },
  {
    icon: "people" as const,
    color: "#4D9FFF",
    accuracy: "nuanced" as Accuracy,
    title: "Investors move to cash",
    nuance: "Under uncertainty, households and institutions shift to liquid assets — parking in cash, T-bills.",
    caveat: "This is a behavioural response, not a direct macro mechanism like the others.",
  },
  {
    icon: "stats-chart" as const,
    color: "#A78BFA",
    accuracy: "conditional" as Accuracy,
    title: "Bond yields — competing forces",
    nuance: "Two forces pull in opposite directions at once. The outcome depends on which dominates.",
    caveat: "Yields often FALL first (flight to safety buying bonds), then may RISE later if inflation persists.",
    table: [
      { force: "Inflation shock", direction: "Yields ↑" },
      { force: "Risk-off / recession fear", direction: "Yields ↓" },
    ],
  },
  {
    icon: "cash" as const,
    color: "#34D399",
    accuracy: "conditional" as Accuracy,
    title: "Dollar strengthens — usually",
    nuance: "USD rises when global risk-off boosts demand for US Treasuries and real yields stay relatively high.",
    caveat: "If the crisis is US-specific, or the Fed is expected to cut, the dollar can weaken instead.",
  },
  {
    icon: "star" as const,
    color: "#FBBF24",
    accuracy: "nuanced" as Accuracy,
    title: "Gold as safe haven — with nuance",
    nuance: "Gold works best when real yields fall and the dollar stabilises. Often rises, but not always immediately.",
    caveat: "Can underperform early if the dollar spikes sharply and real yields rise simultaneously.",
  },
];

const ACCURACY_CONFIG: Record<Accuracy, { label: string; color: string; icon: "checkmark-circle" | "alert-circle" | "information-circle" }> = {
  strong:      { label: "Reliable",    color: Colors.accent,   icon: "checkmark-circle" },
  nuanced:     { label: "Nuanced",     color: Colors.warning,  icon: "alert-circle" },
  conditional: { label: "Conditional", color: Colors.danger,   icon: "information-circle" },
};

const PHASES = [
  {
    key: "shock",
    label: "Shock",
    timeframe: "0–3 months",
    color: Colors.danger,
    icon: "alert-circle-outline" as const,
    bullets: [
      { asset: "Oil",         move: "↑",         note: "supply disruption" },
      { asset: "Equities",   move: "↓",         note: "risk-off selling" },
      { asset: "USD",         move: "↑",         note: "usually — safe haven" },
      { asset: "Bond Yields", move: "↓",         note: "then may ↑ later" },
      { asset: "Gold",        move: "Mixed → ↑", note: "uncertain initially" },
    ],
    summary: "Panic dominates. Capital flees risk assets into perceived safety — USD, bonds, cash. Gold's direction depends on whether real yields rise or fall.",
  },
  {
    key: "adjustment",
    label: "Adjustment",
    timeframe: "3–12 months",
    color: Colors.warning,
    icon: "sync-outline" as const,
    bullets: [
      { asset: "Growth",        move: "↓",         note: "slows as costs bite" },
      { asset: "Central Banks", move: "React",      note: "cut or hold" },
      { asset: "Markets",       move: "Stabilise",  note: "volatility fades" },
      { asset: "Inflation",     move: "Peaks",      note: "then turns" },
      { asset: "Policy",        move: "Drives",     note: "outcomes from here" },
    ],
    summary: "The fog clears. Markets re-price based on how severe the economic damage is and how aggressively central banks respond. Policy matters more than the crisis itself.",
  },
  {
    key: "recovery",
    label: "Recovery",
    timeframe: "1–3 years",
    color: "#A78BFA",
    icon: "rocket-outline" as const,
    bullets: [
      { asset: "Equities",     move: "↑",          note: "new highs possible" },
      { asset: "Commodities",  move: "Normalise",   note: "crisis premium fades" },
      { asset: "Gold",         move: "Depends",     note: "on real yields path" },
      { asset: "USD",          move: "Normalises",  note: "or weakens" },
      { asset: "Timing",       move: "Varies",      note: "V-shape or L-shape" },
    ],
    summary: "Markets typically recover and reach new highs within 1–3 years — but magnitude and speed vary widely. Post-2008 and post-COVID recoveries were unusually fast.",
  },
];

const KEY_DRIVERS = [
  { icon: "podium-outline" as const,    color: "#A78BFA", title: "Policy (Fed)",          detail: "Central bank decisions matter more than the crisis itself — rate cuts can reverse a bear market." },
  { icon: "layers-outline" as const,    color: "#4D9FFF", title: "Market Positioning",    detail: "If markets are already short, a crisis can trigger a short-squeeze. Positioning determines the reaction, not just the event." },
  { icon: "water-outline" as const,     color: "#34D399", title: "Liquidity",              detail: "Tight liquidity amplifies every move — both the crash and the recovery. Low liquidity = high volatility." },
  { icon: "trending-up-outline" as const, color: "#FFB84D", title: "Growth Expectations", detail: "A crisis that kills growth expectations hits harder and lasts longer than one where growth holds up." },
];

interface CrisisEvent {
  name: string;
  date: string;
  flag: string;
  shock:      { gold: number; oil: number; sp500: number; dxy: number };
  adjustment: { gold: number; oil: number; sp500: number; dxy: number };
  recovery:   { gold: number; oil: number; sp500: number; dxy: number };
}

const HISTORICAL_CRISES: CrisisEvent[] = [
  {
    name: "COVID Crash",       date: "Feb–Mar 2020",   flag: "🦠",
    shock:      { gold: -3,  oil: -65, sp500: -34, dxy: +5  },
    adjustment: { gold: +28, oil: -30, sp500: +45, dxy: -9  },
    recovery:   { gold: +12, oil: +130,sp500: +80, dxy: -14 },
  },
  {
    name: "2008 GFC",          date: "Sep–Dec 2008",   flag: "🏦",
    shock:      { gold: -6,  oil: -55, sp500: -38, dxy: +12 },
    adjustment: { gold: +35, oil: -15, sp500: -20, dxy: +5  },
    recovery:   { gold: +55, oil: +60, sp500: +85, dxy: -18 },
  },
  {
    name: "Russia/Ukraine",    date: "Feb 2022",        flag: "🇷🇺",
    shock:      { gold: +6,  oil: +47, sp500: -12, dxy: +4  },
    adjustment: { gold: -14, oil: -22, sp500: -18, dxy: +11 },
    recovery:   { gold: +10, oil: -20, sp500: +25, dxy: -5  },
  },
  {
    name: "9/11 Attacks",      date: "Sep 2001",        flag: "🇺🇸",
    shock:      { gold: +6,  oil: -28, sp500: -12, dxy: -1  },
    adjustment: { gold: +8,  oil: +25, sp500: -20, dxy: -5  },
    recovery:   { gold: +25, oil: +40, sp500: +30, dxy: -15 },
  },
  {
    name: "Gulf War",          date: "Aug 1990",        flag: "🛢️",
    shock:      { gold: +7,  oil: +130,sp500: -20, dxy: -4  },
    adjustment: { gold: -8,  oil: -62, sp500: +18, dxy: +3  },
    recovery:   { gold: +5,  oil: +10, sp500: +35, dxy: -8  },
  },
  {
    name: "Black Monday",      date: "Oct 1987",        flag: "📉",
    shock:      { gold: +8,  oil: -12, sp500: -34, dxy: -4  },
    adjustment: { gold: +5,  oil: +5,  sp500: +22, dxy: -8  },
    recovery:   { gold: +12, oil: +18, sp500: +55, dxy: -12 },
  },
];

const VIX_BANDS = [
  { max: 15,  label: "Calm",           color: Colors.accent },
  { max: 25,  label: "Nervous",        color: Colors.warning },
  { max: 35,  label: "Elevated Fear",  color: "#FF8C42" },
  { max: 999, label: "Crisis",         color: Colors.danger },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 10) return price.toFixed(2);
  return price.toFixed(4);
}

function fmtPct(v?: number): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function pctColor(v?: number): string {
  if (v == null) return Colors.textMuted;
  return v >= 0 ? Colors.positive : Colors.danger;
}

function computeStressScore(vix: number | null, goldPct1M?: number, oilPct1M?: number): number {
  const vixScore   = vix != null ? Math.min((vix / 40) * 50, 50) : 0;
  const goldScore  = goldPct1M != null ? Math.min(Math.max((goldPct1M / 20) * 25, 0), 25) : 0;
  const oilScore   = oilPct1M  != null ? Math.min(Math.max((oilPct1M  / 30) * 25, 0), 25) : 0;
  return Math.min(Math.round(vixScore + goldScore + oilScore), 100);
}

function stressLabel(score: number): { label: string; color: string; sub: string } {
  if (score >= 65) return { label: "Crisis Mode",  color: Colors.danger,  sub: "High stress — safe havens in demand" };
  if (score >= 35) return { label: "Elevated",     color: Colors.warning, sub: "Stress rising — watch closely" };
  return              { label: "Low Stress",    color: Colors.accent,  sub: "Markets relatively calm" };
}

function vixBandFor(price: number | null): typeof VIX_BANDS[0] {
  if (price == null) return VIX_BANDS[0];
  return VIX_BANDS.find(b => price < b.max) ?? VIX_BANDS[VIX_BANDS.length - 1];
}

function getPeriodChange(asset: VolatilityAsset, period: Period): { change?: number; changePercent?: number } {
  switch (period) {
    case "1W": return { change: asset.change1W, changePercent: asset.changePercent1W };
    case "1M": return { change: asset.change1M, changePercent: asset.changePercent1M };
    case "3M": return { change: asset.change3M, changePercent: asset.changePercent3M };
    default:   return { change: asset.change,   changePercent: asset.changePercent };
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AccuracyBadge({ type }: { type: Accuracy }) {
  const cfg = ACCURACY_CONFIG[type];
  return (
    <View style={[styles.accBadge, { backgroundColor: cfg.color + "18", borderColor: cfg.color + "44" }]}>
      <Ionicons name={cfg.icon} size={10} color={cfg.color} />
      <Text style={[styles.accBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

function StressMeter({ score, goldItem, oilItem }: { score: number; goldItem?: VolatilityAsset; oilItem?: VolatilityAsset }) {
  const { label, color, sub } = stressLabel(score);
  return (
    <View style={[styles.stressMeter, { borderColor: color + "44" }]}>
      <View style={styles.stressMeterTop}>
        <View>
          <Text style={styles.stressMeterTitle}>Market Stress Meter</Text>
          <Text style={[styles.stressMeterLabel, { color }]}>{label}</Text>
        </View>
        <View style={[styles.stressScoreBubble, { backgroundColor: color + "22", borderColor: color + "55" }]}>
          <Text style={[styles.stressScore, { color }]}>{score}</Text>
          <Text style={[styles.stressScoreOf, { color: color + "99" }]}>/100</Text>
        </View>
      </View>
      <View style={styles.stressBarTrack}>
        <View style={[styles.stressBarFill, { width: `${score}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.stressSub}>{sub}</Text>
      <View style={styles.stressInputRow}>
        <Text style={styles.stressInputLabel}>VIX weighted 50% · Gold 1M 25% · Oil 1M 25%</Text>
      </View>
    </View>
  );
}

function VixGauge({ vix, band, bandLabel }: { vix: number | null; band: string; bandLabel: string }) {
  const currentBand = vixBandFor(vix);
  const totalRange = 50;
  const clampedVix = Math.min(vix ?? 0, 50);

  return (
    <View style={styles.vixGauge}>
      <View style={styles.vixGaugeHeader}>
        <Text style={styles.vixGaugeTitle}>VIX Fear Index</Text>
        <View style={[styles.vixPriceBubble, { backgroundColor: currentBand.color + "22", borderColor: currentBand.color + "55" }]}>
          <Text style={[styles.vixPrice, { color: currentBand.color }]}>
            {vix != null ? vix.toFixed(1) : "—"}
          </Text>
          <Text style={[styles.vixBandLabel, { color: currentBand.color }]}> · {bandLabel}</Text>
        </View>
      </View>

      {/* Segmented band bar */}
      <View style={styles.vixBandBar}>
        {VIX_BANDS.map((b, i) => {
          const prev = VIX_BANDS[i - 1]?.max ?? 0;
          const width = Math.min(b.max, 50) - prev;
          const flexVal = width / 50;
          return (
            <View key={b.label} style={[styles.vixBandSegment, { flex: flexVal, backgroundColor: b.color + "33", borderColor: b.color + "55" }]}>
              <Text style={[styles.vixBandSegLabel, { color: b.color }]} numberOfLines={1}>{b.label}</Text>
            </View>
          );
        })}
      </View>

      {/* Indicator — flex spacer positions it proportionally */}
      <View style={styles.vixIndicatorTrack}>
        <View style={{ flex: clampedVix / totalRange }} />
        <View style={[styles.vixIndicator, { backgroundColor: currentBand.color }]} />
        <View style={{ flex: Math.max((totalRange - clampedVix) / totalRange, 0.001) }} />
      </View>

      <View style={styles.vixBandLegend}>
        <Text style={styles.vixBandNum}>0</Text>
        <Text style={styles.vixBandNum}>15</Text>
        <Text style={styles.vixBandNum}>25</Text>
        <Text style={styles.vixBandNum}>35</Text>
        <Text style={styles.vixBandNum}>50+</Text>
      </View>
    </View>
  );
}

function AiBriefing({ vix, vixBand, goldPct1M, oilPct1M, dxyPct1M }: {
  vix: number | null; vixBand: string;
  goldPct1M?: number; oilPct1M?: number; dxyPct1M?: number;
}) {
  const [loading, setLoading] = useState(false);
  const [briefing, setBriefing] = useState<string>("");
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setBriefing("");
    setGeneratedAt(null);
    setModalVisible(true);
    try {
      const url = new URL("/api/volatility/briefing", getApiUrl());
      const resp = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ vix, vixBand, goldPct1M, oilPct1M, dxyPct1M }),
      });
      if (!resp.ok) throw new Error("Failed");

      const reader = resp.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let receivedFirst = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6);
          if (raw === "[DONE]") continue;
          try {
            const parsed = JSON.parse(raw) as { content?: string; generatedAt?: string; error?: string };
            if (parsed.error) { setError(parsed.error); break; }
            if (parsed.content) {
              if (!receivedFirst) { setLoading(false); receivedFirst = true; }
              setBriefing(prev => prev + parsed.content);
            }
            if (parsed.generatedAt) setGeneratedAt(parsed.generatedAt);
          } catch {}
        }
      }
    } catch {
      setError("Could not generate briefing. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [vix, vixBand, goldPct1M, oilPct1M, dxyPct1M]);

  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.aiBriefingBtn, pressed && { opacity: 0.75 }]}
        onPress={briefing.length > 0 ? () => setModalVisible(true) : generate}
        disabled={loading}
        {...a11yButton(
          loading ? "Generating AI briefing" : briefing.length > 0 ? "View AI briefing" : "Generate AI briefing",
          "AI-powered analysis of current market stress conditions"
        )}
      >
        <View style={styles.aiBriefingBtnLeft}>
          {loading
            ? <ActivityIndicator size="small" color={Colors.accent} />
            : <Ionicons name={briefing.length > 0 ? "refresh" : "sparkles"} size={16} color={Colors.accent} />
          }
          <Text style={styles.aiBriefingBtnText}>
            {loading ? "Generating…" : briefing.length > 0 ? "View AI Briefing" : "Generate AI Briefing"}
          </Text>
        </View>
        <Text style={styles.aiBriefingPowered}>GPT-4o mini</Text>
      </Pressable>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Ionicons name="sparkles" size={18} color={Colors.accent} />
                <Text style={styles.modalTitle}>AI Crisis Briefing</Text>
              </View>
              <Pressable onPress={() => setModalVisible(false)} hitSlop={10} {...a11yButton("Close AI briefing")}>
                <Ionicons name="close" size={20} color={Colors.textMuted} />
              </Pressable>
            </View>

            <View style={styles.modalContextRow}>
              {[
                { label: "VIX", value: vix?.toFixed(1) ?? "—" },
                { label: "Gold 1M", value: fmtPct(goldPct1M) },
                { label: "Oil 1M",  value: fmtPct(oilPct1M) },
                { label: "DXY 1M",  value: fmtPct(dxyPct1M) },
              ].map(item => (
                <View key={item.label} style={styles.modalContextItem}>
                  <Text style={styles.modalContextLabel}>{item.label}</Text>
                  <Text style={styles.modalContextValue}>{item.value}</Text>
                </View>
              ))}
            </View>

            {loading && (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color={Colors.accent} />
                <Text style={styles.modalLoadingText}>Analysing current market conditions…</Text>
              </View>
            )}

            {error && !loading && (
              <View style={styles.modalError}>
                <Ionicons name="alert-circle-outline" size={18} color={Colors.danger} />
                <Text style={styles.modalErrorText}>{error}</Text>
              </View>
            )}

            {briefing.length > 0 && (
              <>
                <Text style={styles.modalBriefingText}>{briefing}</Text>
                {generatedAt && !loading && (
                  <Text style={styles.modalTimestamp}>
                    Generated {new Date(generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                )}
                {!loading && (
                  <Pressable
                    style={styles.modalRefreshBtn}
                    onPress={() => { generate(); }}
                    {...a11yButton("Regenerate AI briefing")}
                  >
                    <Ionicons name="refresh" size={14} color={Colors.textMuted} />
                    <Text style={styles.modalRefreshText}>Regenerate</Text>
                  </Pressable>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

function HistoricalPlaybook() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const COLS = ["Gold", "Oil", "S&P 500", "DXY"];
  const PHASES_H = [
    { key: "shock",      label: "Shock",      color: Colors.danger  },
    { key: "adjustment", label: "Adj.",        color: Colors.warning },
    { key: "recovery",   label: "Recovery",   color: "#A78BFA"      },
  ] as const;

  function phaseData(crisis: CrisisEvent, phase: "shock" | "adjustment" | "recovery") {
    const d = crisis[phase];
    return [d.gold, d.oil, d.sp500, d.dxy];
  }

  return (
    <View style={styles.playbook}>
      {HISTORICAL_CRISES.map(crisis => {
        const isOpen = expanded === crisis.name;
        return (
          <View key={crisis.name} style={styles.playbookCard}>
            <Pressable style={styles.playbookCardHeader} onPress={() => setExpanded(isOpen ? null : crisis.name)}>
              <Text style={styles.playbookFlag}>{crisis.flag}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.playbookName}>{crisis.name}</Text>
                <Text style={styles.playbookDate}>{crisis.date}</Text>
              </View>
              <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={16} color={Colors.textMuted} />
            </Pressable>

            {isOpen && (
              <View style={styles.playbookTable}>
                {/* Header row */}
                <View style={styles.playbookTableRow}>
                  <View style={styles.playbookPhaseCell}><Text style={styles.playbookHeaderText}>Phase</Text></View>
                  {COLS.map(col => (
                    <View key={col} style={styles.playbookDataCell}>
                      <Text style={styles.playbookHeaderText} numberOfLines={1}>{col}</Text>
                    </View>
                  ))}
                </View>
                {/* Data rows */}
                {PHASES_H.map(ph => {
                  const vals = phaseData(crisis, ph.key);
                  return (
                    <View key={ph.key} style={[styles.playbookTableRow, styles.playbookTableDataRow]}>
                      <View style={styles.playbookPhaseCell}>
                        <Text style={[styles.playbookPhaseLabel, { color: ph.color }]}>{ph.label}</Text>
                      </View>
                      {vals.map((v, i) => (
                        <View key={i} style={styles.playbookDataCell}>
                          <Text style={[styles.playbookVal, { color: v >= 0 ? Colors.positive : Colors.danger }]}>
                            {v >= 0 ? "+" : ""}{v}%
                          </Text>
                        </View>
                      ))}
                    </View>
                  );
                })}
                <Text style={styles.playbookNote}>Approximate figures. Shock = 0–3mo, Adj = 3–12mo, Recovery = 1–3yr.</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function ChainCard({ event, index }: { event: typeof CHAIN_OF_EVENTS[0]; index: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={styles.chainCard}>
      <View style={styles.chainCardHeader}>
        <View style={[styles.chainIconWrap, { backgroundColor: event.color + "1A" }]}>
          <Ionicons name={event.icon} size={18} color={event.color} />
        </View>
        <View style={styles.chainCardTitles}>
          <View style={styles.chainCardRow}>
            <View style={[styles.chainNumBadge, { backgroundColor: event.color + "22" }]}>
              <Text style={[styles.chainNum, { color: event.color }]}>{index + 1}</Text>
            </View>
            <Text style={styles.chainTitle}>{event.title}</Text>
          </View>
          <AccuracyBadge type={event.accuracy} />
        </View>
        <Pressable
          onPress={() => setExpanded(v => !v)}
          hitSlop={8}
          {...a11yButton(expanded ? "Collapse details" : "Expand details")}
        >
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={Colors.textMuted} />
        </Pressable>
      </View>

      {expanded && (
        <View style={styles.chainExpanded}>
          <Text style={styles.chainNuance}>{event.nuance}</Text>
          {"table" in event && event.table && (
            <View style={styles.forceTable}>
              {event.table.map((row, i) => (
                <View key={i} style={[styles.forceRow, i === 0 && styles.forceRowFirst]}>
                  <Text style={styles.forceLabel}>{row.force}</Text>
                  <Text style={[styles.forceDir, { color: row.direction.includes("↑") ? Colors.positive : Colors.danger }]}>{row.direction}</Text>
                </View>
              ))}
            </View>
          )}
          {event.caveat && (
            <View style={styles.caveatRow}>
              <Ionicons name="arrow-forward" size={12} color={Colors.warning} />
              <Text style={styles.caveatText}>{event.caveat}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function PhaseCards() {
  const [activePhase, setActivePhase] = useState<string | null>(null);
  return (
    <View style={styles.phaseWrap}>
      <View style={styles.phaseSelector}>
        {PHASES.map(phase => (
          <Pressable
            key={phase.key}
            style={[styles.phaseTab, { borderColor: phase.color }, activePhase === phase.key && { backgroundColor: phase.color + "22" }]}
            onPress={() => setActivePhase(activePhase === phase.key ? null : phase.key)}
            {...a11yTab(`${phase.label}, ${phase.timeframe}`, activePhase === phase.key)}
          >
            <Text style={[styles.phaseTabLabel, { color: phase.color }]}>{phase.label}</Text>
            <Text style={styles.phaseTabTime}>{phase.timeframe}</Text>
          </Pressable>
        ))}
      </View>

      {PHASES.filter(p => p.key === activePhase).map(phase => (
        <View key={phase.key} style={[styles.phaseDetail, { borderColor: phase.color + "44" }]}>
          <View style={styles.phaseDetailHeader}>
            <Ionicons name={phase.icon} size={16} color={phase.color} />
            <Text style={[styles.phaseDetailTitle, { color: phase.color }]}>{phase.label} · {phase.timeframe}</Text>
          </View>
          <View style={styles.phaseBullets}>
            {phase.bullets.map((b, i) => (
              <View key={i} style={styles.phaseBulletRow}>
                <Text style={styles.phaseBulletAsset}>{b.asset}</Text>
                <Text style={[styles.phaseBulletMove, { color: b.move.includes("↑") ? Colors.positive : b.move.includes("↓") ? Colors.danger : Colors.warning }]}>{b.move}</Text>
                <Text style={styles.phaseBulletNote}>{b.note}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.phaseSummary}>{phase.summary}</Text>
        </View>
      ))}

      {!activePhase && <Text style={styles.phaseTip}>Tap a phase to see what moves and why</Text>}

      <View style={styles.phaseDisclaimer}>
        <Ionicons name="alert-circle-outline" size={12} color={Colors.textMuted} />
        <Text style={styles.phaseDisclaimerText}>
          Timelines vary widely — V-shaped recoveries (COVID) vs prolonged slumps (2008). Not a fixed script.
        </Text>
      </View>
    </View>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  // Down-sample to ~20 bars
  const step = Math.max(1, Math.floor(data.length / 20));
  const bars: number[] = [];
  for (let i = 0; i < data.length; i += step) bars.push(data[i]);
  if (bars[bars.length - 1] !== data[data.length - 1]) bars.push(data[data.length - 1]);

  return (
    <View style={styles.sparklineWrap}>
      <View style={styles.sparklineBars}>
        {bars.map((v, i) => {
          const height = Math.max(((v - min) / range) * 28 + 2, 2);
          return (
            <View
              key={i}
              style={[styles.sparklineBar, { height, backgroundColor: color + "CC" }]}
            />
          );
        })}
      </View>
    </View>
  );
}

function AssetCard({
  asset,
  period,
  onChart,
}: {
  asset: VolatilityAsset;
  period: Period;
  onChart: (item: { symbol: string; name: string; type: "indices" | "commodities" | "forex" }) => void;
}) {
  const isRef = asset.direction === "reference";
  const multColor =
    asset.volatilityMult >= 3 ? Colors.warning :
    asset.volatilityMult >= 2 ? "#4D9FFF" :
    Colors.accent;

  const { changePercent } = getPeriodChange(asset, period);
  const changeColor = pctColor(changePercent);

  // Fade animation when period changes
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const prevPeriod = useRef(period);
  useEffect(() => {
    if (prevPeriod.current !== period) {
      prevPeriod.current = period;
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [period, fadeAnim]);

  const isUp = (asset.sparkline?.length ?? 0) >= 2
    ? (asset.sparkline![asset.sparkline!.length - 1] > asset.sparkline![0])
    : true;
  const sparkColor = isUp ? Colors.positive : Colors.danger;

  return (
    <Pressable
      style={({ pressed }) => [styles.assetCard, pressed && styles.assetCardPressed]}
      onPress={() => {
        const isFx = asset.symbol.endsWith("=X");
        const isEtf = ["GDX", "XLE"].includes(asset.symbol);
        const chartType = isFx ? "forex" : isEtf ? "indices" : "commodities";
        onChart({ symbol: asset.symbol, name: asset.name, type: chartType });
      }}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={`${asset.name}${asset.price != null ? `, $${formatPrice(asset.price)}` : ""}, ${asset.category}`}
      accessibilityHint="Tap to view price chart"
    >
      <View style={styles.assetCardTop}>
        <View style={styles.assetLeft}>
          <Text style={styles.assetFlag}>{asset.flag}</Text>
          <View>
            <Text style={styles.assetName}>{asset.name}</Text>
            <Text style={styles.assetCategory}>{asset.category}</Text>
          </View>
        </View>
        <View style={styles.assetRight}>
          {asset.price != null ? (
            <>
              <Text style={styles.assetPrice}>${formatPrice(asset.price)}</Text>
              <Animated.Text style={[styles.assetChange, { color: changeColor, opacity: fadeAnim }]}>
                {fmtPct(changePercent)}
              </Animated.Text>
            </>
          ) : (
            <ActivityIndicator size="small" color={Colors.textMuted} />
          )}
        </View>
      </View>

      <View style={styles.assetBadgeRow}>
        <View style={styles.assetBadges}>
          {isRef ? (
            <View style={[styles.badge, { backgroundColor: Colors.accentDim, borderColor: Colors.accent + "44" }]}>
              <Text style={[styles.badgeText, { color: Colors.accent }]}>Reference</Text>
            </View>
          ) : (
            <View style={[styles.badge, { backgroundColor: multColor + "18", borderColor: multColor + "44" }]}>
              <Text style={[styles.badgeText, { color: multColor }]}>~{asset.volatilityMult}× Gold</Text>
            </View>
          )}
          {!isRef && (
            <View style={[styles.badge, { backgroundColor: Colors.accentDim, borderColor: Colors.accent + "33" }]}>
              <Ionicons name="trending-up" size={10} color={Colors.accent} />
              <Text style={[styles.badgeText, { color: Colors.accent, marginLeft: 3 }]}>Same direction</Text>
            </View>
          )}
        </View>
        <Ionicons name="bar-chart-outline" size={12} color={Colors.textMuted} />
      </View>

      <Text style={styles.assetDescription}>{asset.description}</Text>

      {(asset.sparkline?.length ?? 0) > 2 && (
        <View style={styles.assetSparklineRow}>
          <Text style={styles.sparklineLabel}>30d</Text>
          <Sparkline data={asset.sparkline!} color={sparkColor} />
          <Text style={[styles.sparklineTrend, { color: sparkColor }]}>
            {isUp ? "▲" : "▼"}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function PeriodToggle({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  const periods: { key: Period; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "1W",    label: "1W" },
    { key: "1M",    label: "1M" },
    { key: "3M",    label: "3M" },
  ];
  return (
    <View style={styles.periodToggle}>
      {periods.map(p => (
        <Pressable
          key={p.key}
          hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
          style={[styles.periodBtn, period === p.key && styles.periodBtnActive]}
          onPress={() => onChange(p.key)}
          {...a11yTab(p.label, period === p.key)}
        >
          <Text style={[styles.periodBtnText, period === p.key && styles.periodBtnTextActive]}>
            {p.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function VolatilityScreen() {
  const Colors = useColors();
  const insets = useSafeAreaInsets();
  const [chartItem, setChartItem] = useState<{ symbol: string; name: string; type: "indices" | "commodities" | "forex" } | null>(null);
  const [period, setPeriod] = useState<Period>("today");

  const { data, isLoading, isError, refetch } = useQuery<VolatilityResponse>({
    queryKey: ["/api/volatility/assets"],
    queryFn: async () => {
      const url = new URL("/api/volatility/assets", getApiUrl());
      const resp = await fetch(url.toString());
      if (!resp.ok) throw new Error("Failed to fetch volatility assets");
      return resp.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  const goldItem    = data?.items.find(a => a.symbol === "GC=F");
  const oilItem     = data?.items.find(a => a.symbol === "CL=F");
  const dxyItem     = data?.items.find(a => a.symbol === "DX-Y.NYB");
  const stressScore = data
    ? computeStressScore(data.vix.price, goldItem?.changePercent1M, oilItem?.changePercent1M)
    : 0;

  return (
    <View style={[styles.screen, { paddingTop: topPad, backgroundColor: Colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: botPad + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={[styles.headerIconWrap, { backgroundColor: Colors.dangerDim }]}>
            <Ionicons name="pulse" size={22} color={Colors.danger} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: Colors.text }]}>Crisis Playbook</Text>
            <Text style={[styles.headerSub, { color: Colors.textSecondary }]}>A nuanced macro framework — markets don't follow a fixed script</Text>
          </View>
        </View>

        {/* ── Live Stress Meter + VIX Gauge ── */}
        {data && (
          <View style={styles.section}>
            <StressMeter score={stressScore} goldItem={goldItem} oilItem={oilItem} />
            <View style={{ height: 10 }} />
            <VixGauge vix={data.vix.price} band={data.vix.band} bandLabel={data.vix.bandLabel} />
          </View>
        )}
        {isLoading && !data && (
          <View style={styles.liveLoadingWrap}>
            <ActivityIndicator color={Colors.accent} />
            <Text style={styles.liveLoadingText}>Loading live indicators…</Text>
          </View>
        )}

        {/* ── AI Briefing ── */}
        {data && (
          <AiBriefing
            vix={data.vix.price}
            vixBand={data.vix.band}
            goldPct1M={goldItem?.changePercent1M}
            oilPct1M={oilItem?.changePercent1M}
            dxyPct1M={dxyItem?.changePercent1M}
          />
        )}

        {/* ── Accuracy Legend ── */}
        <View style={styles.legendRow}>
          {(Object.entries(ACCURACY_CONFIG) as [Accuracy, typeof ACCURACY_CONFIG[Accuracy]][]).map(([key, cfg]) => (
            <View key={key} style={styles.legendItem}>
              <Ionicons name={cfg.icon} size={12} color={cfg.color} />
              <Text style={[styles.legendText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Chain of Events ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Typical Chain of Events</Text>
          <Text style={styles.sectionSub}>Tap each step to see the nuance — not all are as mechanical as they appear</Text>
          {CHAIN_OF_EVENTS.map((event, idx) => (
            <React.Fragment key={idx}>
              <ChainCard event={event} index={idx} />
              {idx < CHAIN_OF_EVENTS.length - 1 && (
                <View style={styles.chainConnector}>
                  <Ionicons name="arrow-down" size={14} color={Colors.textMuted} />
                </View>
              )}
            </React.Fragment>
          ))}
        </View>

        {/* ── 3-Phase Framework ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3-Phase Crisis Framework</Text>
          <Text style={styles.sectionSub}>A cleaner model than fixed month-count timelines</Text>
          <PhaseCards />
        </View>

        {/* ── Historical Crisis Playbook ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Historical Crisis Playbook</Text>
          <Text style={styles.sectionSub}>Tap any event to see how Gold, Oil, S&P 500 and DXY actually moved</Text>
          <HistoricalPlaybook />
        </View>

        {/* ── Key Drivers ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What Actually Drives Outcomes</Text>
          <Text style={styles.sectionSub}>These four factors matter more than the crisis itself</Text>
          <View style={styles.driversGrid}>
            {KEY_DRIVERS.map((driver, idx) => (
              <View key={idx} style={[styles.driverCard, { borderColor: driver.color + "33" }]}>
                <View style={[styles.driverIconWrap, { backgroundColor: driver.color + "18" }]}>
                  <Ionicons name={driver.icon} size={20} color={driver.color} />
                </View>
                <Text style={[styles.driverTitle, { color: driver.color }]}>{driver.title}</Text>
                <Text style={styles.driverDetail}>{driver.detail}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Crisis Asset Tracker ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Crisis Asset Tracker</Text>
          <Text style={styles.sectionSub}>Live prices — tap any card for interactive chart · sparklines = 30-day trend</Text>

          {data && <PeriodToggle period={period} onChange={setPeriod} />}

          {isLoading && (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={Colors.accent} />
              <Text style={styles.loadingText}>Fetching live prices…</Text>
            </View>
          )}
          {isError && (
            <Pressable style={styles.errorWrap} onPress={() => refetch()}>
              <Ionicons name="alert-circle-outline" size={20} color={Colors.danger} />
              <Text style={styles.errorText}>Failed to load — tap to retry</Text>
            </Pressable>
          )}
          {data?.items.map(asset => (
            <AssetCard key={asset.symbol} asset={asset} period={period} onChart={setChartItem} />
          ))}
          {data && (
            <Text style={styles.lastUpdated}>
              Updated {new Date(data.lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Text>
          )}
        </View>

        {/* ── Disclaimer ── */}
        <View style={styles.disclaimer}>
          <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.disclaimerText}>
            Historical figures are approximate. Volatility multipliers are typical ranges, not fixed values. Not financial advice.
          </Text>
        </View>
      </ScrollView>

      {chartItem && (
        <ChartModal
          visible={!!chartItem}
          symbol={chartItem.symbol}
          name={chartItem.name}
          type={chartItem.type}
          onClose={() => setChartItem(null)}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 16 },

  // Header
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 4, marginBottom: 4 },
  headerIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.dangerDim, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: Colors.text, letterSpacing: -0.3 },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  // Live loading
  liveLoadingWrap: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 16, paddingHorizontal: 4 },
  liveLoadingText: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textMuted },

  // Stress Meter
  stressMeter: { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, gap: 10 },
  stressMeterTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stressMeterTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.textSecondary, marginBottom: 2 },
  stressMeterLabel: { fontFamily: "Inter_700Bold", fontSize: 18 },
  stressScoreBubble: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", alignItems: "baseline", gap: 2 },
  stressScore: { fontFamily: "Inter_700Bold", fontSize: 22 },
  stressScoreOf: { fontFamily: "Inter_400Regular", fontSize: 11 },
  stressBarTrack: { height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: "hidden" },
  stressBarFill: { height: "100%", borderRadius: 4 },
  stressSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  stressInputRow: {},
  stressInputLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted },

  // VIX Gauge
  vixGauge: { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border, gap: 8 },
  vixGaugeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  vixGaugeTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  vixPriceBubble: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  vixPrice: { fontFamily: "Inter_700Bold", fontSize: 16 },
  vixBandLabel: { fontFamily: "Inter_500Medium", fontSize: 12 },
  vixBandBar: { flexDirection: "row", height: 26, borderRadius: 6, overflow: "hidden", gap: 2 },
  vixBandSegment: { alignItems: "center", justifyContent: "center", borderWidth: 0.5, borderRadius: 4 },
  vixBandSegLabel: { fontFamily: "Inter_500Medium", fontSize: 8 },
  vixIndicatorTrack: { height: 8, flexDirection: "row", alignItems: "center" },
  vixIndicator: { width: 3, height: 8, borderRadius: 2 },
  vixBandLegend: { flexDirection: "row", justifyContent: "space-between" },
  vixBandNum: { fontFamily: "Inter_400Regular", fontSize: 9, color: Colors.textMuted },

  // AI Briefing button
  aiBriefingBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: Colors.accentDim, borderWidth: 1, borderColor: Colors.accent + "44", borderRadius: 12, padding: 14, marginTop: 10 },
  aiBriefingBtnLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  aiBriefingBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.accent },
  aiBriefingPowered: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 14, maxHeight: "80%" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 17, color: Colors.text },
  modalContextRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  modalContextItem: { backgroundColor: Colors.surfaceElevated, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignItems: "center" },
  modalContextLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted },
  modalContextValue: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text, marginTop: 2 },
  modalLoading: { alignItems: "center", gap: 12, paddingVertical: 24 },
  modalLoadingText: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textMuted },
  modalError: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.dangerDim, borderRadius: 10, padding: 12 },
  modalErrorText: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.danger, flex: 1 },
  modalBriefingText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text, lineHeight: 22 },
  modalTimestamp: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted },
  modalRefreshBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-end" },
  modalRefreshText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textMuted },

  // Accuracy legend
  legendRow: { flexDirection: "row", gap: 12, paddingHorizontal: 4, marginTop: 12, marginBottom: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendText: { fontFamily: "Inter_500Medium", fontSize: 11 },

  // Sections
  section: { marginTop: 24 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text, marginBottom: 4 },
  sectionSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textMuted, marginBottom: 14 },

  // Chain cards
  chainCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border },
  chainCardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  chainIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  chainCardTitles: { flex: 1, gap: 4 },
  chainCardRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  chainNumBadge: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  chainNum: { fontFamily: "Inter_700Bold", fontSize: 9 },
  chainTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text, flex: 1 },
  chainExpanded: { marginTop: 12, gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  chainNuance: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  forceTable: { borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: Colors.border },
  forceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.border },
  forceRowFirst: { borderTopWidth: 0 },
  forceLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  forceDir: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  caveatRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, backgroundColor: Colors.warningDim, borderRadius: 8, padding: 10 },
  caveatText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.warning, flex: 1, lineHeight: 18 },
  chainConnector: { alignItems: "center", paddingVertical: 4 },

  // Accuracy badge
  accBadge: { flexDirection: "row", alignItems: "center", gap: 3, borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, alignSelf: "flex-start" },
  accBadgeText: { fontFamily: "Inter_500Medium", fontSize: 9 },

  // Phase cards
  phaseWrap: { gap: 10 },
  phaseSelector: { flexDirection: "row", gap: 6 },
  phaseTab: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 10, alignItems: "center", backgroundColor: Colors.surface },
  phaseTabLabel: { fontFamily: "Inter_700Bold", fontSize: 12 },
  phaseTabTime: { fontFamily: "Inter_400Regular", fontSize: 9, color: Colors.textMuted, marginTop: 2, textAlign: "center" },
  phaseDetail: { backgroundColor: Colors.surface, borderWidth: 1, borderRadius: 12, padding: 14, gap: 12 },
  phaseDetailHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  phaseDetailTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  phaseBullets: { gap: 6 },
  phaseBulletRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  phaseBulletAsset: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.textSecondary, width: 90 },
  phaseBulletMove: { fontFamily: "Inter_700Bold", fontSize: 12, width: 64 },
  phaseBulletNote: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted, flex: 1 },
  phaseSummary: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 18, paddingTop: 4, borderTopWidth: 1, borderTopColor: Colors.border },
  phaseTip: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "center" },
  phaseDisclaimer: { flexDirection: "row", alignItems: "flex-start", gap: 5, backgroundColor: Colors.surfaceElevated, borderRadius: 8, padding: 10 },
  phaseDisclaimerText: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted, flex: 1, lineHeight: 16 },

  // Historical playbook
  playbook: { gap: 8 },
  playbookCard: { backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, overflow: "hidden" },
  playbookCardHeader: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  playbookFlag: { fontSize: 22 },
  playbookName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  playbookDate: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  playbookTable: { borderTopWidth: 1, borderTopColor: Colors.border, padding: 10, gap: 0 },
  playbookTableRow: { flexDirection: "row", alignItems: "center" },
  playbookTableDataRow: { borderTopWidth: 1, borderTopColor: Colors.border + "88" },
  playbookPhaseCell: { width: 58, paddingVertical: 7 },
  playbookDataCell: { flex: 1, alignItems: "center", paddingVertical: 7 },
  playbookHeaderText: { fontFamily: "Inter_500Medium", fontSize: 10, color: Colors.textMuted, textAlign: "center" },
  playbookPhaseLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  playbookVal: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  playbookNote: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted, marginTop: 8, lineHeight: 14 },

  // Key drivers
  driversGrid: { gap: 10 },
  driverCard: { backgroundColor: Colors.surface, borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 },
  driverIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  driverTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  driverDetail: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },

  // Period toggle
  periodToggle: { flexDirection: "row", backgroundColor: Colors.surface, borderRadius: 10, padding: 3, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
  periodBtn: { flex: 1, paddingVertical: 7, alignItems: "center", borderRadius: 8 },
  periodBtnActive: { backgroundColor: Colors.accent + "22", borderWidth: 1, borderColor: Colors.accent + "55" },
  periodBtnText: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.textMuted },
  periodBtnTextActive: { color: Colors.accent, fontFamily: "Inter_600SemiBold" },

  // Asset cards
  assetCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border, gap: 10 },
  assetCardPressed: { opacity: 0.75, backgroundColor: Colors.surfaceElevated },
  assetCardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  assetLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  assetFlag: { fontSize: 26 },
  assetName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  assetCategory: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  assetRight: { alignItems: "flex-end", minWidth: 80 },
  assetPrice: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text },
  assetChange: { fontFamily: "Inter_500Medium", fontSize: 12, marginTop: 2 },
  assetBadgeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  assetBadges: { flexDirection: "row", gap: 6, alignItems: "center", flexWrap: "wrap", flex: 1 },
  badge: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  badgeText: { fontFamily: "Inter_500Medium", fontSize: 10 },
  assetDescription: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },

  // Sparkline
  assetSparklineRow: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  sparklineLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted, marginBottom: 2 },
  sparklineWrap: { flex: 1, height: 32, justifyContent: "flex-end" },
  sparklineBars: { flexDirection: "row", alignItems: "flex-end", flex: 1, gap: 1 },
  sparklineBar: { flex: 1, borderRadius: 1, minHeight: 2 },
  sparklineTrend: { fontFamily: "Inter_700Bold", fontSize: 11, marginBottom: 2 },

  // Loading / Error
  loadingWrap: { alignItems: "center", paddingVertical: 32, gap: 12 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textMuted },
  errorWrap: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.dangerDim, borderRadius: 10, padding: 14, marginBottom: 12 },
  errorText: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.danger },
  lastUpdated: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "center", marginTop: 2, marginBottom: 4 },

  // Disclaimer
  disclaimer: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 16, paddingHorizontal: 4 },
  disclaimerText: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted, flex: 1, lineHeight: 16 },
});
