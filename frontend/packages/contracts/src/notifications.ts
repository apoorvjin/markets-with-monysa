import { z } from "zod";

/**
 * History of every broadcast-notifier firing (VIX regime changes, pre-market
 * sector gainers, and any future trigger) — GET /api/notifications/log.
 * Powers the notification bell/history on both clients, independent of
 * whether the OS push was ever seen.
 */
export const NotificationLogItem = z
  .object({
    id: z.string(),
    triggerId: z.string(),
    title: z.string(),
    body: z.string(),
    // Freeform per-trigger payload (e.g. premarket-sector's {market, phase,
    // sectors}, VIX's {ratio}) — kept loose so a new trigger never fails parse.
    data: z.record(z.string(), z.string()).nullish(),
    firedAt: z.string(),
  })
  .passthrough();
export type NotificationLogItem = z.infer<typeof NotificationLogItem>;

export const NotificationLogResponse = z.object({
  items: z.array(NotificationLogItem),
  lastUpdated: z.string().nullish(),
});
export type NotificationLogResponse = z.infer<typeof NotificationLogResponse>;
