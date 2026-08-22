import { defineConfig } from "@playwright/test";

const port = 4173;
const baseURL = `http://127.0.0.1:${port}/`;
const proxyURL = "http://127.0.0.1:4174";

export default defineConfig({
  testDir: "./work-products/tests",
  testMatch: "*.e2e.spec.ts",
  testIgnore: "kvideo-visual-parity.e2e.spec.ts",
  outputDir: "./work-products/tests/artifacts/playwright",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  snapshotPathTemplate: "work-products/tests/fixtures/kvideo-4.9.19/{arg}{ext}",
  use: {
    baseURL,
    channel: "chrome",
    proxy: { server: proxyURL, bypass: "127.0.0.1,localhost" },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run build && node work-products/tests/static-server.mjs",
      url: baseURL,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "node work-products/tests/offline-reject-proxy.mjs",
      url: `${proxyURL}/__offline/health`,
      reuseExistingServer: false,
      timeout: 10_000,
    },
  ],
});
