import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://finbrio.net",
  output: "static",
  integrations: [sitemap()],
});
