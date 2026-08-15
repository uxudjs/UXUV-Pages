import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const path = (relative) => fileURLToPath(new URL(`../../${relative}`, import.meta.url));
const read = (relative) => readFileSync(path(relative), "utf8");

test("advances the current candidate without storing versioned releases in the source checkout", () => {
  const packageJson = JSON.parse(read("package.json"));
  const packageLock = JSON.parse(read("package-lock.json"));
  const nextConfig = read("next.config.ts");
  const playwrightConfig = read("playwright.config.ts");
  const visualPlaywrightConfig = read("work-products/tests/kvideo-playwright.config.ts");
  const gitignore = read(".gitignore");

  assert.equal(packageJson.version, "0.2.1");
  assert.equal(packageLock.version, "0.2.1");
  assert.equal(packageLock.packages[""].version, "0.2.1");
  assert.match(gitignore, /^release\/$/m);
  assert.match(nextConfig, /const PAGES_BASE_PATH = ["']\/UXUV-Pages["']/);
  assert.match(nextConfig, /basePath:\s*PAGES_BASE_PATH/);
  assert.match(nextConfig, /generateBuildId:\s*async\s*\(\)\s*=>\s*["']uxuv-pages-0\.2\.1["']/);
  assert.doesNotMatch(nextConfig, /UXUV-Pages\/(?:0\.2\.1|main|master|latest)/i);
  assert.match(playwrightConfig, /baseURL = `http:\/\/127\.0\.0\.1:\$\{port\}\/UXUV-Pages\/`/);
  assert.match(visualPlaywrightConfig, /baseURL = `http:\/\/127\.0\.0\.1:\$\{port\}\/UXUV-Pages\/`/);
  assert.doesNotMatch(playwrightConfig, /UXUV-Pages\/(?:0\.2\.1|main|master|latest)/i);
  assert.doesNotMatch(visualPlaywrightConfig, /UXUV-Pages\/(?:0\.2\.1|main|master|latest)/i);
});

test("removes the custom commit-SHA release identity helper", () => {
  assert.equal(existsSync(path("scripts/verify-release-identity.mjs")), false);
});

test("publishes one current release at the repository root without SHA or version directories", () => {
  const workflow = read(".github/workflows/pages.yml");
  const releaseBuild = workflow.indexOf("npm run release:build");
  const staticBuild = workflow.indexOf("npm run build");
  const testGate = workflow.indexOf("npm test");
  const pagesCheckout = workflow.indexOf("ref: gh-pages");
  const artifactUpload = workflow.indexOf("actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02");

  assert.match(workflow, /^on:\s*\r?\n\s+push:\s*\r?\n\s+branches:\s*\["main"\]\s*\r?\n\s+workflow_dispatch:\s*\{\}/m);
  assert.match(workflow, /^concurrency:\s*\r?\n\s+group:\s*uxuv-pages-production\s*\r?\n\s+cancel-in-progress:\s*true/m);
  assert.doesNotMatch(workflow, /expectedCommit|EXPECTED_COMMIT|GITHUB_SHA|verify-release-identity/i);
  assert.doesNotMatch(workflow, /\bsecrets\./i);
  assert.doesNotMatch(workflow, /^\s{2}pull_request:/m);
  assert.match(workflow, /contents:\s*write/);
  assert.match(workflow, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/);
  assert.match(workflow, /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/);
  assert.match(workflow, /node-version:\s*["']?24["']?/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run lint/);
  assert.match(workflow, /npx tsc --noEmit/);
  assert.match(workflow, /npm run build/);
  assert.ok(staticBuild >= 0 && testGate > staticBuild, "static export must be built before tests that inspect out/");
  assert.ok(releaseBuild >= 0 && pagesCheckout > releaseBuild, "release must be built before checking out gh-pages");
  assert.ok(artifactUpload > releaseBuild && artifactUpload < pagesCheckout, "artifact must be uploaded before gh-pages checkout");
  assert.match(
    workflow,
    /PAGES_VERSION=\$\(node -p "require\('\.\/package\.json'\)\.version"\)\r?\n\s+echo "PAGES_VERSION=\$PAGES_VERSION" >> "\$GITHUB_ENV"/,
  );
  assert.match(workflow, /name:\s*uxuv-pages-\$\{\{\s*env\.PAGES_VERSION\s*\}\}-\$\{\{\s*github\.run_id\s*\}\}-\$\{\{\s*github\.run_attempt\s*\}\}/);
  assert.match(workflow, /path:\s*release\/current/);
  assert.match(workflow, /if-no-files-found:\s*error/);
  assert.match(workflow, /source="release\/current"/);
  assert.match(workflow, /rsync --archive --delete --exclude='\.git\/' "\$source\/" published\//);
  assert.doesNotMatch(workflow, /release\/\$\{\{\s*env\.PAGES_VERSION|release\/\$PAGES_VERSION|protect \/0\.2\.0|published\/\$PAGES_VERSION/);
  assert.doesNotMatch(workflow, /http-equiv="refresh"/);
  assert.match(workflow, /touch published\/\.nojekyll/);
  assert.match(workflow, /git diff --cached --quiet/);
  assert.match(workflow, /git push origin gh-pages/);
});

test("runs the deployment contract in the repository test gate", () => {
  const packageJson = JSON.parse(read("package.json"));

  assert.match(packageJson.scripts.test, /^node --test work-products\/tests\//);
  assert.match(packageJson.scripts.test, /premium-home-contract\.test\.mjs/);
  assert.match(packageJson.scripts.test, /premium-home-policy\.test\.mjs/);
  assert.match(packageJson.scripts.test, /premium-library-contract\.test\.mjs/);
  assert.match(packageJson.scripts.test, /premium-library-policy\.test\.mjs/);
  assert.doesNotMatch(packageJson.scripts.test, /kvideo-capability-red\.test\.mjs/);
  assert.doesNotMatch(packageJson.scripts.test, /kvideo-feature-parity\.test\.mjs/);
});
