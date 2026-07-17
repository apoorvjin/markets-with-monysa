// Placeholder wording — needs legal sign-off before SOCIAL_BUZZ_AUTO_PUBLISH_ENABLED
// is ever set true in production, and before any X copy is manually posted.
export const DISCLAIMER_TEXT =
  process.env.SOCIAL_BUZZ_DISCLAIMER_TEXT ??
  "Not financial advice. For informational purposes only. Markets involve risk.";

// Centralised so every path that produces post copy goes through here — a
// disclaimer that individual callers have to remember to add is a disclaimer
// that eventually gets forgotten.
export function injectDisclaimer(copy: string): string {
  return `${copy}\n\n${DISCLAIMER_TEXT}`;
}
