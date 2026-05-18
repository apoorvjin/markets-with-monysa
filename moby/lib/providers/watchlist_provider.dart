import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

class WatchlistNotifier extends Notifier<List<String>> {
  static const _key = 'watchlist_symbols';

  @override
  List<String> build() {
    _load();
    return [];
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getStringList(_key) ?? [];
    state = saved;
  }

  Future<void> toggle(String symbol) async {
    final next = state.contains(symbol)
        ? state.where((s) => s != symbol).toList()
        : [...state, symbol];
    state = next;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_key, next);
  }

  bool isWatched(String symbol) => state.contains(symbol);
}

final watchlistProvider = NotifierProvider<WatchlistNotifier, List<String>>(
  WatchlistNotifier.new,
);
