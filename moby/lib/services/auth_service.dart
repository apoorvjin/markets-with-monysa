import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:purchases_flutter/purchases_flutter.dart';
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
      await cred.user!.sendEmailVerification();
      // Create a Firestore user document so preferences and alerts can sync.
      await FirestoreService.createUserDoc(cred.user!.uid, email.trim());
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
      FirebaseAnalytics.instance.logLogin(loginMethod: 'email').catchError((_) {});
      // Initialise push notifications now that we have an authenticated uid.
      PushNotificationService.init().catchError((_) {});
    } on AuthException {
      rethrow;
    } on FirebaseAuthException catch (e) {
      throw AuthException(_friendlyMessage(e.code));
    }
  }

  static Future<void> resendEmailVerification() async {
    try {
      await _auth.currentUser?.sendEmailVerification();
    } on FirebaseAuthException catch (e) {
      throw AuthException(_friendlyMessage(e.code));
    }
  }

  static Future<void> resetPassword(String email) async {
    try {
      await _auth.sendPasswordResetEmail(email: email.trim());
    } on FirebaseAuthException catch (e) {
      throw AuthException(_friendlyMessage(e.code));
    }
  }

  static Future<void> signOut() async {
    await PushNotificationService.onSignOut().catchError((_) {});
    try {
      await Purchases.logOut();
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
      try {
        await Purchases.logOut();
      } catch (_) {}
      await user.delete();
    } on FirebaseAuthException catch (e) {
      throw AuthException(_friendlyMessage(e.code));
    }
  }

  static Future<void> _linkRevenueCat(String uid) async {
    try {
      final result = await Purchases.logIn(uid);
      EntitlementService.updateFromCustomerInfo(result.customerInfo);
    } catch (_) {}
  }

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
