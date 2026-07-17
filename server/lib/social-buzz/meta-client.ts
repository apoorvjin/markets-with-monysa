import type { CandidatePost } from "./types";

const GRAPH_API_VERSION = "v21.0"; // verify against current Meta docs at implementation/deploy time

// Instagram's Graph API has no text-only post type — every media object needs
// an image_url (or video_url). Until per-event image-card generation exists
// (deferred — see plan risks), every Instagram post uses this static branded
// placeholder so real (non-dry-run) publishing doesn't 400.
export const PLACEHOLDER_IMAGE_URL = "https://finbrio.net/og-image.png";

export interface PublishResult {
  ok: boolean;
  igMediaId?: string;
  error?: string;
}

function isDryRun(): boolean {
  if (process.env.SOCIAL_BUZZ_DRY_RUN === "false") return false;
  if (process.env.SOCIAL_BUZZ_DRY_RUN === "true") return true;
  return !process.env.META_PAGE_ACCESS_TOKEN; // default: dry-run whenever no token is configured
}

export async function publishToInstagram(
  post: CandidatePost,
  imageUrl: string,
): Promise<PublishResult> {
  if (process.env.SOCIAL_BUZZ_KILL_SWITCH === "true") {
    return { ok: false, error: "kill switch active" };
  }

  if (isDryRun()) {
    const syntheticId = `dry-run-${post.id}`;
    console.log(
      `[social-buzz] DRY_RUN publishToInstagram — would post: ${JSON.stringify({
        caption: post.copy,
        image_url: imageUrl,
      })}`,
    );
    return { ok: true, igMediaId: syntheticId };
  }

  const token = process.env.META_PAGE_ACCESS_TOKEN;
  const igUserId = process.env.META_IG_BUSINESS_ACCOUNT_ID;
  if (!token || !igUserId) {
    return { ok: false, error: "META_PAGE_ACCESS_TOKEN or META_IG_BUSINESS_ACCOUNT_ID not configured" };
  }

  try {
    // 1. Create the media container.
    const createRes = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${igUserId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: imageUrl,
          caption: post.copy,
          access_token: token,
        }),
      },
    );
    const createJson = (await createRes.json()) as { id?: string; error?: { message?: string } };
    if (!createRes.ok || !createJson.id) {
      return { ok: false, error: createJson.error?.message ?? `container create failed (${createRes.status})` };
    }
    const creationId = createJson.id;

    // 2. Poll container status until processing finishes — image processing is
    // async, publishing immediately after create can 400.
    const maxAttempts = 10;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const statusRes = await fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${creationId}?fields=status_code&access_token=${token}`,
      );
      const statusJson = (await statusRes.json()) as { status_code?: string };
      if (statusJson.status_code === "FINISHED") break;
      if (statusJson.status_code === "ERROR") {
        return { ok: false, error: "container processing failed" };
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    // 3. Publish.
    const publishRes = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${igUserId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: creationId, access_token: token }),
      },
    );
    const publishJson = (await publishRes.json()) as { id?: string; error?: { message?: string } };
    if (!publishRes.ok || !publishJson.id) {
      return { ok: false, error: publishJson.error?.message ?? `publish failed (${publishRes.status})` };
    }

    return { ok: true, igMediaId: publishJson.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
