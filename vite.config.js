import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const TUNNEL = "monitoring-circus-brought-venture.trycloudflare.com";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: [TUNNEL],
    proxy: { "/api": "http://localhost:8000", "/upload": "http://localhost:8000", "/patient": "http://localhost:8000", "/reports": "http://localhost:8000", "/summary": "http://localhost:8000", "/approve": "http://localhost:8000", "/audit": "http://localhost:8000" },
  },
  preview: {
    host: true,
    port: 5173,
    allowedHosts: [TUNNEL],
  },
});
