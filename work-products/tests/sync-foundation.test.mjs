import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

const root = new URL("../../", import.meta.url);
const engineUrl = new URL("lib/sync/sync-engine.ts", root);
const read = (path) => readFile(new URL(path, root), "utf8");

async function loadEngine() {
  assert.equal(existsSync(engineUrl), true, "document-independent sync engine is missing");
  const source = await readFile(engineUrl, "utf8");
  const javascript = transpileModule(source, {
    compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
}

test("document-independent transitions preserve newer local edits and converge conflicts", async () => {
  const engine = await loadEngine();
  const outgoing = { version: 1, updatedAt: 10, payload: { value: "sent" }, dirty: true, revision: 2, retryAt: 0 };
  const latest = { ...outgoing, payload: { value: "new local" }, revision: 3 };
  const remote = { version: 2, updatedAt: 20, payload: { value: "server" } };
  const merge = (server, local) => ({ value: `${server.value}+${local.value}` });

  const concurrent = engine.reconcileAccepted(outgoing, latest, remote, merge);
  assert.deepEqual(concurrent, {
    document: { ...latest, version: 2, updatedAt: 20, payload: { value: "server+new local" }, dirty: true },
    phase: "pending",
    retryDelay: 250,
  });

  const accepted = engine.reconcileAccepted(outgoing, outgoing, remote, merge);
  assert.deepEqual(accepted, {
    document: { ...outgoing, version: 2, updatedAt: 20, payload: { value: "server" }, dirty: false, retryAt: 0 },
    phase: "synced",
    retryDelay: null,
  });

  const conflict = engine.reconcileConflict(latest, remote, merge, 1_000);
  assert.deepEqual(conflict, {
    document: { ...latest, version: 2, updatedAt: 20, payload: { value: "server+new local" }, dirty: true, retryAt: 1_400 },
    phase: "conflict",
    retryDelay: 400,
  });
});

test("retry delays are bounded before reaching browser timers", async () => {
  const engine = await loadEngine();
  assert.equal(engine.boundedRetryDelay(0), 1_000);
  assert.equal(engine.boundedRetryDelay(Number.NaN), 60_000);
  assert.equal(engine.boundedRetryDelay(12), 12_000);
  assert.equal(engine.boundedRetryDelay(10 ** 12), 300_000);
});

test("the provider delegates generic transitions and exposes one localized aggregate state", async () => {
  const [provider, client, store, status, settings] = await Promise.all([
    read("components/SyncProvider.tsx"),
    read("lib/sync/document-client.ts"),
    read("lib/sync/document-store.ts"),
    read("components/SyncStatus.tsx"),
    read("components/settings/SyncSettings.tsx"),
  ]);

  assert.match(provider, /reconcileAccepted/);
  assert.match(provider, /reconcileConflict/);
  assert.match(provider, /boundedRetryDelay/);
  assert.doesNotMatch(provider, /latest\.revision === outgoing\.revision/);
  assert.match(client, /credentials:\s*["']same-origin["']/);
  assert.match(client, /cache:\s*["']no-store["']/);
  assert.match(client, /If-Match/);
  assert.match(store, /encodeURIComponent\(accountId\)/);
  assert.match(status, /useLocale/);
  assert.match(status, /zh-CN/);
  assert.match(status, /zh-TW/);
  assert.match(status, /\ben:/);
  assert.match(settings, /Object\.values\(sync\.documents\)\.some/);
  assert.match(settings, /useLocale/);
});
