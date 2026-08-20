import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

const source = await readFile(new URL("../../lib/media/grouped-sources-cache.ts", import.meta.url), "utf8");
const javascript = transpileModule(source, {
  compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
}).outputText;
const cache = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test("grouped source cache uses a bounded opaque key for long Unicode titles", () => {
  const previousWindow = globalThis.window;
  const previousStorage = globalThis.sessionStorage;
  const storage = new MemoryStorage();
  globalThis.window = {};
  globalThis.sessionStorage = storage;
  try {
    const key = cache.storeGroupedSources([
      { id: "video-a", source: "standard-source", sourceName: "剧".repeat(80) },
      { id: "video-b", source: "backup-source", sourceName: "备用来源" },
    ]);
    assert.match(key, /^[A-Za-z0-9-]{1,64}$/);
    assert.ok(key.length < 240);
    assert.deepEqual(cache.readGroupedSources(key).map(({ id, source }) => ({ id, source })), [
      { id: "video-a", source: "standard-source" },
      { id: "video-b", source: "backup-source" },
    ]);
  } finally {
    globalThis.window = previousWindow;
    globalThis.sessionStorage = previousStorage;
  }
});

test("grouped source cache fails closed when session storage is unavailable", () => {
  const previousWindow = globalThis.window;
  const previousStorage = globalThis.sessionStorage;
  globalThis.window = {};
  globalThis.sessionStorage = {
    get length() { return 0; }, key() { return null; }, getItem() { return null; }, removeItem() {},
    setItem() { throw new DOMException("quota", "QuotaExceededError"); },
  };
  try {
    assert.equal(cache.storeGroupedSources([{ id: "video", source: "source" }]), "");
  } finally {
    globalThis.window = previousWindow;
    globalThis.sessionStorage = previousStorage;
  }
});
