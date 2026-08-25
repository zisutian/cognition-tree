import { defineConfig, devices } from "@playwright/test";

const requestedWorkers = process.env.CTN_E2E_WORKERS
  ? Number(process.env.CTN_E2E_WORKERS)
  : process.env.CI
    ? 2
    : 4;

if (!Number.isSafeInteger(requestedWorkers) || requestedWorkers < 1) {
  throw new Error("CTN_E2E_WORKERS must be a positive integer.");
}

export default defineConfig({
  expect: {
    timeout: 5_000,
  },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  outputDir: ".artifacts/test/playwright",
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
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  workers: requestedWorkers,
});
