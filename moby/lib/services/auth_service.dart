import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:purchases_flutter/purchases_flutter.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import '../core/network/api_client.dart';
import '../core/network/api_endpoints.dart';
import 'entitlement_service.dart';
import 'firestore_service.dart';
import 'push_notification_service.dart';

class AuthException implements Exception {
  final String message;
  const AuthException(this.message);
  @override
  String toString() => message;
}

abstract final class AuthService {
  static final _auth = FirebaseAuth.instance;

  static User? get currentUser => _auth.currentUser;

  static Future<void> signUpWithEmail(String email, String password) async {
    try {
      final cred = await _auth.createUserWithEmailAndPassword(
        email: email.trim(),
        password: password,
      );
      await _sendVerificationEmail(cred.user!);
      FirestoreService.createUserDoc(cred.user!.uid, email.trim()).catchError((_) {});
      FirebaseAnalytics.instance.logSignUp(signUpMethod: 'email').catchError((_) {});
    } on FirebaseAuthException catch (e) {
      throw AuthException(_friendlyMessage(e.code));
    }
  }

  static Future<void> signInWithEmail(String email, String password) async {
    try {
      final cred = await _auth.signInWithEmailAndPassword(
        email: email.trim(),
        password: password,
      );
      final user = cred.user!;
      if (!user.emailVerified) {
        await _auth.signOut();
        throw const AuthException(
          'Please verify your email before signing in. Check your inbox.',
        );
      }
      await _linkRevenueCat(user.uid);
      // Backfill Firestore doc for users who existed before Firestore was added.
      // merge:true means this never overwrites existing fields.
      FirestoreService.createUserDoc(user.uid, user.email ?? email.trim())
          .catchError((_) {});
      FirebaseAnalytics.instance.logLogin(loginMethod: 'email').catchError((_) {});
      // Push notification init is intentionally NOT called here.
      // Calling native FCM APIs (requestPermission / getAPNSToken) mid-navigation
      // can crash on iOS. main.dart calls init() on the next launch when the user
      // is already signed in — one-session delay is acceptable.
    } on AuthException {
      rethrow;
    } on FirebaseAuthException catch (e) {
      throw AuthException(_friendlyMessage(e.code));
    }
  }

  /// Returns silently (no error) if the user dismisses the Google chooser.
  static Future<void> signInWithGoogle() async {
    try {
      final googleUser = await GoogleSignIn().signIn();
      if (googleUser == null) return;
      final googleAuth = await googleUser.authentication;
      final credential = GoogleAuthProvider.credential(
        accessToken: googleAuth.accessToken,
        idToken: googleAuth.idToken,
      );
      await _signInWithCredential(credential, method: 'google');
    } on FirebaseAuthException catch (e) {
      throw AuthException(_oauthFriendlyMessage(e.code));
    } catch (_) {
      throw const AuthException('Google sign-in failed. Please try again.');
    }
  }

  /// Returns silently (no error) if the user dismisses the Apple sheet.
  static Future<void> signInWithApple() async {
    try {
      final rawNonce = _generateNonce();
      final appleCredential = await SignInWithApple.getAppleIDCredential(
        scopes: [
          AppleIDAuthorizationScopes.email,
          AppleIDAuthorizationScopes.fullName,
        ],
        nonce: _sha256ofString(rawNonce),
      );
      final credential = OAuthProvider('apple.com').credential(
        idToken: appleCredential.identityToken,
        rawNonce: rawNonce,
        // Apple's authorizationCode — Firebase needs this alongside the
        // idToken to validate against Apple's OAuth system, otherwise it
        // rejects with invalid-credential "Invalid Auth response from apple.com".
        accessToken: appleCredential.authorizationCode,
      );
      final userCred =
          await _signInWithCredential(credential, method: 'apple');
      // Apple only returns givenName/familyName on the FIRST authorization ever
      // granted to this app — must persist now or it's gone on future sign-ins.
      final user = userCred.user;
      final fullName = [appleCredential.givenName, appleCredential.familyName]
          .whereType<String>()
          .join(' ')
          .trim();
      if (fullName.isNotEmpty && user != null && user.displayName == null) {
        await user.updateDisplayName(fullName);
      }
    } on SignInWithAppleAuthorizationException catch (e) {
      if (e.code == AuthorizationErrorCode.canceled) return;
      throw const AuthException('Apple sign-in failed. Please try again.');
    } on FirebaseAuthException catch (e) {
      throw AuthException(_oauthFriendlyMessage(e.code));
    } catch (_) {
      throw const AuthException('Apple sign-in failed. Please try again.');
    }
  }

