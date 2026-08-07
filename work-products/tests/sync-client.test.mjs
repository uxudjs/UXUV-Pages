import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

const sourceUrl = new URL("../../lib/sync/document-merge.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const javascript = transpileModule(source, {
  compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
}).outputText;
const sync = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

test("local field mutations stay dirty until a server version is accepted", () => {
  const initial = sync.createLocalDocument("config");
  const changed = sync.updateConfigField(initial, "locale", "zh-TW", 100);

  assert.equal(changed.dirty, true);
  assert.equal(changed.revision, 1);
  assert.deepEqual(changed.payload.fields.locale, { value: "zh-TW", updatedAt: 100 });
});

test("newer fields and records converge deterministically", () => {
  const left = {
    fields: { locale: { value: "zh-CN", updatedAt: 20 } },
    sources: [{ id: "source-1", name: "new", updatedAt: 20 }],
    subscriptions: [], tombstones: [],
  };
  const right = {
    fields: { locale: { value: "en", updatedAt: 10 } },
    sources: [{ id: "source-1", name: "old", updatedAt: 10 }],
    subscriptions: [], tombstones: [],
  };

  assert.deepEqual(sync.mergePayload("config", left, right, 30), left);
  assert.deepEqual(sync.mergePayload("config", right, left, 30), left);
});

test("fresh tombstones prevent stale records from being revived", () => {
  const now = 40 * 24 * 60 * 60 * 1000;
  const local = sync.removeDocumentRecord(
    sync.createLocalDocument("library"),
    "favorites",
    "video-1",
    now,
  );
  const staleRemote = {
    history: [],
    favorites: [{ id: "video-1", title: "stale", updatedAt: now - 1 }],
    tombstones: [],
  };
  const merged = sync.mergePayload("library", staleRemote, local.payload, now);

  assert.deepEqual(merged.favorites, []);
  assert.deepEqual(merged.tombstones, [
    { collection: "favorites", id: "video-1", deletedAt: now },
  ]);
});

test("tombstones older than 30 days are pruned", () => {
  const day = 24 * 60 * 60 * 1000;
  const now = 40 * day;
  const payload = {
    history: [], favorites: [],
    tombstones: [
      { collection: "favorites", id: "fresh", deletedAt: now - (29 * day) },
      { collection: "favorites", id: "expired", deletedAt: now - (31 * day) },
    ],
  };

  assert.deepEqual(sync.mergePayload("library", payload, payload, now).tombstones, [
    { collection: "favorites", id: "fresh", deletedAt: now - (29 * day) },
  ]);
});
