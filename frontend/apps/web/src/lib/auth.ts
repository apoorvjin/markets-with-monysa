import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { auth } from "./firebase";
import { baseUrl } from "./api";

/** Thrown with a user-facing message — mirrors mobile's AuthException. */
export class AuthError extends Error {}

// Same friendly copy as mobile (auth_service.dart `_friendlyMessage`).
function friendlyMessage(code: string): string {
  switch (code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/user-not-found":
      return "No account found with this email.";
    case "auth/wrong-password":
      return "Incorrect password.";
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Try again later.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/network-request-failed":
      return "Network error. Check your connection.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Sign-in was cancelled.";
    default:
      return "Something went wrong. Please try again.";
  }
}

function toAuthError(e: unknown): AuthError {
  const code = (e as { code?: string })?.code ?? "";
  return new AuthError(friendlyMessage(code));
}

/** Sends the FinBrio-branded verification email via the server (Resend), same
 *  as mobile. Falls back to Firebase's own template if the server is
 *  unreachable or Resend isn't configured — Firebase locks its own template. */
async function sendBrandedVerification(user: User): Promise<void> {
  try {
    const idToken = await user.getIdToken();
    const res = await fetch(`${baseUrl}/api/auth/send-verification-email`, {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (res.ok) {
      const body = (await res.json()) as { sent?: boolean };
      if (body.sent === true) return;
    }
  } catch {
    // fall through to Firebase's stock template
  }
  await sendEmailVerification(user);
}

export async function signUpWithEmail(
  name: string,
  email: string,
  password: string,
): Promise<void> {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
    await sendBrandedVerification(cred.user);
  } catch (e) {
    throw toAuthError(e);
  }
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    if (!cred.user.emailVerified) {
      // Mirror mobile: block unverified sign-in and sign back out.
      await fbSignOut(auth);
      throw new AuthError(
        "Please verify your email before signing in. Check your inbox.",
      );
    }
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw toAuthError(e);
  }
}

export async function signInWithGoogle(): Promise<void> {
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
    // Google accounts are always verified — no email-verification gate needed.
  } catch (e) {
    const code = (e as { code?: string })?.code ?? "";
    // Silent no-op when the user simply closes the popup.
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
      return;
    }
    throw toAuthError(e);
  }
}

export async function resendVerification(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  try {
    await sendBrandedVerification(user);
  } catch (e) {
    throw toAuthError(e);
  }
}

export async function resetPassword(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (e) {
    throw toAuthError(e);
  }
}

export async function signOut(): Promise<void> {
  await fbSignOut(auth);
}
