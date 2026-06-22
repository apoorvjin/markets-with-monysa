import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final authStateProvider = StreamProvider<User?>((_) {
  try {
    // userChanges() (not authStateChanges()) emits when reload() is called,
    // so the profile badge updates the moment email verification is detected.
    return FirebaseAuth.instance.userChanges();
  } catch (_) {
    return const Stream.empty();
  }
});
