/// <reference types="vitest/config" />

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function clientManualChunk(id: string) {
  const normalizedId = id.replaceAll("\\", "/");

  if (normalizedId.includes("/core/ctn/")) {
    return "ctn-runtime";
  }
  if (normalizedId.includes("/@sinclair/typebox/")) {
    return "contract-runtime";
  }
  if (
    normalizedId.includes("/node_modules/react/") ||
    normalizedId.includes("/node_modules/react-dom/") ||
    normalizedId.includes("/node_modules/scheduler/")
  ) {
    return "react-runtime";
  }
  return undefined;
}

export default defineConfig({
  cacheDir: ".artifacts/cache/vite",
  // The vendored UI package is already ESM. Serve its versioned file directly
  // so a package upgrade cannot retain the previous prebundle's export table.
  optimizeDeps: { exclude: ["compact-ui"] },
  build: {
    manifest: true,
    outDir: ".artifacts/build/client",
    rollupOptions: {
      output: {
        manualChunks: clientManualChunk,
      },
    },
  },
  plugins: [react()],
  clearScreen: false,
  server: {
    watch: {
      ignored: ["**/.artifacts/**", "**/.cognition-tree/**"],
    },
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    maxWorkers: 2,
    css: {
      include: [/\?raw(?:&|$)/],
    },
  },
});
