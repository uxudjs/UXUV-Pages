import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

const sourceUrl = new URL("../../lib/player/auto-skip.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const javascript = transpileModule(source, {
  compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
}).outputText;
const automation = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

test("intro skip is bounded and never overrides resumed progress", () => {
  assert.equal(automation.introSkipTarget({ enabled: true, seconds: 10, currentTime: 0, duration: 100 }), 10);
  assert.equal(automation.introSkipTarget({ enabled: true, seconds: 10, currentTime: 20, duration: 100 }), null);
  assert.equal(automation.introSkipTarget({ enabled: true, seconds: 200, currentTime: 0, duration: 100 }), 99);
  assert.equal(automation.introSkipTarget({ enabled: true, seconds: 10, currentTime: 0, duration: Number.POSITIVE_INFINITY }), null);
});

test("outro and ended decisions advance at most when policy and episode bounds allow", () => {
  assert.equal(automation.outroAction({ enabled: true, seconds: 5, currentTime: 96, duration: 100,
    isPlaying: true, autoNext: true, hasNext: true }), "next");
  assert.equal(automation.outroAction({ enabled: true, seconds: 5, currentTime: 96, duration: 100,
    isPlaying: true, autoNext: false, hasNext: true }), "end");
  assert.equal(automation.outroAction({ enabled: true, seconds: 5, currentTime: 96, duration: 100,
    isPlaying: false, autoNext: true, hasNext: true }), null);
  assert.equal(automation.shouldAdvanceOnEnded(true, true), true);
  assert.equal(automation.shouldAdvanceOnEnded(true, false), false);
  assert.equal(automation.shouldAdvanceOnEnded(false, true), false);
});

