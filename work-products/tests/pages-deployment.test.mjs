import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const read = (path) => readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");

test("advances the candidate without mutating the immutable 0.1.1 release", () => {
  const packageJson = JSON.parse(read("package.json"));
  const packageLock = JSON.parse(read("package-lock.json"));
  const nextConfig = read("next.config.ts");
  const publishedManifest = JSON.parse(read("release/0.1.1/release-manifest.json"));

  assert.equal(packageJson.version, "0.1.2");
  assert.equal(packageLock.version, "0.1.2");
  assert.equal(packageLock.packages[""].version, "0.1.2");
  assert.equal(publishedManifest.pagesVersion, "0.1.1");
  assert.match(nextConfig, /const PAGES_BASE_PATH = ["']\/UXUV-Pages\/0\.1\.2["']/);
  assert.match(nextConfig, /basePath:\s*PAGES_BASE_PATH/);
  assert.match(nextConfig, /generateBuildId:\s*async\s*\(\)\s*=>\s*["']uxuv-pages-0\.1\.2["']/);
  assert.doesNotMatch(nextConfig, /UXUV-Pages\/(?:main|master|latest)/i);
});

test("keeps the Pages deployment manual, pinned, and immutable", () => {
  const workflow = read(".github/workflows/pages.yml");
  const releaseBuild = workflow.indexOf("npm run release:build");
  const pagesCheckout = workflow.indexOf("ref: gh-pages");

  assert.match(workflow, /^on:\s*\r?\n\s+workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s{2}(?:push|pull_request):/m);
  assert.match(workflow, /contents:\s*write/);
  assert.match(workflow, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/);
  assert.match(workflow, /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/);
  assert.match(workflow, /node-version:\s*["']?24["']?/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run lint/);
  assert.match(workflow, /npx tsc --noEmit/);
  assert.match(workflow, /npm run build/);
  assert.ok(releaseBuild >= 0 && pagesCheckout > releaseBuild, "release must be built before checking out gh-pages");
  assert.match(
    workflow,
    /PAGES_VERSION=\$\(node -p "require\('\.\/package\.json'\)\.version"\)\r?\n\s+echo "PAGES_VERSION=\$PAGES_VERSION" >> "\$GITHUB_ENV"/,
  );
  assert.match(workflow, /path:\s*published/);
  assert.match(workflow, /target="published\/\$PAGES_VERSION"/);
  assert.match(workflow, /diff --recursive --brief "\$source" "\$target"/);
  assert.match(workflow, /touch published\/\.nojekyll/);
  assert.match(workflow, /git diff --cached --quiet/);
  assert.match(workflow, /git push origin gh-pages/);
});

test("runs the deployment contract in the repository test gate", () => {
  const packageJson = JSON.parse(read("package.json"));

  assert.equal(
    packageJson.scripts.test,
    "node --test work-products/tests/static-export-contract.test.mjs work-products/tests/release-manifest.test.mjs work-products/tests/pages-deployment.test.mjs work-products/tests/auth-ui-contract.test.mjs work-products/tests/runtime-config-contract.test.mjs work-products/tests/sync-client.test.mjs work-products/tests/same-origin-boundary.test.mjs work-products/tests/media-ui-contract.test.mjs work-products/tests/pwa-contract.test.mjs",
  );
});
