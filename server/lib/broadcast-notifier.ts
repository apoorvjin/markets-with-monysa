/**
 * server/lib/broadcast-notifier.ts
 * Generic engine for leader-gated, broadcast (topic-based, not per-user)
 * push notifications triggered by a server-side calculation moving into a
 * new discrete state. Each trigger polls on its own interval; the engine
 * only sends when the state actually changes, persists state to Firestore
 * so it survives a deploy or leader failover, and applies a per-trigger
 * cooldown so a value oscillating near a threshold can't spam.
 *
 * To add a trigger: write a `registerXTrigger()` function elsewhere that
 * calls registerBroadcastTrigger({...}), then call it from server/index.ts's
 * boot sequence before startBroadcastNotifiers(). See regime-change-notifier.ts.
 */

import { isLeader } from "./leader";
import { adminFirestore, adminMessaging } from "./firebase-admin";

export const BROADCAST_TOPIC = "broadcast-alerts";

export interface TriggerResult {
  state: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface BroadcastTrigger {
  id: string;
  intervalMs: number;
  cooldownMs?: number;
  topic?: string;
  check: () => Promise<TriggerResult | null>;

  /**
   * Optional gate: a state change that should be RECORDED but not pushed.
   * Returning false persists the new state (so the next real transition still
   * reads correctly) while sending nothing. Needed because plenty of signals
   * have states worth tracking but not announcing — leaving an extreme
   * sentiment band, a calm day with no outsized move, a downward debt revision.
   * Without it, a trigger would have to fake a null result and lose its state.
   */
  shouldNotify?: (from: string, to: string) => boolean;

  /**
   * Optional copy override for transitions whose wording depends on BOTH
   * sides, not just the new state — a yield curve inverting and a yield curve
   * re-steepening are the same trigger and read completely differently.
   * check() can't know the previous state; only the engine does.
   */
  renderTransition?: (
    from: string,
    to: string,
    data?: Record<string, string>,
  ) => { title: string; body: string };
}

interface RuntimeState {
  state: string;
  lastNotifiedAt: number; // epoch ms; 0 = never notified
}

export type Action = "notify" | "suppress" | "noop";

/** Pure decision logic — no I/O — kept separate so it's unit-testable without Firebase/FCM. */
export function decideAction(
  cachedState: string,
  newState: string,
  cachedLastNotifiedAt: number,
  now: number,
  cooldownMs: number,
): Action {
  if (newState === cachedState) return "noop";
  if (cooldownMs > 0 && now - cachedLastNotifiedAt < cooldownMs) return "suppress";
  return "notify";
}

const _triggers: BroadcastTrigger[] = [];
const _runtime = new Map<string, RuntimeState>();

export function registerBroadcastTrigger(trigger: BroadcastTrigger): void {
  _triggers.push(trigger);
}

async function hydrate(id: string): Promise<RuntimeState | undefined> {
  const db = adminFirestore();
  if (!db) return undefined;
  try {
    const doc = await db.collection("broadcastTriggers").doc(id).get();
    const d = doc.data() as { state?: string; lastNotifiedAt?: string | null } | undefined;
    if (!d?.state) return undefined;
    return { state: d.state, lastNotifiedAt: d.lastNotifiedAt ? Date.parse(d.lastNotifiedAt) : 0 };
  } catch (e) {
    console.error(`[broadcast-notifier] hydrate(${id}) failed:`, e);
    return undefined;
  }
}

async function persist(id: string, state: string, lastNotifiedAt: number): Promise<void> {
  const db = adminFirestore();
  if (!db) return;
  try {
    await db.collection("broadcastTriggers").doc(id).set({
      state,
      lastChangedAt: new Date().toISOString(),
      lastNotifiedAt: lastNotifiedAt ? new Date(lastNotifiedAt).toISOString() : null,
    });
  } catch (e) {
    console.error(`[broadcast-notifier] persist(${id}) failed:`, e);
  }
}

/**
 * Append-only firing history — separate from the `broadcastTriggers/{id}`
 * "latest state" doc above, which is overwritten every tick. This is what
 * powers the in-app notification bell/history list on both clients (GET
 * /api/notifications/log), independent of whether the OS push was ever seen.
 * Logs the firing decision itself, not delivery — a `send()` failure is
 * already logged separately and doesn't block this.
 */
async function recordNotificationLog(trigger: BroadcastTrigger, result: TriggerResult): Promise<void> {
  const db = adminFirestore();
  if (!db) return;
  try {
    await db.collection("notification_log").add({
      triggerId: trigger.id,
      title: result.title,
      body: result.body,
      data: { triggerId: trigger.id, state: result.state, ...(result.data ?? {}) },
      firedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error(`[broadcast-notifier] recordNotificationLog(${trigger.id}) failed:`, e);
  }
}

async function send(trigger: BroadcastTrigger, result: TriggerResult): Promise<void> {
  const messaging = adminMessaging();
  if (!messaging) return;
  try {
    await messaging.send({
      topic: trigger.topic ?? BROADCAST_TOPIC,
      notification: { title: result.title, body: result.body },
      data: { triggerId: trigger.id, state: result.state, ...(result.data ?? {}) },
      android: { priority: "normal" },
      apns: { payload: { aps: { sound: "default" } } },
    });
    console.log(`[broadcast-notifier] ${trigger.id}: notified (${result.state})`);
  } catch (e) {
    console.error(`[broadcast-notifier] ${trigger.id}: FCM send failed:`, e);
  }
}

async function tick(trigger: BroadcastTrigger): Promise<void> {
  if (!isLeader()) return;

  let result: TriggerResult | null;
  try {
    result = await trigger.check();
  } catch (e) {
    console.error(`[broadcast-notifier] ${trigger.id}: check() failed:`, e);
    return;
  }
  if (result === null) return;

  let cached = _runtime.get(trigger.id);
  if (!cached) cached = await hydrate(trigger.id);

  if (!cached) {
    // First run ever for this trigger — establish a baseline, don't notify.
    _runtime.set(trigger.id, { state: result.state, lastNotifiedAt: 0 });
    await persist(trigger.id, result.state, 0);
    return;
  }

  const now = Date.now();
  const action = decideAction(cached.state, result.state, cached.lastNotifiedAt, now, trigger.cooldownMs ?? 0);

  if (action === "noop") return;

  if (action === "suppress") {
    console.log(`[broadcast-notifier] ${trigger.id}: cooldown active, suppressing ${cached.state} -> ${result.state}`);
    _runtime.set(trigger.id, { state: result.state, lastNotifiedAt: cached.lastNotifiedAt });
    await persist(trigger.id, result.state, cached.lastNotifiedAt);
    return;
  }

  // A state worth recording but not announcing (see shouldNotify's doc comment).
  // Persist it so the next real transition compares against the truth, but the
  // cooldown clock is left untouched — a silent change shouldn't burn it.
  if (trigger.shouldNotify && !trigger.shouldNotify(cached.state, result.state)) {
    _runtime.set(trigger.id, { state: result.state, lastNotifiedAt: cached.lastNotifiedAt });
    await persist(trigger.id, result.state, cached.lastNotifiedAt);
    return;
  }

  const rendered = trigger.renderTransition
    ? { ...result, ...trigger.renderTransition(cached.state, result.state, result.data) }
    : result;

  console.log(`[broadcast-notifier] ${trigger.id}: ${cached.state} -> ${result.state}`);
  await send(trigger, rendered);
  await recordNotificationLog(trigger, rendered);
  _runtime.set(trigger.id, { state: result.state, lastNotifiedAt: now });
  await persist(trigger.id, result.state, now);
}

/** Start every registered trigger's poll loop. Call once at boot, after all registrations. */
export function startBroadcastNotifiers(): void {
  for (const trigger of _triggers) {
    void tick(trigger);
    setInterval(() => void tick(trigger), trigger.intervalMs);
  }
}
