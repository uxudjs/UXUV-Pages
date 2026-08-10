import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

async function loadPolicy() {
  const directory = await mkdtemp(join(tmpdir(), "uxuv-premium-library-"));
  const outfile = join(directory, "policy.mjs");
  await build({ entryPoints: [fileURLToPath(new URL("../../lib/content/library-isolation.ts", import.meta.url))],
    outfile, bundle: true, platform: "node", format: "esm" });
  const policy = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
  return { policy, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

test("standard and Premium library records have disjoint local identifiers", async () => {
  const { policy, cleanup } = await loadPolicy();
  try {
    const standard = policy.libraryRecordId("standard", "same-source", "same-video");
    const premium = policy.libraryRecordId("premium", "same-source", "same-video");
    assert.equal(standard, "standard:same-source:same-video");
    assert.equal(premium, "premium:same-source:same-video");
    assert.notEqual(standard, premium);
  } finally { await cleanup(); }
});

test("legacy standard records stay standard while Premium requires an explicit mode", async () => {
  const { policy, cleanup } = await loadPolicy();
  try {
    assert.equal(policy.recordBelongsToMode(undefined, "standard"), true);
    assert.equal(policy.recordBelongsToMode("standard", "standard"), true);
    assert.equal(policy.recordBelongsToMode("premium", "standard"), false);
    assert.equal(policy.recordBelongsToMode("premium", "premium"), true);
    assert.equal(policy.recordBelongsToMode(undefined, "premium"), false);
  } finally { await cleanup(); }
});
