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
});
