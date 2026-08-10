import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { verifyReleaseIdentity } from "../../scripts/verify-release-identity.mjs";

const read = (path) => readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");

test("advances the candidate without storing historic releases in the source checkout", () => {
  const packageJson = JSON.parse(read("package.json"));
  const packageLock = JSON.parse(read("package-lock.json"));
  const nextConfig = read("next.config.ts");
  const gitignore = read(".gitignore");

  assert.equal(packageJson.version, "0.2.0");
  assert.equal(packageLock.version, "0.2.0");
  assert.equal(packageLock.packages[""].version, "0.2.0");
  assert.match(gitignore, /^release\/$/m);
  assert.match(nextConfig, /const PAGES_BASE_PATH = ["']\/UXUV-Pages\/0\.2\.0["']/);
  assert.match(nextConfig, /basePath:\s*PAGES_BASE_PATH/);
  assert.match(nextConfig, /generateBuildId:\s*async\s*\(\)\s*=>\s*["']uxuv-pages-0\.2\.0["']/);
  assert.doesNotMatch(nextConfig, /UXUV-Pages\/(?:main|master|latest)/i);
});

test("rejects a release identity that does not match the workflow trigger commit", () => {
  const commit = "a".repeat(40);
  assert.equal(verifyReleaseIdentity({ expectedCommit: commit, githubSha: commit, headCommit: commit }), commit);
  assert.throws(() => verifyReleaseIdentity({
    expectedCommit: "b".repeat(40),
    githubSha: commit,
    headCommit: commit,
  }), /expectedCommit must equal GITHUB_SHA/);
  assert.throws(() => verifyReleaseIdentity({ expectedCommit: commit, githubSha: commit, headCommit: "c".repeat(40) }), /checked-out HEAD/);
  assert.throws(() => verifyReleaseIdentity({ expectedCommit: "abc1234", githubSha: commit, headCommit: commit }), /full 40-character commit/);
});

test("keeps the Pages deployment manual, pinned, and immutable", () => {
  const workflow = read(".github/workflows/pages.yml");
  const releaseBuild = workflow.indexOf("npm run release:build");
  const staticBuild = workflow.indexOf("npm run build");
  const testGate = workflow.indexOf("npm test");
  const pagesCheckout = workflow.indexOf("ref: gh-pages");
  const identityGate = workflow.indexOf("node scripts/verify-release-identity.mjs");
  const artifactUpload = workflow.indexOf("actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02");

  assert.match(workflow, /^on:\s*\r?\n\s+workflow_dispatch:/m);
  assert.match(workflow, /expectedCommit:\s*\r?\n\s+description:/);
  assert.match(workflow, /expectedCommit:[\s\S]*?required:\s*true/);
  assert.doesNotMatch(workflow, /^\s{2}(?:push|pull_request):/m);
  assert.match(workflow, /contents:\s*write/);
  assert.match(workflow, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/);
  assert.match(workflow, /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/);
  assert.match(workflow, /node-version:\s*["']?24["']?/);
  assert.match(workflow, /ref:\s*\$\{\{\s*inputs\.expectedCommit\s*\}\}/);
  assert.match(workflow, /EXPECTED_COMMIT:\s*\$\{\{\s*inputs\.expectedCommit\s*\}\}/);
  assert.ok(identityGate >= 0 && identityGate < workflow.indexOf("npm ci"), "commit identity must be checked before dependencies and build");
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run lint/);
  assert.match(workflow, /npx tsc --noEmit/);
  assert.match(workflow, /npm run build/);
  assert.ok(staticBuild >= 0 && testGate > staticBuild, "static export must be built before tests that inspect out/");
  assert.ok(releaseBuild >= 0 && pagesCheckout > releaseBuild, "release must be built before checking out gh-pages");
  assert.ok(artifactUpload > releaseBuild && artifactUpload < pagesCheckout, "artifact must bind the verified release before gh-pages checkout");
  assert.match(
    workflow,
    /PAGES_VERSION=\$\(node -p "require\('\.\/package\.json'\)\.version"\)\r?\n\s+echo "PAGES_VERSION=\$PAGES_VERSION" >> "\$GITHUB_ENV"/,
  );
  assert.match(workflow, /path:\s*published/);
  assert.match(workflow, /name:\s*uxuv-pages-\$\{\{\s*env\.PAGES_VERSION\s*\}\}-\$\{\{\s*github\.sha\s*\}\}/);
  assert.match(workflow, /path:\s*release\/\$\{\{\s*env\.PAGES_VERSION\s*\}\}/);
  assert.match(workflow, /if-no-files-found:\s*error/);
  assert.match(workflow, /target="published\/\$PAGES_VERSION"/);
  assert.match(workflow, /diff --recursive --brief "\$source" "\$target"/);
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
