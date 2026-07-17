import type { BuzzEvent } from "./types";
import { injectDisclaimer } from "./disclaimer";

function templatedFallback(event: BuzzEvent): string {
  return event.triggerSummary;
}

/**
 * Generates short social-post copy from a detected event. Same lazy-import,
 * env-gated pattern as routes/volatility.ts's briefing generator. Falls back
 * to a plain templated caption (never silently drops the post) when no key
 * is configured, matching this codebase's "degrade gracefully" convention.
 * The disclaimer is injected here — the one and only place copy is
 * finalised, so no caller can forget it.
 */
export async function generatePostCopy(event: BuzzEvent): Promise<string> {
  if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    return injectDisclaimer(templatedFallback(event));
  }

  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are writing a punchy, platform-appropriate social caption for a financial markets app. " +
            "1-2 sentences, no hashtag spam, no unverified claims of certainty, no emoji overload. " +
            "State the fact plainly — you are not giving investment advice.",
        },
        {
          role: "user",
          content: `Market event: ${event.triggerSummary}\n\nWrite the caption:`,
        },
      ],
      max_tokens: 120,
    });

    const copy = completion.choices[0]?.message?.content?.trim();
    return injectDisclaimer(copy || templatedFallback(event));
  } catch (e) {
    console.warn("[social-buzz] copywriter AI call failed, using template:", (e as Error).message);
    return injectDisclaimer(templatedFallback(event));
  }
}
