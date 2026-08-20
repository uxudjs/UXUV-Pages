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

test("per-video rule keys keep mode, source, and video identities collision-safe", () => {
  assert.equal(automation.videoSkipRuleKey("standard", "source:a", "video:b%c"),
    "standard:source%3Aa:video%3Ab%25c");
  assert.notEqual(
    automation.videoSkipRuleKey("standard", "source:a", "video:b"),
    automation.videoSkipRuleKey("standard", "source", "a:video:b"),
  );
  assert.throws(() => automation.videoSkipRuleKey("standard", "", "video"), /identity/i);
  assert.throws(() => automation.videoSkipRuleKey("standard", "source", "x".repeat(257)), /identity/i);
});

test("per-video rules reject malformed values and evict the oldest entry at 201", () => {
  const rules = {};
  for (let index = 0; index <= automation.MAX_VIDEO_SKIP_RULES; index += 1) {
    const key = automation.videoSkipRuleKey("standard", `source-${index}`, `video-${index}`);
    rules[key] = { introEnabled: true, introSeconds: index % 601, outroEnabled: true,
      outroSeconds: (index + 1) % 601, updatedAt: index };
  }
  rules.invalid = { introEnabled: true, introSeconds: 601, outroEnabled: false, outroSeconds: 0, updatedAt: 999 };
  const normalized = automation.normalizeVideoSkipRules(rules);
  assert.equal(Object.keys(normalized).length, automation.MAX_VIDEO_SKIP_RULES);
  assert.equal(normalized.invalid, undefined);
  assert.equal(normalized[automation.videoSkipRuleKey("standard", "source-0", "video-0")], undefined);
  assert.ok(normalized[automation.videoSkipRuleKey("standard", "source-200", "video-200")]);

  const removed = automation.deleteVideoSkipRule(normalized,
    automation.videoSkipRuleKey("standard", "source-200", "video-200"));
  assert.equal(Object.keys(removed).length, automation.MAX_VIDEO_SKIP_RULES - 1);
});

test("the maximum 200-rule map remains below the 512 KiB config document limit", () => {
  const rules = {};
  for (let index = 0; index < automation.MAX_VIDEO_SKIP_RULES; index += 1) {
    const suffix = String(index).padStart(3, "0");
    const source = `source-${suffix}-${"s".repeat(149)}`;
    const videoId = `${"影".repeat(252)}-${suffix}`;
    const key = automation.videoSkipRuleKey("premium", source, videoId);
    rules[key] = { introEnabled: true, introSeconds: 600, outroEnabled: true, outroSeconds: 600,
      updatedAt: Number.MAX_SAFE_INTEGER - index };
  }
  const bytes = new TextEncoder().encode(JSON.stringify({ fields: {
    videoSkipRules: { value: automation.pruneVideoSkipRules(rules), updatedAt: Number.MAX_SAFE_INTEGER },
  }, sources: [], subscriptions: [], tombstones: [] })).byteLength;
  assert.ok(bytes < 512 * 1024, `worst-case rule map is ${bytes} bytes`);
});
