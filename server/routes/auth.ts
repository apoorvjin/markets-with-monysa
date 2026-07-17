import type { Express } from "express";
import { adminAuth } from "../lib/firebase-admin";
import { isResendConfigured, sendEmail } from "../lib/email/resend";

function verificationEmailHtml(link: string): string {
  return `
  <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
    <img src="https://monysa-api.fly.dev/static/icon-email.png" width="48" height="48"
      alt="FinBrio" style="width:48px;height:48px;border-radius:14px;display:block;margin-bottom:24px;" />
    <h1 style="font-size:20px;color:#0A0A0A;margin:0 0 12px;">Verify your email</h1>
    <p style="font-size:14px;color:#444;line-height:1.5;margin:0 0 24px;">
      Confirm your email address to finish setting up your FinBrio account.
    </p>
    <a href="${link}" style="display:inline-block;background:#00D4AA;color:#000;font-weight:700;
      font-size:14px;padding:14px 28px;border-radius:12px;text-decoration:none;">
      Verify Email
    </a>
    <p style="font-size:12px;color:#999;line-height:1.5;margin:24px 0 0;">
      If you didn't create a FinBrio account, you can safely ignore this email.
    </p>
  </div>`;
}

export function registerAuthRoutes(app: Express): void {
  app.post("/api/auth/send-verification-email", async (req, res) => {
    const auth = adminAuth();
    if (!auth) {
      return res.status(503).json({ error: "Firebase Admin not configured" });
    }

    const authHeader = req.headers["authorization"];
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing bearer token" });
    }

    let uid: string;
    let email: string | undefined;
    try {
      const decoded = await auth.verifyIdToken(authHeader.slice("Bearer ".length));
      uid = decoded.uid;
      email = decoded.email;
    } catch {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    if (!email) {
      return res.status(400).json({ error: "Account has no email address" });
    }

    if (!isResendConfigured()) {
      // Client falls back to Firebase's built-in sendEmailVerification().
      return res.json({ sent: false, fallback: true });
    }

    try {
      const link = await auth.generateEmailVerificationLink(email);
      const sent = await sendEmail({
        to: email,
        subject: "Verify your FinBrio email",
        html: verificationEmailHtml(link),
      });
      if (!sent) return res.json({ sent: false, fallback: true });
      console.log(`[auth] Sent branded verification email to uid=${uid}`);
      return res.json({ sent: true });
    } catch (e) {
      console.error("[auth] send-verification-email failed:", e);
      return res.json({ sent: false, fallback: true });
    }
  });
}
