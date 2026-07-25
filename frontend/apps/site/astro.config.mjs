import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://www.finbrio.net",
  output: "static",
  // Class-based scoping (not the default attribute-based) so scoped styles
  // targeting a class passed into a child component (<Reveal class="stats">)
  // still apply — the scope class travels through the class prop, the
  // data-astro-cid attribute does not.
  scopedStyleStrategy: "class",
  integrations: [sitemap()],
});
