import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  cacheDir: ".artifacts/cache/vite",
  build: {
    manifest: true,
    outDir: ".artifacts/build/client",
  },
  plugins: [react()],
  clearScreen: false,
});
