import 'dart:ui';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../core/network/api_endpoints.dart';

// Single source of truth for the strategy explainer sheets (Trading + Asset
// Detail). Server /api/trading/strategies is authoritative; kStrategyDefsFallback
// is the offline fallback. Renaming a strategy => update server STRATEGY_DEFS AND
// this fallback (see CLAUDE.md 'Strategy display name vs code/function name').

class StrategyDef {
  const StrategyDef({
    required this.label,
    required this.title,
    required this.description,
    required this.detail,
    required this.accentHex,
  });
  final String label;
  final String title;
  final String description;
  final String detail;
  final String accentHex;

  factory StrategyDef.fromJson(Map<String, dynamic> j) => StrategyDef(
        label: j['label'] as String,
        title: j['title'] as String,
        description: j['description'] as String,
        detail: j['detail'] as String,
        accentHex: j['accentHex'] as String,
      );

  Color get accentColor {
    final hex = accentHex.replaceAll('#', '');
    return Color(int.parse('FF$hex', radix: 16));
  }
}

const kStrategyDefsFallback = [
  StrategyDef(
      label: 'S1',
      title: 'Core Signals',
      description:
          'Pure price-action signals using momentum and volatility indicators.',
      detail:
          'RSI-14 · MACD · EMA crossovers · Bollinger Bands · ATR · Rate of Change',
      accentHex: '00D4AA'),
  StrategyDef(
      label: 'S2',
      title: 'Volatility-Weighted',
      description:
          'Builds on S1 with volatility-adaptive entry and exit thresholds.',
      detail:
          'All S1 indicators + dynamic thresholds calibrated to current market vol',
      accentHex: 'FFB84D'),
  StrategyDef(
      label: 'S3',
      title: 'News Blend',
      description:
          'Blends technical signals with real-time news sentiment scoring.',
      detail: 'S1 signals (65%) + NLP sentiment from latest headlines (35%)',
      accentHex: 'FF4D6A'),
  StrategyDef(
      label: 'S4',
      title: 'Dual-Engine',
      description:
          'Detects market regime first, then activates the right engine — Trend or Mean Reversion.',
      detail:
          'ADX > 25 → Trend Engine (EMA200 1.2×, MACD, Volume) · ADX < 18 → Range Engine (RSI, Bollinger, ATR) · High-conviction threshold (0.55)',
      accentHex: '00C49A'),
  StrategyDef(
      label: 'S5',
      title: 'Quant Regime',
      description:
          'Four-regime classification with dynamic indicator weights, consensus gate, and calibrated confidence — built for high-probability setups.',
      detail:
          'Quiet Trend (0.45) · Quiet Range (0.60) · Volatile Trend (0.65) · Chaotic → No Trade · ≥60% consensus required · OBV + volume confirmation · score-to-win-rate calibration',
      accentHex: 'FFB84D'),
  StrategyDef(
      label: 'S6',
      title: 'Adaptive News',
      description:
          'Regime-aware fusion of S2 technical signals and enhanced news sentiment — weights shift automatically based on volatility and trend strength.',
      detail:
          'High-vol: tech 90% / news 10% · Strong-trend: 85/15 · Low-vol: 60/40 · Default: 70/30 · Freshness decay · Source credibility · Negation detection · BUY >0.45 / SELL <−0.35',
      accentHex: '00D4AA'),
  StrategyDef(
      label: 'S7',
      title: 'APEX — Quality-Gated Regime Engine',
      description:
          'Five-regime classifier with regime-specific direction engines, divergence veto, higher-timeframe permission layer, and a 0–100 quality gate that must hit 60 before any trade fires.',
      detail:
          'Strong Trend · Weak Trend · Ranging · Volatile Breakout · Chaotic (no trade) · VWAP · OBV · Divergence veto · HTF alignment · Cross-asset confirmation · Regime-aware SL/TP (1:1.8 → 2:4.5)',
      accentHex: 'FF4D6A'),
  StrategyDef(
      label: 'S8',
      title: 'Consensus Vote — S4 + S5 + S7',
      description:
          'Runs three strategies simultaneously and weights their votes by per-regime historical accuracy. Requires 2 of 3 to agree before firing — when engines split, the answer is HOLD.',
      detail:
          'Strong Trend: S7 50% · S4 35% · S5 15% · Ranging: S5 45% · S7 35% · S4 20% · Volatile Break: S7 55% · S4 35% · S5 10% · Full position on 3/3 · 60% size on 2/3 · No trade on 1/3 or split',
      accentHex: '00C49A'),
  StrategyDef(
      label: 'S9',
      title: 'Silver Liquidity Sweep',
      description:
          'Session-gated stop-hunt entries at Fibonacci confluence — optimised for Silver (SI=F) intraday. Fires only when all four conditions align simultaneously.',
      detail:
          'London KZ (02:00–05:00 ET) · NY KZ (07:00–10:00 ET) · Liquidity sweep (wick beyond recent H/L, close back inside) · 9 EMA power candle (body >60% of range) · Fib 0.618/0.786 long · Fib 0.236/0.382 short',
      accentHex: 'C0C0C0'),
  // ── Enhanced strategies ─────────────────────────────────────────────────────
  StrategyDef(
      label: 'S1+',
      title: 'Core Signals+',
      description:
          'S1 enhanced with OBV institutional flow scoring and volume-participation gate.',
      detail:
          'All S1 indicators + OBV slope + volume gate (sub-50% avg → 0.55×) + MACD near-crossover bonus · Threshold 0.35',
      accentHex: '00D4AA'),
  StrategyDef(
      label: 'S2+',
      title: 'Volatility-Weighted+',
      description:
          'S2 with regime-aware weight shifting and candle-body direction lock.',
      detail:
          'S1+ base + ADX regime weights + candle direction lock (opposing body ≥30% → 0.72×) · Threshold 0.35',
      accentHex: 'FFB84D'),
  StrategyDef(
      label: 'S3+',
      title: 'News Blend+',
      description:
          'S3 with stricter news quality gate and adaptive blend that shifts when news is stale.',
      detail:
          'S1+ (65%) + enhanced sentiment (35%) · Relevance ≥0.5 · Min 3 articles · Stale >6h → 80/20 split',
      accentHex: 'FF4D6A'),
  StrategyDef(
      label: 'S4+',
      title: 'Dual-Engine+',
      description:
          'S4 with fixed neutral-zone engine, BB-width amplifier in MR mode, and volume scoring in Trend.',
      detail:
          'ADX 18–25 → Weak Trend (0.70×) · MR + BB-width amp (compressed 1.30×) · Vol confirms trend · Trend 0.45 / MR 0.65',
      accentHex: '00C49A'),
  StrategyDef(
      label: 'S5+',
      title: 'Quant Regime+',
      description:
          'S5 with volume-spike gate, weighted consensus gate, and EMA200 stretch penalty.',
      detail:
          'S5 + vol ≥1.5× for Volatile Trend · Weighted consensus ≥60% · EMA200 stretch >4%/8% → penalty',
      accentHex: 'FFB84D'),
  StrategyDef(
      label: 'S6+',
      title: 'Adaptive News+',
      description:
          'S6 with stricter source credibility, stale-news penalty, and minimum article gate.',
      detail:
          'S2+ tech + S6+ sentiment · Unknown sources 0.35 · Stale low-vol → 80/20 · Min 3 articles gate',
      accentHex: '00D4AA'),
  StrategyDef(
      label: 'S7+',
      title: 'APEX+ — 2-Bar HTF · Expanded Cross-Asset',
      description:
          'APEX with 2-bar HTF persistence, VWAP in ranging engine, EMA50 direction lock, and 25-pair cross-asset map.',
      detail:
          'All S7 + 2-bar HTF confirmation + Range: VWAP (0.8×) + Breakout: EMA50 lock + 25 cross-asset pairs',
      accentHex: 'FF4D6A'),
  StrategyDef(
      label: 'S8+',
      title: 'Consensus Vote+ — Regime-Shared · S7 Abstention',
      description:
          'S8 with S7+ abstaining on quality fail, shared regime across sub-strategies, and differentiated sizing.',
      detail:
          'S4+ + S5+ + S7+ · S7+ abstains (not HOLD) when quality <60 · Full/50% risk by agreement set · Threshold 0.38',
      accentHex: '00C49A'),
  StrategyDef(
      label: 'S9+',
      title: 'Silver Liquidity Sweep+',
      description:
          'S9 with extended sweep lookback (20 bars) and wider Fibonacci structure (50 bars).',
      detail:
          'Sweep: 20-bar range (was 10) · Fib POI: 50-bar swing (was 20) · Captures deeper institutional liquidity levels',
      accentHex: 'C0C0C0'),
];

final strategyDefsProvider = FutureProvider<List<StrategyDef>>((ref) async {
  try {
    final data = await ApiClient.instance.get(ApiEndpoints.tradingStrategies)
        as Map<String, dynamic>;
    final list = data['strategies'] as List;
    return list
        .map((e) => StrategyDef.fromJson(e as Map<String, dynamic>))
        .toList();
  } catch (_) {
    return kStrategyDefsFallback;
  }
});
