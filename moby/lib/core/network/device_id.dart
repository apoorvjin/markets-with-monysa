import 'package:firebase_auth/firebase_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

abstract final class DeviceId {
  static const _key = 'deviceId';
  static String? _cached;

  static Future<String> get() async {
    // Authenticated users send their Firebase UID so the server routes
    // plan lookups to the same key that RevenueCat webhooks write after logIn.
    try {
      final uid = FirebaseAuth.instance.currentUser?.uid;
      if (uid != null) return uid;
    } catch (_) {
      // Firebase not initialized (stub config) — fall through to device UUID.
    }

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
    final now = DateTime.now().millisecondsSinceEpoch;
    final hash = now.hashCode ^ Object.hash(now, now >> 16);
    return '${now.toRadixString(16)}-${hash.abs().toRadixString(16)}'
        '-${(now ^ hash).abs().toRadixString(16)}';
  }
}
