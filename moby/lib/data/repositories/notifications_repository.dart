import '../models/notification_log_item.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';

/// Fetches the broadcast-notifier history log (bell icon on every main tab).
/// Mirrors [WireRepository]'s in-memory-cache + stale-fallback shape.
class NotificationsRepository {
  NotificationsRepository._();
  static final NotificationsRepository instance = NotificationsRepository._();

  static const _ttl = Duration(seconds: 30);

  List<NotificationLogItem>? _cache;
  DateTime? _fetchedAt;

  Future<List<NotificationLogItem>> fetchLog({bool force = false}) async {
    final fetchedAt = _fetchedAt;
    if (!force &&
        _cache != null &&
        fetchedAt != null &&
        DateTime.now().difference(fetchedAt) < _ttl) {
      return _cache!;
    }
    try {
      final data = await ApiClient.instance.get(ApiEndpoints.notificationLog())
          as Map<String, dynamic>;
      final items = (data['items'] as List? ?? const [])
          .map((e) => NotificationLogItem.fromJson(e as Map<String, dynamic>))
          .toList();
      _cache = items;
      _fetchedAt = DateTime.now();
      return items;
    } catch (_) {
      final stale = _cache;
      if (stale != null) return stale;
      rethrow;
    }
  }
}
