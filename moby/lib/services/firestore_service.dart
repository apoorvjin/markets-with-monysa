import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Thin Firestore helpers. All methods are fire-and-forget unless noted.
/// Returns silently when user is not signed in or Firestore is unavailable.
abstract final class FirestoreService {
  // Uses the named database (monysa-db-id); overridable via --dart-define=FIRESTORE_DATABASE_ID.
  // instanceFor() caches per app+databaseId, so this getter is safe to call on every access.
  static FirebaseFirestore get _db {
    const dbId = String.fromEnvironment(
      'FIRESTORE_DATABASE_ID',
      defaultValue: 'monysa-db-id',
    );
    if (dbId == '(default)') return FirebaseFirestore.instance;
    return FirebaseFirestore.instanceFor(app: Firebase.app(), databaseId: dbId);
  }
  static String? get _uid => FirebaseAuth.instance.currentUser?.uid;

  // ── User document ────────────────────────────────────────────────────────

  static Future<void> createUserDoc(String uid, String email) async {
    await _db.collection('users').doc(uid).set({
      'email': email,
      'createdAt': FieldValue.serverTimestamp(),
      'preferences': {
        'theme': 'dark',
        'fontSize': 'regular',
        'chartProvider': 'yahoo',
      },
      'watchlist': <String>[],
    }, SetOptions(merge: true));
  }

  /// Returns the user's preferences map or null if doc doesn't exist.
  static Future<Map<String, dynamic>?> getUserPrefs(String uid) async {
    try {
      final doc = await _db.collection('users').doc(uid).get();
      if (!doc.exists) return null;
      final data = doc.data();
      final prefs = data?['preferences'];
      return prefs is Map ? Map<String, dynamic>.from(prefs as Map) : null;
    } catch (_) {
      return null;
    }
  }

  static void updatePrefs(Map<String, dynamic> updates) {
    final uid = _uid;
    if (uid == null) return;
    final prefixed = updates.map((k, v) => MapEntry('preferences.$k', v));
    _db
        .collection('users')
        .doc(uid)
        .update(prefixed)
        .catchError((_) {});
  }

  // ── Watchlist ────────────────────────────────────────────────────────────

  static void saveWatchlist(List<String> symbols) {
    final uid = _uid;
    if (uid == null) return;
    _db
        .collection('users')
        .doc(uid)
        .update({'watchlist': symbols})
        .catchError((_) {});
  }

  static Future<List<String>> getWatchlist(String uid) async {
    try {
      final doc = await _db.collection('users').doc(uid).get();
      final raw = doc.data()?['watchlist'];
      if (raw is List) return List<String>.from(raw);
    } catch (_) {}
    return [];
  }

  // ── Alerts ───────────────────────────────────────────────────────────────

  static void saveAlert(Map<String, dynamic> alertJson) {
    final uid = _uid;
    if (uid == null) return;
    _db
        .collection('users')
        .doc(uid)
        .collection('alerts')
        .doc(alertJson['id'] as String)
        .set({
          ...alertJson,
          'triggered': false,
          'triggeredAt': null,
          'createdAt': FieldValue.serverTimestamp(),
        })
        .catchError((_) {});
  }

  static void deleteAlert(String alertId) {
    final uid = _uid;
    if (uid == null) return;
    _db
        .collection('users')
        .doc(uid)
        .collection('alerts')
        .doc(alertId)
        .delete()
        .catchError((_) {});
  }

  /// Fetch non-triggered alerts from Firestore (used on sign-in to seed local cache).
  static Future<List<Map<String, dynamic>>> getAlerts(String uid) async {
    try {
      final snap = await _db
          .collection('users')
          .doc(uid)
          .collection('alerts')
          .where('triggered', isEqualTo: false)
          .get();
      return snap.docs.map((d) => d.data()).toList();
    } catch (_) {
      return [];
    }
  }

  // ── Cross-device seed ────────────────────────────────────────────────────

  /// Called in main() BEFORE ProviderScope mounts so synchronous providers
  /// (theme, chart provider) pick up Firestore values on a new device.
  static Future<void> seedPrefsFromFirestore(
    String uid,
    SharedPreferences prefs,
  ) async {
    final fsPrefs = await getUserPrefs(uid);
    if (fsPrefs == null) return;
    if (fsPrefs['theme'] is String) {
      await prefs.setString('themeMode', fsPrefs['theme'] as String);
    }
    if (fsPrefs['fontSize'] is String) {
      await prefs.setString('font_size_scale', fsPrefs['fontSize'] as String);
    }
    if (fsPrefs['chartProvider'] is String) {
      await prefs.setString('chart_provider', fsPrefs['chartProvider'] as String);
    }
  }

  // ── FCM device tokens ────────────────────────────────────────────────────

  static Future<void> saveFcmToken({
    required String deviceId,
    required String fcmToken,
    required String platform,
  }) async {
    final uid = _uid;
    if (uid == null) return;
    await _db
        .collection('users')
        .doc(uid)
        .collection('devices')
        .doc(deviceId)
        .set({
          'fcmToken': fcmToken,
          'platform': platform,
          'updatedAt': FieldValue.serverTimestamp(),
        }, SetOptions(merge: true));
  }

  static Future<void> removeFcmToken(String deviceId) async {
    final uid = _uid;
    if (uid == null) return;
    await _db
        .collection('users')
        .doc(uid)
        .collection('devices')
        .doc(deviceId)
        .delete();
  }
}
