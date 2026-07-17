import { z } from "zod";

export const AdminPlan = z.enum(["free", "pro"]);
export type AdminPlan = z.infer<typeof AdminPlan>;

// ── Stats ─────────────────────────────────────────────────────────────────────

export const AdminStatsSchema = z.object({
  userCount: z.number(),
  alertCount: z.number(),
  subscriptionCount: z.number(),
  planCounts: z.object({ free: z.number(), pro: z.number() }),
  leaderStatus: z.object({ isLeader: z.boolean(), machineId: z.string() }),
});
export type AdminStats = z.infer<typeof AdminStatsSchema>;

export const AdminLeaderSchema = z.object({
  isLeader: z.boolean(),
  machineId: z.string(),
});
export type AdminLeader = z.infer<typeof AdminLeaderSchema>;

// ── Users ─────────────────────────────────────────────────────────────────────

export const AdminUserSchema = z.object({
  uid: z.string(),
  email: z.string().nullish(),
  createdAt: z.string().nullish(),
  preferences: z.record(z.unknown()).nullish(),
}).passthrough();
export type AdminUser = z.infer<typeof AdminUserSchema>;

export const AdminUsersListSchema = z.object({
  users: z.array(AdminUserSchema),
  hasMore: z.boolean(),
});
export type AdminUsersList = z.infer<typeof AdminUsersListSchema>;

// ── Alerts ────────────────────────────────────────────────────────────────────

export const AdminAlertSchema = z.object({
  id: z.string(),
  uid: z.string().optional(),
  docPath: z.string().optional(),
  symbol: z.string(),
  name: z.string().nullish(),
  targetPrice: z.number(),
  direction: z.enum(["above", "below"]),
  triggered: z.boolean(),
  triggeredAt: z.string().nullish(),
  createdAt: z.string().nullish(),
}).passthrough();
export type AdminAlert = z.infer<typeof AdminAlertSchema>;

export const AdminAlertsListSchema = z.object({
  alerts: z.array(AdminAlertSchema),
  hasMore: z.boolean().optional(),
});
export type AdminAlertsList = z.infer<typeof AdminAlertsListSchema>;

// ── Devices ───────────────────────────────────────────────────────────────────

export const AdminDeviceSchema = z.object({
  deviceId: z.string(),
  fcmToken: z.string().nullish(),
  platform: z.enum(["ios", "android"]).nullish(),
  updatedAt: z.string().nullish(),
}).passthrough();
export type AdminDevice = z.infer<typeof AdminDeviceSchema>;

export const AdminDevicesListSchema = z.object({
  devices: z.array(AdminDeviceSchema),
});
export type AdminDevicesList = z.infer<typeof AdminDevicesListSchema>;

// ── Subscriptions ─────────────────────────────────────────────────────────────

export const AdminSubscriptionSchema = z.object({
  deviceId: z.string(),
  plan: z.string(),
  event: z.string().nullish(),
  updatedAt: z.string().nullish(),
}).passthrough();
export type AdminSubscription = z.infer<typeof AdminSubscriptionSchema>;

export const AdminSubscriptionsListSchema = z.object({
  subs: z.array(AdminSubscriptionSchema),
  hasMore: z.boolean(),
});
export type AdminSubscriptionsList = z.infer<typeof AdminSubscriptionsListSchema>;

// ── Remote Config ─────────────────────────────────────────────────────────────

export const AdminRemoteConfigSchema = z.object({
  params: z.record(z.object({
    defaultValue: z.unknown(),
    description: z.string().nullish(),
  })),
  version: z.unknown().nullish(),
});
export type AdminRemoteConfig = z.infer<typeof AdminRemoteConfigSchema>;

// ── User Auth Actions ─────────────────────────────────────────────────────────

export const AdminPasswordResetSchema = z.object({
  ok: z.boolean(),
  resetLink: z.string(),
});
export type AdminPasswordReset = z.infer<typeof AdminPasswordResetSchema>;

