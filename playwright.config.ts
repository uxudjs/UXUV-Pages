import { defineConfig } from "@playwright/test";

const port = 4173;
const baseURL = `http://127.0.0.1:${port}/UXUV-Pages/0.1.2/`;

export default defineConfig({
  testDir: "./work-products/tests",
  testMatch: "*.e2e.spec.ts",
  outputDir: "./work-products/tests/artifacts/playwright",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL,
    channel: "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && node work-products/tests/static-server.mjs",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
