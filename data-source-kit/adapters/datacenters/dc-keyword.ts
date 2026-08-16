/**
 * dc-keyword — tags a headline/summary as data-center-related. Deterministic
 * keyword match, same spirit as adapters/news/classify.ts. Applied to the
 * already-shipped Corporate Wire desk (GlobeNewswire/PR Newswire) to surface
 * hyperscaler construction announcements — no new feed, just a filter on what's
 * already flowing.
 */

const DC_RE =
  /\b(data ?centers?|hyperscale|colocation|colo campus|server farm|AI (?:campus|factory|gigafactory)|cloud region|megawatts? of (?:capacity|power)|gigawatts? of (?:capacity|power))\b/i;

export function isDataCenterAnnouncement(input: { title: string; summary?: string }): boolean {
  return DC_RE.test(`${input.title} ${input.summary ?? ""}`);
}
