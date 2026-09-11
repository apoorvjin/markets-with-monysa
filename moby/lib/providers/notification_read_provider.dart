import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Per-device "seen" tracking for the notification history bell — local only,
/// no account/Firestore mirror (unlike [WatchlistNotifier]), since read state
/// has no reason to sync across devices.
class NotificationReadNotifier extends Notifier<Set<String>> {
  static const _key = 'read_notification_ids';

  @override
  Set<String> build() {
    _load();
    return {};
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    state = (prefs.getStringList(_key) ?? const []).toSet();
  }

  Future<void> markRead(Iterable<String> ids) async {
    final next = {...state, ...ids};
    if (next.length == state.length) return;
    state = next;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_key, next.toList());
  }

  bool isRead(String id) => state.contains(id);
}

final notificationReadProvider =
    NotifierProvider<NotificationReadNotifier, Set<String>>(
  NotificationReadNotifier.new,
);