// ── Generic OK ────────────────────────────────────────────────────────────────

export const AdminOkSchema = z.object({ ok: z.boolean() }).passthrough();
export type AdminOk = z.infer<typeof AdminOkSchema>;

// ── AI Call Usage ─────────────────────────────────────────────────────────

export const AiUsageRowSchema = z.object({
  deviceId:       z.string(),
  email:          z.string().nullable(),
  openaiCalls:    z.number(),
  anthropicCalls: z.number(),
  lastSeen:       z.string().nullable(),
  routes:         z.record(z.number()),
});
export type AiUsageRow = z.infer<typeof AiUsageRowSchema>;

export const AiUsageResponseSchema = z.object({
  rows:        z.array(AiUsageRowSchema),
  generatedAt: z.string(),
  error:       z.string().optional(),
});
export type AiUsageResponse = z.infer<typeof AiUsageResponseSchema>;

// ── Social Buzz (market-buzz posting pipeline) ────────────────────────────────

export const SocialChannelSchema = z.enum(["instagram", "x"]);
export type SocialChannel = z.infer<typeof SocialChannelSchema>;

export const PostStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "published",
  "ready_for_manual_post",
  "failed",
]);
export type PostStatus = z.infer<typeof PostStatusSchema>;

export const CandidatePostSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  triggerType: z.enum(["mover", "signal_flip", "fear_greed_regime"]),
  triggerSummary: z.string(),
  copy: z.string(),
  imageUrl: z.string().nullish(),
  targetChannels: z.array(SocialChannelSchema),
  status: PostStatusSchema,
  reviewedBy: z.string().nullish(),
  reviewedAt: z.string().nullish(),
  publishedAt: z.string().nullish(),
  igMediaId: z.string().nullish(),
  failureReason: z.string().nullish(),
}).passthrough();
export type CandidatePost = z.infer<typeof CandidatePostSchema>;

export const SocialBuzzQueueSchema = z.object({
  posts: z.array(CandidatePostSchema),
});
export type SocialBuzzQueue = z.infer<typeof SocialBuzzQueueSchema>;

export const SocialBuzzStatusSchema = z.object({
  killSwitch: z.boolean(),
  autoPublishEnabled: z.boolean(),
  dryRun: z.boolean(),
  postsToday: z.number(),
  cap: z.number(),
});
export type SocialBuzzStatus = z.infer<typeof SocialBuzzStatusSchema>;

export const SocialBuzzKillSwitchResponseSchema = z.object({
  ok: z.boolean(),
  killSwitch: z.boolean(),
});
export type SocialBuzzKillSwitchResponse = z.infer<typeof SocialBuzzKillSwitchResponseSchema>;

export const CandidatePostResponseSchema = z.object({
  post: CandidatePostSchema,
  publishResult: z.object({ ok: z.boolean(), igMediaId: z.string().optional(), error: z.string().optional() }).optional(),
});
export type CandidatePostResponse = z.infer<typeof CandidatePostResponseSchema>;

// ── API Performance Metrics ───────────────────────────────────────────────────

export const ApiMetricRowSchema = z.object({
  key:         z.string(),
  method:      z.string(),
  path:        z.string(),
  count:       z.number(),
  avgMs:       z.number(),
  p50Ms:       z.number(),
  p95Ms:       z.number(),
  minMs:       z.number(),
  maxMs:       z.number(),
  successRate: z.number(),
  pages:       z.array(z.string()),
});
export type ApiMetricRow = z.infer<typeof ApiMetricRowSchema>;

export const ApiMetricsResponseSchema = z.object({
  available:    z.boolean(),
  reason:       z.string().optional(),
  metrics:      z.array(ApiMetricRowSchema).optional(),
  window:       z.string().optional(),
  linesScanned: z.number().optional(),
  generatedAt:  z.string().optional(),
});
export type ApiMetricsResponse = z.infer<typeof ApiMetricsResponseSchema>;
