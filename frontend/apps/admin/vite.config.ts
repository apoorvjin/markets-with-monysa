import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In dev (npm run admin:dev): base defaults to "/" so the app loads at localhost:5175/.
// In prod build (npm run admin:build): VITE_ADMIN_BASE=/admin/ is injected by the build
// script so assets are prefixed correctly when served from Express at /admin/*.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_ADMIN_BASE ?? "/",
  server: {
    port: 5175,
  },
  build: {
    outDir: "dist",
  },
});
