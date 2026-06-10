import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

/// Tiny JSON-on-disk cache for API payloads.
///
/// Persists `{ ts: epoch_ms, payload: <json> }` under a versioned key in
/// SharedPreferences so a cold app start can paint instantly while the
/// network refresh runs in the background, and so network failures fall
/// back to last-good data instead of an empty screen.
///
/// Bump [_schemaVersion] whenever the cached payload shape changes — every
/// stored entry under the old version is then ignored and overwritten on
/// next write.
class DiskCache {
  DiskCache._();
  static final DiskCache instance = DiskCache._();

  // Bump on incompatible payload shape changes.
  static const int _schemaVersion = 1;
  static const String _prefix = 'dcache.v$_schemaVersion.';

  Future<SharedPreferences> get _prefs => SharedPreferences.getInstance();

  /// Read a cached payload. Returns null if missing, expired, or unparseable.
  Future<T?> read<T>(
    String key, {
    required Duration ttl,
    required T Function(Object json) decode,
  }) async {
    final prefs = await _prefs;
    final raw = prefs.getString('$_prefix$key');
    if (raw == null) return null;
    try {
      final wrap = jsonDecode(raw) as Map<String, dynamic>;
      final ts = wrap['ts'] as int?;
      if (ts == null) return null;
      if (DateTime.now().millisecondsSinceEpoch - ts > ttl.inMilliseconds) {
        return null;
      }
      final payload = wrap['payload'] as Object?;
      if (payload == null) return null;
      return decode(payload);
    } catch (_) {
      // Corrupt entry — ignore and let the caller re-fetch.
      return null;
    }
  }

  /// Read the last-good payload regardless of TTL (used for offline fallback).
  Future<T?> readStale<T>(
    String key, {
    required T Function(Object json) decode,
  }) async {
    final prefs = await _prefs;
    final raw = prefs.getString('$_prefix$key');
    if (raw == null) return null;
    try {
      final wrap = jsonDecode(raw) as Map<String, dynamic>;
      final payload = wrap['payload'] as Object?;
      if (payload == null) return null;
      return decode(payload);
    } catch (_) {
      return null;
    }
  }

  Future<void> write(String key, Object payload) async {
    final prefs = await _prefs;
    final wrap = jsonEncode({
      'ts': DateTime.now().millisecondsSinceEpoch,
      'payload': payload,
    });
    await prefs.setString('$_prefix$key', wrap);
  }

  Future<void> remove(String key) async {
    final prefs = await _prefs;
    await prefs.remove('$_prefix$key');
  }
}
