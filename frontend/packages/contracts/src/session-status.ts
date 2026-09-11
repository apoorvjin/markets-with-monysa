import { z } from "zod";

/**
 * Real, holiday-aware exchange open/closed status — GET /api/markets/session-status.
 * Sourced server-side from a live Yahoo quote per exchange (see
 * server/routes/market-status.ts), not day-of-week + local-time math, so an
 * exchange holiday is reflected correctly with no calendar to maintain.
 */
export const SessionStatusExchange = z.object({
  city: z.string(),
  open: z.boolean(),
});
export type SessionStatusExchange = z.infer<typeof SessionStatusExchange>;

export const SessionStatusResponse = z.object({
  exchanges: z.array(SessionStatusExchange),
  lastUpdated: z.string().nullish(),
});
export type SessionStatusResponse = z.infer<typeof SessionStatusResponse>;
