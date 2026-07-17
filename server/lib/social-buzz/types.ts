export type PostStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "published"
  | "ready_for_manual_post"
  | "failed";

export type BuzzTriggerType = "mover" | "signal_flip" | "fear_greed_regime";

export type SocialChannel = "instagram" | "x";

export interface BuzzEvent {
  triggerType: BuzzTriggerType;
  triggerSummary: string;
}

export interface CandidatePost {
  id: string;
  createdAt: string;
  triggerType: BuzzTriggerType;
  triggerSummary: string;
  copy: string;
  imageUrl?: string;
  targetChannels: SocialChannel[];
  status: PostStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  publishedAt?: string;
  igMediaId?: string;
  failureReason?: string;
}
