import { defineConfig, devices } from "@playwright/test";

const apiHost = "127.0.0.1";
const apiPort = 3317;
const webHost = "127.0.0.1";
const webPort = 4174;
const apiBaseUrl = `http://${apiHost}:${apiPort}`;
const webBaseUrl = `http://${webHost}:${webPort}`;
const repositoryDir = process.env.CTN_E2E_REPOSITORY_DIR ??
  ".cognition-tree/e2e-repository";
const repositoryHostRoot = process.env.CTN_E2E_REPOSITORY_HOST_ROOT ??
  "/host/e2e-repositories";

export default defineConfig({
  expect: {
    timeout: 5_000,
  },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  outputDir: "test-results/playwright",
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  reporter: process.env.CI ? "github" : "list",
  retries: process.env.CI ? 2 : 0,
  testDir: "./e2e",
  testMatch: "**/*.pw.ts",
  timeout: 30_000,
  use: {
    baseURL: webBaseUrl,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm server:e2e",
      env: {
        CTN_API_HOST: apiHost,
        CTN_API_PORT: String(apiPort),
        CTN_E2E_REPOSITORY_DIR: repositoryDir,
        CTN_E2E_REPOSITORY_HOST_ROOT: repositoryHostRoot,
        CTN_E2E_WEB_ORIGIN: webBaseUrl,
      },
      reuseExistingServer: false,
      timeout: 30_000,
      url: `${apiBaseUrl}/api/health`,
    },
    {
      command: `pnpm dev --host ${webHost} --port ${webPort} --strictPort`,
      env: {
        VITE_CTN_API_BASE_URL: apiBaseUrl,
      },
      reuseExistingServer: false,
      timeout: 30_000,
      url: webBaseUrl,
    },
  ],
  workers: 1,
});
