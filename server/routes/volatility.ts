import type { Express } from "express";
import { fetchYahooPrice, fetchRangeData } from "./shared";

// Volatility: Asset class response during geopolitical crises
const VOLATILITY_ASSETS = [
  {
    symbol: "GC=F",
    name: "Gold",
    flag: "🥇",
    category: "Safe Haven",
    volatilityMult: 1,
    direction: "reference",
    description: "The primary safe haven — institutional investors rotate into gold when uncertainty spikes. Historically rises 10–25% during geopolitical crises. Central banks hold gold as a reserve asset.",
  },
  {
    symbol: "TLT",
    name: "US Treasuries (20Y+)",
    flag: "🏛️",
    category: "Safe Haven",
    volatilityMult: 1,
    direction: "same",
    description: "Flight-to-quality trade — global capital floods into US government bonds during crises, driving yields down and prices up. The deepest, most liquid safe haven market in the world.",
  },
  {
    symbol: "SI=F",
    name: "Silver",
    flag: "⚪",
    category: "Precious Metals",
    volatilityMult: 2,
    direction: "same",
    description: "Dual-role asset: part safe haven, part industrial metal. Follows gold during flight-to-quality but with higher beta (1.5–2.5×). Industrial demand from solar and EVs adds a structural bid.",
  },
  {
    symbol: "CL=F",
    name: "Crude Oil (WTI)",
    flag: "🛢️",
    category: "Energy",
    volatilityMult: 2,
    direction: "same",
    description: "Supply disruptions and sanctions from geopolitical events drive oil higher. A root driver of the inflation chain reaction. Middle East conflicts historically cause 15–40% spikes.",
  },
  {
    symbol: "BTC-USD",
    name: "Bitcoin",
    flag: "₿",
    category: "Digital Assets",
    volatilityMult: 3,
    direction: "mixed",
    description: "Increasingly used as a macro hedge by institutional investors. High correlation with risk-on assets short-term, but acts as a dollar-debasement hedge and censorship-resistant store of value in prolonged crises.",
  },
  {
    symbol: "DX-Y.NYB",
    name: "US Dollar Index",
    flag: "💵",
    category: "Safe Haven",
    volatilityMult: 1,
    direction: "same",
    description: "Global capital sells risk assets and buys USD-denominated Treasuries during crises, strengthening the dollar. The world's reserve currency acts as the ultimate short-term safe haven.",
  },
];

const volatilityCache: Map<string, { data: any; timestamp: number }> = new Map();
const VOLATILITY_CACHE_DURATION = 10 * 60 * 1000;

// AI Crisis Briefing
const briefingCache: Map<string, { briefing: string; generatedAt: string; timestamp: number }> = new Map();
const BRIEFING_CACHE_DURATION = 30 * 60 * 1000;

// Futures: News + AI Price Action Analysis
const newsCache: Map<string, { data: any; timestamp: number }> = new Map();
const NEWS_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

