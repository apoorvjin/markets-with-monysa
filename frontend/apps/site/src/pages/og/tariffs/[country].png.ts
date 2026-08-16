import type { APIRoute } from "astro";
import { getTariffs, slugify } from "../../../lib/api";
import { renderOg } from "../../../lib/og";

export async function getStaticPaths() {
  const { countries } = await getTariffs();
  return countries.map((c) => ({
    params: { country: slugify(c.countryName) },
    props: { name: c.countryName, rate: c.tariffRate },
  }));
}

export const GET: APIRoute = async ({ props }) => {
  const { name, rate } = props as { name: string; rate: number };
  const png = await renderOg({
    kicker: "US Tariff Exposure",
    lines: ["US Tariffs on", name],
    stat: `${rate}%`,
    statColor: "#FF4D6A",
  });
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
  });
};