  static Future<UserCredential> _signInWithCredential(
    AuthCredential credential, {
    required String method,
  }) async {
    final userCred = await _auth.signInWithCredential(credential);
    final user = userCred.user!;
    await _linkRevenueCat(user.uid);
    FirestoreService.createUserDoc(user.uid, user.email ?? '')
        .catchError((_) {});
    final isNewUser = userCred.additionalUserInfo?.isNewUser ?? false;
    if (isNewUser) {
      FirebaseAnalytics.instance.logSignUp(signUpMethod: method).catchError((_) {});
    } else {
      FirebaseAnalytics.instance.logLogin(loginMethod: method).catchError((_) {});
    }
    return userCred;
  }

  static String _generateNonce([int length = 32]) {
    const charset =
        '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';
    final random = Random.secure();
    return List.generate(length, (_) => charset[random.nextInt(charset.length)])
        .join();
  }

  static String _sha256ofString(String input) =>
      sha256.convert(utf8.encode(input)).toString();

  static Future<void> resendEmailVerification() async {
    final user = _auth.currentUser;
    if (user == null) return;
    try {
      await _sendVerificationEmail(user);
    } on FirebaseAuthException catch (e) {
      throw AuthException(_friendlyMessage(e.code));
    }
  }

  /// Sends the FinBrio-branded verification email via the server (Resend).
  /// Falls back to Firebase's own stock-template email if the server is
  /// unreachable or Resend isn't configured — this endpoint's template can't
  /// be branded through the Firebase console (Google locks it for anti-spam).
  static Future<void> _sendVerificationEmail(User user) async {
    try {
      final idToken = await user.getIdToken();
      final result = await ApiClient.instance.post(
        ApiEndpoints.sendVerificationEmail,
        options: Options(headers: {'Authorization': 'Bearer $idToken'}),
      );
      if (result is Map && result['sent'] == true) return;
    } catch (_) {}
    await user.sendEmailVerification();
  }

  static Future<void> resetPassword(String email) async {
    try {
      await _auth.sendPasswordResetEmail(email: email.trim());
    } on FirebaseAuthException catch (e) {
      throw AuthException(_friendlyMessage(e.code));
    }
  }

  static Future<void> signOut() async {
    PushNotificationService.onSignOut().catchError((_) {}); // fire-and-forget
    if (EntitlementService.isRevenueCatConfigured) {
      try {
        await Purchases.logOut();
      } catch (_) {}
    }
    // Clears Google's cached account so the chooser reappears next sign-in
    // instead of silently reusing the last account. No-op if never signed in.
    try {
      await GoogleSignIn().signOut();
    } catch (_) {}
    await _auth.signOut();
  }

  static Future<void> deleteAccount(String password) async {
    final user = _auth.currentUser;
    if (user == null || user.email == null) return;
    try {
      final cred = EmailAuthProvider.credential(
        email: user.email!,
        password: password,
      );
      await user.reauthenticateWithCredential(cred);
      if (EntitlementService.isRevenueCatConfigured) {
        try {
          await Purchases.logOut();
        } catch (_) {}
      }
      await user.delete();
    } on FirebaseAuthException catch (e) {
      throw AuthException(_friendlyMessage(e.code));
    }
  }

  static Future<void> _linkRevenueCat(String uid) async {
    if (!EntitlementService.isRevenueCatConfigured) return;
    try {
      final result = await Purchases.logIn(uid);
      EntitlementService.updateFromCustomerInfo(result.customerInfo);
    } catch (_) {}
  }

  // 'invalid-credential' means the OAuth token itself was rejected (expired,
  // clock skew, revoked), not a wrong password — don't reuse the password copy.
  static String _oauthFriendlyMessage(String code) => code == 'invalid-credential'
      ? 'Sign-in failed. Please try again.'
      : _friendlyMessage(code);

  static String _friendlyMessage(String code) => switch (code) {
        'email-already-in-use' =>
          'An account with this email already exists.',
        'invalid-email' => 'Please enter a valid email address.',
        'weak-password' => 'Password must be at least 6 characters.',
        'user-not-found' => 'No account found with this email.',
        'wrong-password' => 'Incorrect password.',
        'invalid-credential' => 'Incorrect email or password.',
        'too-many-requests' => 'Too many attempts. Try again later.',
        'user-disabled' => 'This account has been disabled.',
        'network-request-failed' =>
          'Network error. Check your connection.',
        _ => 'Something went wrong. Please try again.',
      };
}
