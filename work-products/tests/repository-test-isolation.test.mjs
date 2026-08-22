import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const testPath = "work-products/tests/repository-test-isolation.test.mjs";

test("the repository test gate is self-contained in an isolated checkout", () => {
  const activeTests = [...packageJson.scripts.test.matchAll(/work-products\/tests\/[^\s]+\.test\.mjs/g)]
    .map(([path]) => path);
  const activeE2E = readdirSync(join(root, "work-products/tests"))
    .filter((name) => name.endsWith(".e2e.spec.ts"))
    .map((name) => `work-products/tests/${name}`);
  const activePaths = [...new Set([...activeTests, ...activeE2E])];
  const parentEscapes = [
    ["..", "..", ".."].join("/"),
    ["..", "..", ".."].join("\\"),
  ];
  const violations = activePaths.filter((path) => {
    const source = readFileSync(join(root, path), "utf8");
    return parentEscapes.some((escape) => source.includes(escape));
  });

  assert.ok(activeTests.includes(testPath), `${testPath} must run in npm test`);
  assert.deepEqual(violations, [], "active Node and Playwright tests must not read outside the repository checkout");
});
