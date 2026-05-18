import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum TradingStrategy { s1, s2, s3, s4, s5, s6, s7, s8 }

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
      };

  // Server expects "1"–"8" not "S1"–"S8"
  String get serverParam => switch (this) {
        TradingStrategy.s1 => '1',
        TradingStrategy.s2 => '2',
        TradingStrategy.s3 => '3',
        TradingStrategy.s4 => '4',
        TradingStrategy.s5 => '5',
        TradingStrategy.s6 => '6',
        TradingStrategy.s7 => '7',
        TradingStrategy.s8 => '8',
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
      };
}

class StrategyNotifier extends Notifier<TradingStrategy> {
  static const _key = 'activeStrategy';

  @override
  TradingStrategy build() {
    _load();
    return TradingStrategy.s1;
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_key);
    if (saved != null) {
      state = TradingStrategy.values.firstWhere(
        (s) => s.label == saved,
        orElse: () => TradingStrategy.s1,
      );
    }
  }

  Future<void> setStrategy(TradingStrategy s) async {
    state = s;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, s.label);
  }
}

final strategyProvider =
    NotifierProvider<StrategyNotifier, TradingStrategy>(StrategyNotifier.new);