export function registerVolatilityRoutes(app: Express): void {
  app.get("/api/volatility/assets", async (_req, res) => {
    const cacheKey = "volatility-assets-v3";
    const cached = volatilityCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < VOLATILITY_CACHE_DURATION) {
      return res.json({ ...cached.data, lastUpdated: new Date(cached.timestamp).toISOString() });
    }
    try {
      // Fetch VIX + all assets (today + 1W + 1M + 3M) all in parallel
      const [vixToday, vix1m, ...assetResults] = await Promise.all([
        fetchYahooPrice("^VIX"),
        fetchRangeData("^VIX", "1mo"),
        ...VOLATILITY_ASSETS.map(async (a) => {
          const [today, r1w, r1m, r3m] = await Promise.all([
            fetchYahooPrice(a.symbol),
            fetchRangeData(a.symbol, "5d"),
            fetchRangeData(a.symbol, "1mo"),
            fetchRangeData(a.symbol, "3mo"),
          ]);
          return { today, r1w, r1m, r3m };
        }),
      ]);

      const vixPrice = vixToday?.price ?? vix1m?.lastPrice ?? null;
      let vixBand = "calm";
      let vixBandLabel = "Calm";
      if (vixPrice != null) {
        if (vixPrice >= 35) { vixBand = "crisis"; vixBandLabel = "Crisis"; }
        else if (vixPrice >= 25) { vixBand = "elevated"; vixBandLabel = "Elevated Fear"; }
        else if (vixPrice >= 15) { vixBand = "nervous"; vixBandLabel = "Nervous"; }
      }

      const items = VOLATILITY_ASSETS.map((a, idx) => {
        const r = assetResults[idx];
        return {
          ...a,
          price: r.today?.price,
          change: r.today?.change,
          changePercent: r.today?.changePercent,
          change1W: r.r1w?.change,
          changePercent1W: r.r1w?.changePercent,
          change1M: r.r1m?.change,
          changePercent1M: r.r1m?.changePercent,
          change3M: r.r3m?.change,
          changePercent3M: r.r3m?.changePercent,
          sparkline: r.r1m?.sparkline ?? [],
        };
      });

      const responseData = {
        items,
        vix: { price: vixPrice, band: vixBand, bandLabel: vixBandLabel },
      };
      volatilityCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
      res.json({ ...responseData, lastUpdated: new Date().toISOString() });
    } catch (e) {
      console.error("Error in /api/volatility/assets:", e);
      res.status(500).json({ error: "Failed to fetch volatility assets" });
    }
  });

  app.post("/api/volatility/briefing", async (req, res) => {
    const { vix, vixBand, goldPct1M, oilPct1M, dxyPct1M } = req.body as {
      vix?: number; vixBand?: string; goldPct1M?: number; oilPct1M?: number; dxyPct1M?: number;
    };

    const cacheKey = [
      Math.round((vix || 0) * 10),
      Math.round((goldPct1M || 0) * 10),
      Math.round((oilPct1M || 0) * 10),
      Math.round((dxyPct1M || 0) * 10),
      vixBand || "unknown",
    ].join("-");

    const cached = briefingCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < BRIEFING_CACHE_DURATION) {
      return res.json({ briefing: cached.briefing, generatedAt: cached.generatedAt });
    }

    if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
      return res.status(503).json({ error: "AI integration not available" });
    }

    try {
      const { default: OpenAI } = await import("openai");
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });
      const fmt = (v?: number) => v != null ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : "N/A";

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a concise macro analyst. Based on current market stress indicators, write exactly 3-4 sentences summarising the current stress level, what it means for investors, and which crisis assets look best positioned right now. Be direct and plain-English. No bullet points or headers.",
          },
          {
            role: "user",
            content: `Current market stress indicators:\n- VIX: ${vix?.toFixed(1) ?? "N/A"} (${vixBand ?? "unknown"} zone)\n- Gold (30-day): ${fmt(goldPct1M)}\n- Oil/WTI (30-day): ${fmt(oilPct1M)}\n- US Dollar Index (30-day): ${fmt(dxyPct1M)}\n\nProvide a 3-4 sentence market stress briefing:`,
          },
        ],
        max_tokens: 250,
      });

      const briefing = completion.choices[0]?.message?.content?.trim() ?? "";
      const generatedAt = new Date().toISOString();

      briefingCache.set(cacheKey, { briefing, generatedAt, timestamp: Date.now() });
      res.json({ briefing, generatedAt });
    } catch (err) {
      console.error("Briefing error:", err);
      res.status(500).json({ error: "Failed to generate briefing" });
    }
  });

  app.get("/api/futures/news", async (req, res) => {
    const { symbol, name, type } = req.query as { symbol: string; name: string; type: string };
    if (!symbol || !name) {
      return res.status(400).json({ error: "symbol and name required" });
    }
    const cacheKey = `news-${symbol}`;
    const cached = newsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < NEWS_CACHE_DURATION) {
      return res.json(cached.data);
    }
    try {
      // Fetch news via Yahoo Finance RSS feed (no rate-limits, symbol-based)
      const rssUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;
      const rssResponse = await fetch(rssUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" }
      });
      let articles: { title: string; publisher: string; link: string; publishedAt: string | null; snippet: string }[] = [];
      if (rssResponse.ok) {
        const rssText = await rssResponse.text();
        const itemMatches = rssText.match(/<item>([\s\S]*?)<\/item>/g) || [];
        articles = itemMatches.slice(0, 3).map((item) => {
          const title = (item.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.replace(/<!--|-->/g, "").trim() || "";
          const link = (item.match(/<link>([\s\S]*?)<\/link>/) || [])[1]?.trim() || "";
          const pubDate = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1]?.trim() || "";
          const descRaw = (item.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || "";
          const snippet = descRaw
            .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
            .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 500);
          // Extract publisher from link domain
          let publisher = "Yahoo Finance";
          try {
            const u = new URL(link);
            const parts = u.hostname.replace("www.", "").split(".");
            publisher = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
          } catch {}
          const publishedAt = pubDate ? new Date(pubDate).toISOString() : null;
          return { title, publisher, link, publishedAt, snippet };
        });
      }

      // snippets are already embedded in articles
      const snippets = articles.map(a => a.snippet || a.title);

      // Generate AI price action summary (gracefully skipped if credentials unavailable)
      let aiSummary = "";
      if (articles.length > 0 && process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
        try {
          const { default: OpenAI } = await import("openai");
          const openai = new OpenAI({
            apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
            baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
          });
          const itemType = type === "forex" ? "currency pair" : type === "commodities" ? "commodity" : "market index";
          const contentText = articles.map((a, i) =>
            `Article ${i + 1}: "${a.title}" (${a.publisher})\n${snippets[i] || ""}`
          ).join("\n\n");
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `You are a concise financial analyst. Based on recent news headlines about a ${itemType}, write 2-3 sentences explaining what the news collectively implies for short-term price action. Be direct about likely direction, key catalysts, and any risk factors. No bullet points — flowing sentences only.`,
              },
              {
                role: "user",
                content: `${itemType}: ${name} (${symbol})\n\nRecent news:\n${contentText}\n\nPrice action implication:`,
              },
            ],
            max_tokens: 200,
          });
          aiSummary = completion.choices[0]?.message?.content?.trim() || "";
        } catch (aiErr) {
          console.warn("AI summary skipped:", (aiErr as Error).message);
        }
      }

      const cleanArticles = articles.map(({ snippet: _s, ...rest }) => rest);
      const result = { articles: cleanArticles, aiSummary };
      newsCache.set(cacheKey, { data: result, timestamp: Date.now() });
      res.json(result);
    } catch (error) {
      console.error("Error in /api/futures/news:", error);
      res.status(500).json({ error: "Failed to fetch news" });
    }
  });
}
