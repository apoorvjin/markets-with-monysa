import 'package:shared_preferences/shared_preferences.dart';

/// Generates a random UUID-style device ID on first run and persists it.
/// Used as X-Device-ID header so the server can apply per-device rate limits.
abstract final class DeviceId {
  static const _key = 'deviceId';
  static String? _cached;

  static Future<String> get() async {
    if (_cached != null) return _cached!;
    final prefs = await SharedPreferences.getInstance();
    var id = prefs.getString(_key);
    if (id == null) {
      id = _generate();
      await prefs.setString(_key, id);
    }
    _cached = id;
    return id;
  }

  static String _generate() {
    // Simple 128-bit hex UUID (no dart:math Random.secure needed —
    // this is a device fingerprint, not a cryptographic secret).
    final now = DateTime.now().millisecondsSinceEpoch;
    final hash = now.hashCode ^ Object.hash(now, now >> 16);
    return '${now.toRadixString(16)}-${hash.abs().toRadixString(16)}'
        '-${(now ^ hash).abs().toRadixString(16)}';
  }
}
