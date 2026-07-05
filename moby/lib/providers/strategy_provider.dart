import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

// Injected at app startup so providers can read prefs synchronously.
final sharedPreferencesProvider = Provider<SharedPreferences>(
  (_) => throw UnimplementedError('sharedPreferencesProvider must be overridden in ProviderScope'),
);

enum TradingStrategy {
  s1, s2, s3, s4, s5, s6, s7, s8, s9,
  s1Plus, s2Plus, s3Plus, s4Plus, s5Plus, s6Plus, s7Plus, s8Plus, s9Plus,
}

extension TradingStrategyExt on TradingStrategy {
  String get label => switch (this) {
        TradingStrategy.s1     => 'S1',
        TradingStrategy.s2     => 'S2',
        TradingStrategy.s3     => 'S3',
        TradingStrategy.s4     => 'S4',
        TradingStrategy.s5     => 'S5',
        TradingStrategy.s6     => 'S6',
        TradingStrategy.s7     => 'S7',
        TradingStrategy.s8     => 'S8',
        TradingStrategy.s9     => 'S9',
        TradingStrategy.s1Plus => 'S1+',
        TradingStrategy.s2Plus => 'S2+',
        TradingStrategy.s3Plus => 'S3+',
        TradingStrategy.s4Plus => 'S4+',
        TradingStrategy.s5Plus => 'S5+',
        TradingStrategy.s6Plus => 'S6+',
        TradingStrategy.s7Plus => 'S7+',
        TradingStrategy.s8Plus => 'S8+',
        TradingStrategy.s9Plus => 'S9+',
      };

  // Server expects "1"–"9" for base, "10"–"18" for enhanced
  String get serverParam => switch (this) {
        TradingStrategy.s1     => '1',
        TradingStrategy.s2     => '2',
        TradingStrategy.s3     => '3',
        TradingStrategy.s4     => '4',
        TradingStrategy.s5     => '5',
        TradingStrategy.s6     => '6',
        TradingStrategy.s7     => '7',
        TradingStrategy.s8     => '8',
        TradingStrategy.s9     => '9',
        TradingStrategy.s1Plus => '10',
        TradingStrategy.s2Plus => '11',
        TradingStrategy.s3Plus => '12',
        TradingStrategy.s4Plus => '13',
        TradingStrategy.s5Plus => '14',
        TradingStrategy.s6Plus => '15',
        TradingStrategy.s7Plus => '16',
        TradingStrategy.s8Plus => '17',
        TradingStrategy.s9Plus => '18',
      };

  String get name => switch (this) {
        TradingStrategy.s1     => 'Technical',
        TradingStrategy.s2     => 'Multi-Factor',
        TradingStrategy.s3     => 'Hybrid',
        TradingStrategy.s4     => 'Regime-Adaptive',
        TradingStrategy.s5     => 'Professional',
        TradingStrategy.s6     => 'Adaptive Hybrid',
        TradingStrategy.s7     => 'APEX',
        TradingStrategy.s8     => 'Ensemble',
        TradingStrategy.s9     => 'Silver Liquidity Sweep',
        TradingStrategy.s1Plus => 'Technical+',
        TradingStrategy.s2Plus => 'Multi-Factor+',
        TradingStrategy.s3Plus => 'Hybrid+',
        TradingStrategy.s4Plus => 'Regime-Adaptive+',
        TradingStrategy.s5Plus => 'Professional+',
        TradingStrategy.s6Plus => 'Adaptive Hybrid+',
        TradingStrategy.s7Plus => 'APEX+',
        TradingStrategy.s8Plus => 'Ensemble+',
        TradingStrategy.s9Plus => 'Silver Liquidity Sweep+',
      };

