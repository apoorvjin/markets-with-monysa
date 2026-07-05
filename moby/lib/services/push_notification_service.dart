import 'dart:io';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import '../core/network/device_id.dart';
import 'firestore_service.dart';

/// Top-level handler required by FCM for background messages.
/// Must be a top-level function (not a class method) and annotated.
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // App is in background or terminated — OS shows the notification automatically
  // from the FCM payload. No Flutter widget context here.
  debugPrint('[FCM] Background: ${message.notification?.title}');
}

/// Manages Firebase Cloud Messaging — permission, token storage, and
/// foreground notification display.
abstract final class PushNotificationService {
  static FirebaseMessaging get _fcm => FirebaseMessaging.instance;

  /// Call once after Firebase.initializeApp() and user is signed in.
  static Future<void> init() async {
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

    // Request permission (iOS shows a system dialog; Android 13+ requires it).
    final settings = await _fcm.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    if (settings.authorizationStatus == AuthorizationStatus.denied) return;

    // iOS: get APNs token first (required before FCM token on iOS).
    if (Platform.isIOS) await _fcm.getAPNSToken();

    await _refreshToken();

    // Re-store token whenever FCM rotates it.
    _fcm.onTokenRefresh.listen(_storeToken);

    // Show in-app notification banner when app is in foreground.
    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);

    // iOS foreground notifications need explicit opt-in.
    await _fcm.setForegroundNotificationPresentationOptions(
      alert: true,
      badge: true,
      sound: true,
    );

    // Subscribe to VIX regime-change alerts (server sends when contango ↔ backwardation flips).
    await _fcm.subscribeToTopic('regime-changes').catchError((_) {});
  }

  static Future<void> _refreshToken() async {
    try {
      final token = await _fcm.getToken();
      if (token != null) await _storeToken(token);
    } catch (_) {}
  }

  static Future<void> _storeToken(String token) async {
    final deviceId = await DeviceId.get();
    final platform = Platform.isIOS ? 'ios' : 'android';
    await FirestoreService.saveFcmToken(
      deviceId: deviceId,
      fcmToken: token,
      platform: platform,
    );
  }

  /// Public entry-point for explicit registration (e.g. from Profile screen).
  /// Identical to _storeToken but callable externally.
  static Future<void> saveToken(String token) => _storeToken(token);

  /// True if this device currently has a local FCM token (Profile screen
  /// notification toggle uses this to render On/Off).
  static Future<bool> isEnabled() async {
    try {
      return await _fcm.getToken() != null;
    } catch (_) {
      return false;
    }
  }

  /// Full opt-in flow for the Profile screen toggle: requests permission,
  /// resolves APNs (iOS) then FCM, and saves to Firestore. Returns false at
  /// the first failed step so the toggle can revert to Off.
  static Future<bool> enable() async {
    try {
      final settings = await _fcm.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        return false;
      }
      if (Platform.isIOS && await _fcm.getAPNSToken() == null) return false;

      final token = await _fcm.getToken();
      if (token == null) return false;

      await _storeToken(token);
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Opt-out for the Profile screen toggle — removes the Firestore device
  /// doc so the server stops sending push. Mirrors [onSignOut].
  static Future<void> disable() => onSignOut();

  static void _handleForegroundMessage(RemoteMessage message) {
    final title = message.notification?.title;
    final body = message.notification?.body;
    if (title == null && body == null) return;
    debugPrint('[FCM] Foreground: $title — $body');
    // The overlay is shown via the global scaffold messenger in app.dart.
    // We store it in a stream that app.dart listens to.
    _foregroundNotificationController.add((title: title ?? '', body: body ?? ''));
  }

  // Simple broadcast so app.dart can show a SnackBar.
  static final _foregroundNotificationController =
      _BroadcastController<({String title, String body})>();

  static Stream<({String title, String body})> get foregroundMessages =>
      _foregroundNotificationController.stream;

  /// Call on sign-out to remove the FCM token from Firestore.
  /// Does NOT call _fcm.deleteToken() — that native API can crash on iOS
  /// when APNs is not yet configured. Deleting the Firestore device doc is
  /// sufficient to stop server-side push delivery.
  static Future<void> onSignOut() async {
    try {
      final deviceId = await DeviceId.get();
      await FirestoreService.removeFcmToken(deviceId);
    } catch (_) {}
  }
}

/// Minimal single-subscription broadcast stream controller.
class _BroadcastController<T> {
  final _listeners = <void Function(T)>[];

  Stream<T> get stream => Stream.multi((c) {
        void handler(T v) => c.add(v);
        _listeners.add(handler);
        c.onCancel = () => _listeners.remove(handler);
      });

  void add(T value) {
    for (final l in _listeners) {
      l(value);
    }
  }
}
