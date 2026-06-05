/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CTN_API_BASE_URL?: string;
  readonly VITE_CTN_STORAGE_MODE?: "browser" | "http";
}
