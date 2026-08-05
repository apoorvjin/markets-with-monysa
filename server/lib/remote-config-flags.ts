/**
 * Cached, fail-closed server-side read of a Firebase Remote Config boolean
 * parameter. Distinct from routes/admin.ts's read/write of the whole
 * template (that's for the admin UI editor) — this is a lightweight
 * accessor safe to call on the request path for gating server behavior.
 *
 * Fails closed by design: if Remote Config is unset, unreachable, or the
 * parameter doesn't exist yet, the flag reads as false. A feature gated by
 * this should never silently turn on because Firebase had a bad moment.
 */

import { adminRemoteConfig } from "./firebase-admin";

const TTL = 60_000;
const _cache = new Map<string, { value: boolean; ts: number }>();

export async function getRemoteConfigFlag(key: string, fallback = false): Promise<boolean> {
  const cached = _cache.get(key);
  if (cached && Date.now() - cached.ts < TTL) return cached.value;

  const rc = adminRemoteConfig();
  if (!rc) return fallback;

  try {
    const template = await rc.getTemplate();
    const raw = (template.parameters?.[key]?.defaultValue as { value?: string } | undefined)?.value;
    const value = raw === "true";
    _cache.set(key, { value, ts: Date.now() });
    return value;
  } catch {
    return fallback;
  }
}
