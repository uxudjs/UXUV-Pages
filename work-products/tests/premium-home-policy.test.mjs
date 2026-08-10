import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

async function loadPolicy() {
  const directory = await mkdtemp(join(tmpdir(), "uxuv-premium-home-"));
  const outfile = join(directory, "policy.mjs");
  await build({ entryPoints: [fileURLToPath(new URL("../../lib/content/premium-home-policy.ts", import.meta.url))],
    outfile, bundle: true, platform: "node", format: "esm" });
  const policy = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
  return { policy, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

test("recommendations use only newest Premium history and remain unique", async () => {
  const { policy, cleanup } = await loadPolicy();
  try {
    assert.deepEqual(policy.premiumRecommendationTerms([
      { mode: "standard", title: "Standard secret", updatedAt: 50 },
      { mode: "premium", title: "Premium A", updatedAt: 20 },
      { mode: "premium", title: "Premium B", updatedAt: 30 },
      { mode: "premium", title: "premium a", updatedAt: 40 },
    ]), ["premium a", "Premium B"]);
  } finally { await cleanup(); }
});

test("paged Premium results append without cross-source identity collisions", async () => {
  const { policy, cleanup } = await loadPolicy();
  try {
    assert.deepEqual(policy.appendPremiumVideos([
      { source: "a", vod_id: 1, vod_name: "A" },
    ], [
      { source: "a", vod_id: 1, vod_name: "A duplicate" },
      { source: "b", vod_id: 1, vod_name: "B" },
    ]).map(({ vod_name }) => vod_name), ["A", "B"]);
  } finally { await cleanup(); }
});