  String get description => switch (this) {
        TradingStrategy.s1 =>
          'RSI, MACD, EMA, Bollinger, ROC, ATR',
        TradingStrategy.s2 =>
          'S1 + volatility-adaptive thresholds',
        TradingStrategy.s3 =>
          'S1 (70%) + news sentiment (30%)',
        TradingStrategy.s4 =>
          'ADX regime detection · Trend & Mean Reversion engines · Volume confirmation',
        TradingStrategy.s5 =>
          '4-regime classification · dynamic weights · consensus gate · OBV · calibrated confidence',
        TradingStrategy.s6 =>
          'S2 tech + regime-adaptive news blend · freshness decay · source credibility · asymmetric thresholds',
        TradingStrategy.s7 =>
          '5-regime APEX · direction engine per regime · divergence veto · HTF permission · quality gate (60/100) · cross-asset confirmation · regime-aware risk sizing',
        TradingStrategy.s8 =>
          'S4 + S5 + S7 weighted by per-regime accuracy · 2/3 consensus required · disagreement = no trade · full/reduced position by agreement count',
        TradingStrategy.s9 =>
          'London/NY kill-zone sessions · liquidity sweep detection · 9 EMA power candle · Fibonacci 44–61.8% POI zone · 0.272/0.618 extension TPs · optimised for Silver (SI=F) intraday',
        TradingStrategy.s1Plus =>
          'S1 + OBV institutional flow + volume participation gate (thin vol → dampened) + MACD near-crossover bonus',
        TradingStrategy.s2Plus =>
          'S1+ + regime-aware weight shifting (ADX/ATR) + candle direction lock (opposing body ≥30% → 0.72×)',
        TradingStrategy.s3Plus =>
          'S1+ (65%) + enhanced sentiment (35%) · min 3 high-relevance articles · stale news >6h shifts blend to 80/20',
        TradingStrategy.s4Plus =>
          'S4 · neutral ADX zone fixed · BB-width MR amplifier (compressed 1.30×) · trend-mode vol scoring · split thresholds: Trend 0.45 / MR 0.65',
        TradingStrategy.s5Plus =>
          'S5 + vol-spike gate on Volatile Trend · weighted consensus gate (≥60%) · EMA200 stretch penalty by regime',
        TradingStrategy.s6Plus =>
          'S2+ tech + S6+ sentiment · unknown sources 0.35 credibility · stale low-vol news → 80/20 · min 3 articles gate',
        TradingStrategy.s7Plus =>
          'APEX + 2-bar HTF persistence · VWAP in ranging engine · EMA50 direction lock on breakouts · 25-pair cross-asset',
        TradingStrategy.s8Plus =>
          'S4+ + S5+ + S7+ · S7+ abstains (not HOLD) on quality fail · shared regime · differentiated position sizing',
        TradingStrategy.s9Plus =>
          'Sweep 20-bar range (was 10) · Fib POI over 50-bar swing (was 20) · deeper institutional liquidity levels',
      };

  bool get isEnhanced => index >= TradingStrategy.s1Plus.index;

  TradingStrategy? get baseStrategy => switch (this) {
        TradingStrategy.s1Plus => TradingStrategy.s1,
        TradingStrategy.s2Plus => TradingStrategy.s2,
        TradingStrategy.s3Plus => TradingStrategy.s3,
        TradingStrategy.s4Plus => TradingStrategy.s4,
        TradingStrategy.s5Plus => TradingStrategy.s5,
        TradingStrategy.s6Plus => TradingStrategy.s6,
        TradingStrategy.s7Plus => TradingStrategy.s7,
        TradingStrategy.s8Plus => TradingStrategy.s8,
        TradingStrategy.s9Plus => TradingStrategy.s9,
        _ => null,
      };
}

class StrategyNotifier extends Notifier<TradingStrategy> {
  static const _key = 'activeStrategy';

  @override
  TradingStrategy build() {
    final prefs = ref.watch(sharedPreferencesProvider);
    final saved = prefs.getString(_key);
    if (saved == null) return TradingStrategy.s1;
    return TradingStrategy.values.firstWhere(
      (s) => s.label == saved,
      orElse: () => TradingStrategy.s1,
    );
  }

  Future<void> setStrategy(TradingStrategy s) async {
    state = s;
    final prefs = ref.read(sharedPreferencesProvider);
    await prefs.setString(_key, s.label);
  }
}

final strategyProvider =
    NotifierProvider<StrategyNotifier, TradingStrategy>(StrategyNotifier.new);
