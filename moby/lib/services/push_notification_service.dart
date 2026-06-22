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
  static Future<void> onSignOut() async {
    try {
      final deviceId = await DeviceId.get();
      await FirestoreService.removeFcmToken(deviceId);
      await _fcm.deleteToken();
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
