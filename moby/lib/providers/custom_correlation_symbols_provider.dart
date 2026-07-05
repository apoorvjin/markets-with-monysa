import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// User-pinned symbols for the "Adv Correlation" tab's custom-picks section.
/// Purely local (no Firestore sync) — a personal scratchpad, not a synced
/// watchlist. Capped at 12 to match the server's /correlation/advanced/custom
/// symbol limit.
class CustomCorrelationSymbolsNotifier extends Notifier<List<String>> {
  static const _key = 'correlation_custom_symbols';
  static const maxSymbols = 12;

  @override
  List<String> build() {
    _load();
    return [];
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    state = prefs.getStringList(_key) ?? [];
  }

  Future<void> add(String symbol) async {
    if (state.contains(symbol) || state.length >= maxSymbols) return;
    state = [...state, symbol];
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_key, state);
  }

  Future<void> remove(String symbol) async {
    state = state.where((s) => s != symbol).toList();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_key, state);
  }
}

final customCorrelationSymbolsProvider =
    NotifierProvider<CustomCorrelationSymbolsNotifier, List<String>>(
  CustomCorrelationSymbolsNotifier.new,
);
