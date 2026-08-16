import type { APIRoute } from "astro";
import { fetchJson } from "../../lib/api";
import { renderOg, type OgOptions } from "../../lib/og";

export async function getStaticPaths() {
  return [
    { params: { page: "us-debt-clock" } },
    { params: { page: "yield-curve" } },
    { params: { page: "fear-and-greed" } },
    { params: { page: "vix" } },
  ];
}

export const GET: APIRoute = async ({ params }) => {
  const page = params.page;
  let opts: OgOptions | null = null;

  if (page === "us-debt-clock") {
    const d = await fetchJson<{ totalDebtFormatted?: string }>("/api/usa-debt");
    opts = { kicker: "US Debt Clock", lines: ["US National Debt"], stat: d.totalDebtFormatted ?? "—", statColor: "#FF4D6A" };
  } else if (page === "yield-curve") {
    const b = await fetchJson<{ curveStatus: string }>("/api/bonds");
    const status = b.curveStatus.charAt(0).toUpperCase() + b.curveStatus.slice(1);
    opts = { kicker: "Macro Indicator", lines: ["US Yield Curve"], stat: status, statColor: "#00D4AA" };
  } else if (page === "fear-and-greed") {
    const fg = await fetchJson<{ value: number; classification: string }>("/api/volatility/fear-greed");
    opts = { kicker: "Macro Indicator", lines: ["Fear & Greed Index"], stat: `${fg.value} · ${fg.classification}`, statColor: "#FFB84D" };
  } else if (page === "vix") {
    const v = await fetchJson<{ vix?: { price: number } }>("/api/volatility/assets");
    opts = { kicker: "Macro Indicator", lines: ["VIX — Fear Gauge"], stat: `${v.vix?.price ?? "—"}`, statColor: "#FFB84D" };
  }

  if (!opts) return new Response("Not found", { status: 404 });
  const png = await renderOg(opts);
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
  });
};
