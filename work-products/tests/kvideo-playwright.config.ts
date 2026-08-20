import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const port = 4173;
const baseURL = `http://127.0.0.1:${port}/`;

export default defineConfig({
  testDir: ".",
  testMatch: "kvideo-visual-parity.e2e.spec.ts",
  outputDir: "artifacts/kvideo-playwright",
  fullyParallel: false,
  workers: 1,
  reporter: [["json", { outputFile: "artifacts/kvideo-visual-parity/results.json" }]],
  snapshotPathTemplate: "fixtures/kvideo-4.9.19/{arg}{ext}",
  use: {
    baseURL,
    channel: "chrome",
    locale: "zh-CN",
    timezoneId: "Asia/Taipei",
    colorScheme: "dark",
    serviceWorkers: "block",
    trace: "off",
  },
  webServer: {
    command: "npm run build && node work-products/tests/static-server.mjs",
    cwd: repositoryRoot,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
