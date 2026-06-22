import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/firestore_service.dart';

class WatchlistNotifier extends Notifier<List<String>> {
  static const _key = 'watchlist_symbols';

  @override
  List<String> build() {
    _load();
    return [];
  }

  Future<void> _load() async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid != null) {
      final fsWatchlist = await FirestoreService.getWatchlist(uid);
      if (fsWatchlist.isNotEmpty) {
        state = fsWatchlist;
        // Mirror to local so offline launch uses the latest cloud list.
        final prefs = await SharedPreferences.getInstance();
        await prefs.setStringList(_key, fsWatchlist);
        return;
      }
    }
    final prefs = await SharedPreferences.getInstance();
    state = prefs.getStringList(_key) ?? [];
  }

  Future<void> toggle(String symbol) async {
    final next = state.contains(symbol)
        ? state.where((s) => s != symbol).toList()
        : [...state, symbol];
    state = next;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_key, next);
    FirestoreService.saveWatchlist(next); // fire-and-forget
  }

  bool isWatched(String symbol) => state.contains(symbol);
}

final watchlistProvider = NotifierProvider<WatchlistNotifier, List<String>>(
  WatchlistNotifier.new,
);
