import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const scriptPath = join(root, "scripts/transpile-client-assets.mjs");
const workRoot = fileURLToPath(new URL("./work/kvideo-webview-compatibility/", import.meta.url));

test.beforeEach(() => {
  rmSync(workRoot, { recursive: true, force: true });
  mkdirSync(workRoot, { recursive: true });
});

test.after(() => {
  rmSync(workRoot, { recursive: true, force: true });
});

test("transpiles logical assignment below the WebView 83 syntax boundary", () => {
  const assetPath = join(workRoot, "fixture.js");
  const source = "let value; value ??= 1; globalThis.fixtureValue = value;\n";
  writeFileSync(assetPath, source);

  execFileSync(process.execPath, [scriptPath, workRoot], { cwd: root, encoding: "utf8" });
  const output = readFileSync(assetPath, "utf8");

  assert.notEqual(output, source);
  assert.doesNotMatch(output, /(\?\?=|\|\|=|&&=)/);
  assert.doesNotThrow(() => new Function(output));
});

test("fails closed when an explicitly requested asset root is absent", () => {
  const result = spawnSync(process.execPath, [scriptPath, join(workRoot, "missing")], {
    cwd: root,
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /No client asset directories found/);
});
