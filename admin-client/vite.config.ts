import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "../admin-dist/client",
    emptyOutDir: true,
  },
  server: {
    port: 5002,
    proxy: {
      "/api": {
        target: "http://localhost:5001",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:5001",
        ws: true,
      },
    },
  },
});
