import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("T14 keeps visible history mode-bound and capped without deleting stored records", () => {
  const policy = read("lib/content/history-policy.ts");
  const isolation = read("lib/content/library-isolation.ts");
  const types = read("lib/content/types.ts");
  const home = read("components/HomeExperience.tsx");
  assert.match(policy, /MAX_VISIBLE_HISTORY\s*=\s*50/);
  assert.match(policy, /recordBelongsToMode/);
  assert.match(isolation, /mode === "premium"/);
  assert.match(policy, /slice\(0, MAX_VISIBLE_HISTORY\)/);
  assert.match(types, /mode\?: "standard" \| "premium"/);
  assert.match(home, /historyForMode/);
});

test("T14 exposes one localized history dialog with remove, clear, empty, and player boundaries", () => {
  const sidebar = read("components/history/WatchHistorySidebar.tsx");
  const home = read("components/HomeExperience.tsx");
  assert.match(sidebar, /role="dialog"/);
  assert.match(sidebar, /removeRecord/);
  assert.match(sidebar, /confirmClear/);
  assert.match(sidebar, /\/player\?/);
  assert.match(sidebar, /empty/);
  assert.match(home, /<WatchHistorySidebar/);
});

test("T13 marks only the history floating control and dialogs as functional material", () => {
  const sidebar = read("components/history/WatchHistorySidebar.tsx");
  assert.match(sidebar, /className="history-sidebar-toggle"[^>]*data-material="regular"/s);
  assert.match(sidebar, /className="history-sidebar is-open"[^>]*data-material="regular"/s);
  assert.match(sidebar, /className="history-confirm"[^>]*data-material="regular"/s);
});
