import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

// Injected at app startup so providers can read prefs synchronously.
final sharedPreferencesProvider = Provider<SharedPreferences>(
  (_) => throw UnimplementedError('sharedPreferencesProvider must be overridden in ProviderScope'),
);

enum TradingStrategy { s1, s2, s3, s4, s5, s6, s7, s8, s9 }

extension TradingStrategyExt on TradingStrategy {
  String get label => switch (this) {
        TradingStrategy.s1 => 'S1',
        TradingStrategy.s2 => 'S2',
        TradingStrategy.s3 => 'S3',
        TradingStrategy.s4 => 'S4',
        TradingStrategy.s5 => 'S5',
        TradingStrategy.s6 => 'S6',
        TradingStrategy.s7 => 'S7',
        TradingStrategy.s8 => 'S8',
        TradingStrategy.s9 => 'S9',
      };

  // Server expects "1"–"9" not "S1"–"S9"
  String get serverParam => switch (this) {
        TradingStrategy.s1 => '1',
        TradingStrategy.s2 => '2',
        TradingStrategy.s3 => '3',
        TradingStrategy.s4 => '4',
        TradingStrategy.s5 => '5',
        TradingStrategy.s6 => '6',
        TradingStrategy.s7 => '7',
        TradingStrategy.s8 => '8',
        TradingStrategy.s9 => '9',
      };

  String get name => switch (this) {
        TradingStrategy.s1 => 'Technical',
        TradingStrategy.s2 => 'Multi-Factor',
        TradingStrategy.s3 => 'Hybrid',
        TradingStrategy.s4 => 'Regime-Adaptive',
        TradingStrategy.s5 => 'Professional',
        TradingStrategy.s6 => 'Adaptive Hybrid',
        TradingStrategy.s7 => 'APEX',
        TradingStrategy.s8 => 'Ensemble',
        TradingStrategy.s9 => 'Silver Liquidity Sweep',
      };

  String get description => switch (this) {
        TradingStrategy.s1 => 'RSI, MACD, EMA, Bollinger, ROC, ATR',
        TradingStrategy.s2 => 'S1 + volatility-adaptive thresholds',
        TradingStrategy.s3 => 'S1 (70%) + news sentiment (30%)',
        TradingStrategy.s4 => 'ADX regime detection · Trend & Mean Reversion engines · Volume confirmation',
        TradingStrategy.s5 => '4-regime classification · dynamic weights · consensus gate · OBV · calibrated confidence',
        TradingStrategy.s6 => 'S2 tech + regime-adaptive news blend · freshness decay · source credibility · asymmetric thresholds',
        TradingStrategy.s7 => '5-regime APEX · direction engine per regime · divergence veto · HTF permission · quality gate (60/100) · cross-asset confirmation · regime-aware risk sizing',
        TradingStrategy.s8 => 'S4 + S5 + S7 weighted by per-regime accuracy · 2/3 consensus required · disagreement = no trade · full/reduced position by agreement count',
        TradingStrategy.s9 => 'London/NY kill-zone sessions · liquidity sweep detection · 9 EMA power candle · Fibonacci 44–61.8% POI zone · 0.272/0.618 extension TPs · optimised for Silver (SI=F) intraday',
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
