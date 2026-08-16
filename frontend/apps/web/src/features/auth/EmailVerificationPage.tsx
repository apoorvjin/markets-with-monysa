import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { auth } from "../../lib/firebase";
import { AuthError, resendVerification, signOut } from "../../lib/auth";
import { useSession } from "../../lib/session";

export function EmailVerificationPage() {
  const navigate = useNavigate();
  const { user, refreshPlan } = useSession();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Poll for verification — Firebase doesn't push emailVerified changes, so
  // reload() the user until it flips, then continue into the app.
  useEffect(() => {
    const id = setInterval(async () => {
      const u = auth.currentUser;
      if (!u) return;
      try {
        await u.reload();
        if (u.emailVerified) {
          clearInterval(id);
          await refreshPlan();
          navigate({ to: "/markets" });
        }
      } catch {
        // transient — keep polling
      }
    }, 4000);
    return () => clearInterval(id);
  }, [navigate, refreshPlan]);

  async function resend() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await resendVerification();
      setNotice("Verification email sent. Check your inbox.");
    } catch (e) {
      setError(e instanceof AuthError ? e.message : "Could not resend. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function useAnother() {
    await signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand-dot" />
          <span className="auth-brand-word">
            Fin<span className="auth-brand-accent">Brio</span>
          </span>
        </div>
        <h1 className="auth-title">Verify your email</h1>
        <p className="auth-sub">
          We sent a verification link to{" "}
          <strong>{user?.email ?? "your email"}</strong>. Click it, and this page
          will continue automatically.
        </p>

        {error && <div className="auth-error">{error}</div>}
        {notice && <div className="auth-notice">{notice}</div>}

        <button
          type="button"
          className="auth-submit"
          onClick={resend}
          disabled={busy}
        >
          {busy ? "Sending…" : "Resend email"}
        </button>

        <div className="auth-links">
          <button type="button" onClick={useAnother}>
            Use a different account
          </button>
        </div>
      </div>
    </div>
  );
}
