import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: webRoot,
  build: {
    outDir: "dist"
  },
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT ?? "5173"),
    proxy: {
      "/api": `http://localhost:${process.env.API_PORT ?? "18080"}`,
      "/health": `http://localhost:${process.env.API_PORT ?? "18080"}`
    }
  }
});
