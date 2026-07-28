import path from "node:path"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

// Dev proxy: the browser talks to Vite (:5173), Vite forwards /api to FastAPI (:8000).
// This avoids CORS entirely in development — no backend changes required.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    proxy: {
      "/api": {
        // Defaults to the normal dev backend. Override with VITE_API_TARGET to
        // point the dev server at a throwaway instance (e.g. a sandbox DB on
        // another port) without editing this file.
        target: process.env.VITE_API_TARGET ?? "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "query-vendor": ["@tanstack/react-query", "axios"],
          "radix-vendor": ["radix-ui"],
        },
      },
    },
  },
})
