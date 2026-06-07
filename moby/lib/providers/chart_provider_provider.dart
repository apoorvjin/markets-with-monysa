import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/network/chart_renderer_interceptor.dart';
import 'strategy_provider.dart';

enum ChartDataProvider {
  yahoo('Yahoo Finance', 'yahoo'),
  tradingView('TradingView', 'tradingview'),
  inHouse('In-House (beta)', 'inhouse');

  const ChartDataProvider(this.label, this.value);
  final String label;
  final String value;
}

class ChartProviderNotifier extends Notifier<ChartDataProvider> {
  static const _key = 'chart_provider';

  @override
  ChartDataProvider build() {
    final prefs = ref.watch(sharedPreferencesProvider);
    final saved = prefs.getString(_key);
    final resolved = ChartDataProvider.values.firstWhere(
      (p) => p.value == saved,
      orElse: () => ChartDataProvider.yahoo,
    );
    currentChartRenderer = resolved.value;
    return resolved;
  }

  Future<void> set(ChartDataProvider p) async {
    state = p;
    currentChartRenderer = p.value;
    final prefs = ref.read(sharedPreferencesProvider);
    await prefs.setString(_key, p.value);
  }
}

final chartProviderProvider =
    NotifierProvider<ChartProviderNotifier, ChartDataProvider>(
        ChartProviderNotifier.new);
