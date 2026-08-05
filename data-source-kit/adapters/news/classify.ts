/**
 * classify — lightweight, keyword + recency heuristics that tag a headline with
 * a category and a severity, for terminal-style triage. No LLM, no dependency,
 * deterministic, cheap enough to run on every item on every request.
 *
 *  - category: what KIND of story it is (conflict / disaster / diplomatic / …)
 *  - severity: how URGENT it looks (breaking / alert / caution / normal) —
 *    independent of category, driven by strong signal words + recency.
 *
 * These are heuristics, not ground truth: they exist to color/sort a wall of
 * headlines, not to make claims. Tune the word lists freely.
 */

export const WIRE_CATEGORIES = [
  "conflict",
  "disaster",
  "protest",
  "diplomatic",
  "economic",
  "general",
] as const;
export type WireCategory = (typeof WIRE_CATEGORIES)[number];

export const WIRE_SEVERITIES = ["breaking", "alert", "caution", "normal"] as const;
export type WireSeverity = (typeof WIRE_SEVERITIES)[number];

// Order matters: first matching rule wins.
const CATEGORY_RULES: [WireCategory, RegExp][] = [
  ["conflict", /\b(war|attack|airstrike|strike[sd]?|missile|drone|shelling|troops?|militant|insurgen\w*|offensive|clash\w*|invasion|ceasefire|hostage|gunmen|militia|casualt\w*|killed|dead|wounded|combat|frontline|siege)\b/i],
  ["disaster", /\b(wildfire|blaze|fire[s]?|flood\w*|earthquake|quake|storm|hurricane|typhoon|cyclone|drought|landslide|erupt\w*|evacuat\w*|tsunami|heatwave|famine|outbreak|epidemic)\b/i],
  ["protest", /\b(protest\w*|rally|demonstrat\w*|riot\w*|unrest|uprising|walkout|strike action|march\w*|blockade)\b/i],
  ["diplomatic", /\b(summit|talks|treaty|sanction\w*|diplomat\w*|negotiat\w*|accord|alliance|embassy|foreign minister|nato|united nations|bilateral|envoy|deal|peace)\b/i],
  ["economic", /\b(inflation|tariff\w*|gdp|recession|interest rate|rate cut|rate hike|market\w*|stocks?|shares?|trade war|earnings|deficit|currency|central bank|federal reserve|jobs report|unemployment|bond\w*|yield\w*)\b/i],
];

const BREAKING_RE = /\b(breaking|just in|developing)\b/i;
const ALERT_RE = /\b(killed|dead|attack|explosion|blast|strike[sd]?|missile|shooting|bombing|assassinat\w*|hostage|coup|invasion|war)\b/i;
const CAUTION_RE = /\b(wildfire|flood\w*|earthquake|quake|storm|hurricane|typhoon|evacuat\w*|landslide|erupt\w*|outbreak|warning)\b/i;

export interface Classified {
  category: WireCategory;
  severity: WireSeverity;
}

export function classify(input: { title: string; summary?: string; pubDate?: string }): Classified {
  const text = `${input.title} ${input.summary ?? ""}`;

  let category: WireCategory = "general";
  for (const [cat, re] of CATEGORY_RULES) {
    if (re.test(text)) {
      category = cat;
      break;
    }
  }

  const ageMin = ageMinutes(input.pubDate);
  let severity: WireSeverity = "normal";
  if (BREAKING_RE.test(input.title) || (ageMin !== null && ageMin <= 45 && (category === "conflict" || category === "disaster"))) {
    severity = "breaking";
  } else if (ALERT_RE.test(text)) {
    severity = "alert";
  } else if (CAUTION_RE.test(text)) {
    severity = "caution";
  }

  return { category, severity };
}

function ageMinutes(pubDate?: string): number | null {
  if (!pubDate) return null;
  const t = Date.parse(pubDate);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 60000;
}
