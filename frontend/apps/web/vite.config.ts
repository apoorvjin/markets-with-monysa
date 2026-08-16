import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // maplibre-gl spawns its vector-tile worker from a file sibling to its own
  // module at runtime (new URL('./maplibre-gl-worker.mjs', import.meta.url)) —
  // a dynamic path neither Vite's dep pre-bundling (dev) nor Rollup (build) can
  // detect, so the worker asset is never emitted and its URL 404s → blank map,
  // zero tile requests, no error. DataCentersMap instead imports that worker via
  // `?worker&url` (bundled self-contained, deps included) and passes it to
  // setWorkerUrl(); `worker.format: "es"` makes that a real ES-module worker so
  // maplibre can load it directly. This fixes both dev and the production build.
  worker: { format: "es" },
  server: {
    port: 5173,
    allowedHosts: ["bolster-synopses-oil.ngrok-free.dev"],
  },
});
