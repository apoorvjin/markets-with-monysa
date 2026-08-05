import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// This app is never served by the Express API — it's a standalone local tool
// (see admin.sh) that talks to production over its own API base URL, so
// there's no alternate mount path to account for here.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
  },
  build: {
    outDir: "dist",
  },
});
