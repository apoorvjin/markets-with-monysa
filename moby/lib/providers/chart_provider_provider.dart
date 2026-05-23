import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'strategy_provider.dart';

enum ChartDataProvider {
  yahoo('Yahoo Finance', 'yahoo');
  // To expose a new provider later, add a line here, e.g.:
  // polygon('Polygon.io', 'polygon');

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
    return ChartDataProvider.values.firstWhere(
      (p) => p.value == saved,
      orElse: () => ChartDataProvider.yahoo,
    );
  }

  Future<void> set(ChartDataProvider p) async {
    state = p;
    final prefs = ref.read(sharedPreferencesProvider);
    await prefs.setString(_key, p.value);
  }
}

final chartProviderProvider =
    NotifierProvider<ChartProviderNotifier, ChartDataProvider>(
        ChartProviderNotifier.new);
