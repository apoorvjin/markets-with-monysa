// History of every server broadcast-notifier firing (VIX regime changes,
// pre-market sector gainers, any future trigger). Mirrors the web contract
// (`frontend/packages/contracts/src/notifications.ts`) 1:1.

/// One past broadcast push, independent of whether the OS notification was
/// ever seen on this device.
class NotificationLogItem {
  const NotificationLogItem({
    required this.id,
    required this.triggerId,
    required this.title,
    required this.body,
    required this.data,
    required this.firedAt,
  });

  final String id;
  final String triggerId;
  final String title;
  final String body;

  /// Freeform per-trigger payload (e.g. premarket-sector's market/phase/
  /// sectors, VIX's ratio) — kept loose so a new trigger never fails parse.
  final Map<String, String> data;

  /// ISO 8601.
  final String firedAt;

  factory NotificationLogItem.fromJson(Map<String, dynamic> j) => NotificationLogItem(
        id: j['id'] as String? ?? '',
        triggerId: j['triggerId'] as String? ?? '',
        title: j['title'] as String? ?? '',
        body: j['body'] as String? ?? '',
        data: (j['data'] as Map?)?.map((k, v) => MapEntry(k.toString(), v.toString())) ??
            const <String, String>{},
        firedAt: j['firedAt'] as String? ?? '',
      );

  /// Milliseconds since epoch, or null when the date is unparseable.
  int? get firedAtMs => DateTime.tryParse(firedAt)?.millisecondsSinceEpoch;
}
