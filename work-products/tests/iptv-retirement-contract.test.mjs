import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const pagesRoot = fileURLToPath(new URL("../..", import.meta.url));
const workerRoot = fileURLToPath(new URL("../../../UXUVideo/", import.meta.url));
const snapshotPath = join(workerRoot, "work-products/evidence/section21/inventory-snapshots/S21-PRE-T08-iptv-default-source-inventory.txt");
const negativePath = "work-products/tests/iptv-retirement-contract.test.mjs";
const frozenAggregates = new Set([
  "work-products/tests/section21-ui-contract.test.mjs",
  "work-products/tests/section21-visual.e2e.spec.ts",
]);
const mutableWorkflow = new Set([
  "worker:work-products/plan.md",
  "worker:work-products/todo.md",
]);
const forbidden = /IPTV|iptv|subscriptionSources|iptvSources|danmakuApiUrl|RuntimeSourceSync|runtime-subscription-|kind:\s*["']system["']/;
const retiredFieldDenylist = /new Set\(\s*\[\s*["']iptv["']\s*,\s*["']iptvsource["']\s*,\s*["']iptvsources["']\s*,\s*["']subscriptionsources["']\s*,\s*["']danmakuapiurl["']\s*\]\s*\)/g;
const negativeCompatibility = new Map([
  ["work-products/tests/data-settings-contract.test.mjs", [
    'test("S21-T11 v2 transfer preserves bounded rules and drops retired IPTV fields", () => {',
    "  assert.match(transfer, /iptv/i);",
  ]],
  ["work-products/tests/kvideo-data-settings.e2e.spec.ts", [
    '        iptvSources: { value: [{ name: "retired" }], updatedAt: 1 },',
    "    expect(exportedText).not.toMatch(/iptv/i);",
    '    valid.config.fields.iptvSources = { value: [{ name: "must stay retired" }], updatedAt: 20 };',
    '    await expect(importDialog.getByText("Skipped retired fields (1): iptvSources")).toBeVisible();',
    "    expect((worker.documents.config.payload.fields as Record<string, unknown>).iptvSources).toBeUndefined();",
  ]],
  ["work-products/tests/pages-deployment.test.mjs", [
    "  assert.match(packageJson.scripts.test, /iptv-retirement-contract\\.test\\.mjs/);",
  ]],
  ["work-products/tests/runtime-config-contract.test.mjs", [
    "  assert.doesNotMatch(provider, /subscriptionSources|iptvSources|danmakuApiUrl|capabilities:\\s*\\{[^}]*iptv/);",
  ]],
  ["work-products/tests/settings-sources-contract.test.mjs", [
    '    { id: "manual", updatedAt: 1, name: "Manual", baseUrl: "https://manual.example", group: "normal", kind: "system" },',
    '  assert.equal(existing[2].kind, "system");',
  ]],
]);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const slash = (value) => value.replaceAll("\\", "/");

function candidateFiles(root) {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root })
    .toString("utf8").split("\0").filter(Boolean).map(slash)
    .filter((path) => existsSync(join(root, path))).sort();
}

function treeFiles(root, directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    if (lstatSync(absolute).isSymbolicLink()) throw new Error(`unexpected symlink: ${slash(relative(root, absolute))}`);
    return entry.isDirectory() ? treeFiles(root, absolute) : [slash(relative(root, absolute))];
  });
}

function text(root, path) {
  const bytes = readFileSync(join(root, path));
  if (bytes.subarray(0, Math.min(bytes.length, 8_192)).includes(0)) return null;
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function stripRequiredCompatibility(path, value) {
  if (path === "lib/data/settings-transfer.ts") {
    assert.match(value, /function retiredConfigField\(key: string\): boolean/);
    assert.match(value, /if \(retiredConfigField\(key\)\) return \[\]/);
    assert.match(value, /!retiredConfigField\(key\)/);
  }
  if (path === "lib/data/settings-transfer.ts" || path.startsWith("out/") || path.startsWith("release/current/")) {
    value = value.replace(retiredFieldDenylist, "");
  }
  const snippets = negativeCompatibility.get(path);
  if (!snippets) return value;
  for (const snippet of snippets) {
    assert.equal(value.split(snippet).length - 1, 1, `${path} must keep its exact negative compatibility pair`);
    value = value.replace(snippet, "");
  }
  return value;
}

function match(root, path) {
  const value = text(root, path);
  if (value === null) return forbidden.test(path) ? `${path}:binary-path` : null;
  const sanitized = stripRequiredCompatibility(path, value)
    .replaceAll("iptv-retirement-contract.test.mjs", "retirement-contract.test.mjs");
  return forbidden.test(path) || forbidden.test(sanitized) ? path : null;
}

function snapshotRows() {
  const rows = readFileSync(snapshotPath, "utf8").split(/\r?\n/).slice(2).filter(Boolean).map((line) => {
    const [path, , classification, fileSha256] = line.split("\t", 5);
    return { path, classification, fileSha256 };
  });
  assert.ok(rows.length > 0, "pre-T08 inventory snapshot must not be empty");
  return rows;
}

test("S21-T08 removes retired runtime paths and v1 default-source fields from source and generated candidates", () => {
  const runtime = candidateFiles(pagesRoot).filter((path) => !path.startsWith("work-products/"));
  const generated = [join(pagesRoot, "out"), join(pagesRoot, "release/current")]
    .flatMap((directory) => treeFiles(pagesRoot, directory));
  const violations = [...new Set([...runtime, ...generated])].map((path) => match(pagesRoot, path)).filter(Boolean);
  assert.deepEqual(violations, []);
});

test("S21-T08 leaves no positive retired-feature test or fixture active", () => {
  const active = candidateFiles(pagesRoot).filter((path) => path.startsWith("work-products/tests/")
    && path !== negativePath && !frozenAggregates.has(path));
  const violations = active.map((path) => match(pagesRoot, path)).filter(Boolean);
  assert.deepEqual(violations, []);
});

test("S21-T08 preserves frozen historical evidence and records its approved retirement", () => {
  const historical = new Map();
  for (const row of snapshotRows().filter(({ classification }) => classification === "historical-evidence")) {
    const existing = historical.get(row.path);
    if (existing && existing !== row.fileSha256) throw new Error(`conflicting snapshot SHA: ${row.path}`);
    historical.set(row.path, row.fileSha256);
  }
  for (const [qualifiedPath, expected] of historical) {
    const separator = qualifiedPath.indexOf(":");
    const repository = qualifiedPath.slice(0, separator);
    const path = qualifiedPath.slice(separator + 1);
    const root = repository === "pages" ? pagesRoot : repository === "worker" ? workerRoot : null;
    assert.ok(root, `unclassified snapshot repository: ${repository}`);
    assert.equal(existsSync(join(root, path)), true, `missing historical evidence: ${qualifiedPath}`);
    if (qualifiedPath !== "worker:work-products/kvideo-parity-matrix.md" && !mutableWorkflow.has(qualifiedPath)) {
      assert.equal(sha256(readFileSync(join(root, path))), expected, `historical evidence drift: ${qualifiedPath}`);
    }
  }
  assert.match(readFileSync(join(workerRoot, "work-products/kvideo-parity-matrix.md"), "utf8"), /approved-retired-by-SPEC-21/);
});
