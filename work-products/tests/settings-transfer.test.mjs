import assert from "node:assert/strict";
import { build } from "esbuild";
import test from "node:test";
import { fileURLToPath } from "node:url";

const bundle = await build({
  entryPoints: [fileURLToPath(new URL("../../lib/data/settings-transfer.ts", import.meta.url))],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
});
const transfer = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);

const emptyLibrary = { history: [], favorites: [], tombstones: [] };

test("standard settings import rejects a source ID that collides with preserved Premium data", () => {
  const preview = {
    envelope: {
      schemaVersion: 1,
      product: "UXUVideo",
      mode: "standard",
      exportedAt: "2026-08-20T00:00:00.000Z",
      included: { searchHistory: false, watchHistory: false },
      config: {
        fields: {},
        sources: [{ id: "shared-source", group: "normal", updatedAt: 1 }],
        subscriptions: [],
        tombstones: [],
      },
      library: emptyLibrary,
      preferences: {},
    },
    summary: { fields: 0, sources: 1, subscriptions: 0, history: 0, favorites: 0, preferences: 0, skippedRetiredFields: [] },
  };
  const current = {
    config: {
      fields: {},
      sources: [{ id: "shared-source", group: "premium", updatedAt: 2 }],
      subscriptions: [],
      tombstones: [],
    },
    library: emptyLibrary,
  };
  const before = JSON.stringify(current);

  assert.throws(() => transfer.prepareImportedPayloads(preview, current, 3), (error) => error?.code === "invalid");
  assert.equal(JSON.stringify(current), before);
});

test("standard settings import rejects a subscription ID that collides with preserved Premium data", () => {
  const preview = {
    envelope: {
      schemaVersion: 1,
      product: "UXUVideo",
      mode: "standard",
      exportedAt: "2026-08-20T00:00:00.000Z",
      included: { searchHistory: false, watchHistory: false },
      config: {
        fields: {}, sources: [],
        subscriptions: [{ id: "shared-subscription", mode: "standard", updatedAt: 1 }],
        tombstones: [],
      },
      library: emptyLibrary,
      preferences: {},
    },
    summary: { fields: 0, sources: 0, subscriptions: 1, history: 0, favorites: 0, preferences: 0, skippedRetiredFields: [] },
  };
  const current = {
    config: {
      fields: {}, sources: [],
      subscriptions: [{ id: "shared-subscription", mode: "premium", updatedAt: 2 }],
      tombstones: [],
    },
    library: emptyLibrary,
  };

  assert.throws(() => transfer.prepareImportedPayloads(preview, current, 3), (error) => error?.code === "invalid");
});
