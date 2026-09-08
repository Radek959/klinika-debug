import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@klinika/api-contracts": fileURLToPath(
        new URL("../../packages/api-contracts/src", import.meta.url)
      ),
      "@klinika/domain": fileURLToPath(
        new URL("../../packages/domain/src", import.meta.url)
      )
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/health": "http://localhost:3000"
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: { include: [/styles\.css/] }
  }
});
