import 'dart:convert';
import 'package:crypto/crypto.dart';

/// Produces HMAC-SHA256 request signatures for the server's signing middleware.
///
/// The shared secret is embedded at build time via:
///   --dart-define=APP_SIGNING_SECRET=<secret>
///
/// When the secret is absent (local dev), [sign] returns null and the
/// [_SigningInterceptor] skips the header, matching the server's dev-mode bypass.
abstract final class RequestSigner {
  static const _secret = String.fromEnvironment('APP_SIGNING_SECRET');

  /// Returns `"<timestamp>.<hmac>"` or null when no secret is configured.
  static String? sign() {
    if (_secret.isEmpty) return null;
    final ts = DateTime.now().millisecondsSinceEpoch.toString();
    final key = utf8.encode(_secret);
    final hmac = Hmac(sha256, key).convert(utf8.encode(ts)).toString();
    return '$ts.$hmac';
  }
}
