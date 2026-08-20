import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const port = 4181;
const baseURL = `http://127.0.0.1:${port}/`;

export default defineConfig({
  testDir: '.',
  testMatch: [
    'section21-flows.e2e.spec.ts',
    'section21-visual.e2e.spec.ts',
    'section21-performance.e2e.spec.ts',
  ],
  outputDir: 'artifacts/section21-playwright',
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL,
    channel: 'chrome',
    locale: 'zh-CN',
    timezoneId: 'Asia/Taipei',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run build && set PORT=${port}&& node work-products/tests/static-server.mjs`,
    cwd: repositoryRoot,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
