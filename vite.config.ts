import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function clientManualChunk(id: string) {
  const normalizedId = id.replaceAll("\\", "/");

  return normalizedId.includes("/core/ctn/") ? "ctn-runtime" : undefined;
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
