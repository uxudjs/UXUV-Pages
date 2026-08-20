import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

const sourceUrl = new URL("../../lib/sync/document-merge.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const providerSource = await readFile(new URL("../../components/SyncProvider.tsx", import.meta.url), "utf8");
const playbackHistorySource = await readFile(new URL("../../components/player/hooks/usePlaybackHistory.ts", import.meta.url), "utf8");
const javascript = transpileModule(source, {
  compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
}).outputText;
const sync = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

test("S21-T05 retries only on online or manual actions and still saves hidden playback", () => {
  assert.doesNotMatch(providerSource, /addEventListener\(["']focus["']/);
  assert.match(providerSource, /addEventListener\(["']online["']/);
  assert.match(providerSource, /retry:\s*\(\)\s*=>/);
  assert.match(playbackHistorySource, /visibilityState\s*===\s*["']hidden["']/);
});

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

test("a stale device cannot revive a deletion, while an explicit post-delete recreation can", () => {
  const now = 40 * 24 * 60 * 60 * 1000;
  const deleted = sync.removeDocumentRecord(
    sync.createLocalDocument("library"),
    "history",
    "standard:source-1:video-1",
    now,
  );
  const staleNewerWrite = {
    history: [{ id: "standard:source-1:video-1", title: "stale progress", updatedAt: now + 10 }],
    favorites: [], tombstones: [],
  };
  const protectedMerge = sync.mergePayload("library", deleted.payload, staleNewerWrite, now + 10);
  assert.deepEqual(protectedMerge.history, []);

  const recreated = sync.upsertDocumentRecord(deleted, "history", {
    id: "standard:source-1:video-1", title: "explicit replay", updatedAt: now + 20,
  });
  const recreatedMerge = sync.mergePayload("library", deleted.payload, recreated.payload, now + 20);
  assert.deepEqual(recreatedMerge.history, [{
    id: "standard:source-1:video-1", title: "explicit replay", updatedAt: now + 20, recreatedAt: now + 20,
  }]);
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

test("config document validation matches the Worker schema while preserving unknown fields", () => {
  const valid = {
    kind: "config", version: 2, updatedAt: 20,
    payload: {
      fields: { futureSetting: { value: { nested: true }, updatedAt: 10 } },
      sources: [{ id: "standard:source-one", updatedAt: 11, futureSourceField: "kept" }],
      subscriptions: [{ id: "subscription-one", updatedAt: 12, futureSubscriptionField: 42 }],
      tombstones: [{ collection: "sources", id: "old-source", deletedAt: 13 }],
    },
  };
  assert.equal(sync.isRemoteDocument(valid, "config"), true);

  for (const invalid of [
    { ...valid, updatedAt: -1 },
    { ...valid, payload: { tombstones: [] } },
    { ...valid, payload: { ...valid.payload, fields: { unsafe: { value: true, updatedAt: -1 } } } },
    { ...valid, payload: { ...valid.payload, sources: [{ id: "bad id", updatedAt: 1 }] } },
    { ...valid, payload: { ...valid.payload, subscriptions: [{ id: "sub", updatedAt: "now" }] } },
    { ...valid, payload: { ...valid.payload, tombstones: [{ collection: "favorites", id: "x", deletedAt: 1 }] } },
  ]) assert.equal(sync.isRemoteDocument(invalid, "config"), false);
});

test("library document validation accepts isolated modes and rejects malformed records or tombstones", () => {
  const valid = {
    kind: "library", version: 3, updatedAt: 30,
    payload: {
      history: [{ id: "standard:source-1:video-1", updatedAt: 20, mode: "standard", futureHistoryField: true }],
      favorites: [{ id: "premium:source-2:video-2", updatedAt: 21, mode: "premium", futureFavoriteField: 42 }],
      tombstones: [{ collection: "history", id: "standard:source-3:video-3", deletedAt: 22 }],
    },
  };
  assert.equal(sync.isRemoteDocument(valid, "library"), true);

  for (const invalid of [
    { ...valid, payload: { ...valid.payload, history: [{ id: "bad id", updatedAt: 1 }] } },
    { ...valid, payload: { ...valid.payload, favorites: [{ id: "favorite", updatedAt: -1 }] } },
    { ...valid, payload: { ...valid.payload, tombstones: [{ collection: "sources", id: "x", deletedAt: 1 }] } },
  ]) assert.equal(sync.isRemoteDocument(invalid, "library"), false);
});
