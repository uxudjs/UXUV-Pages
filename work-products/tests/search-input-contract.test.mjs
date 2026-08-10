import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testsRoot = dirname(fileURLToPath(import.meta.url));
const root = join(testsRoot, "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("keeps account- and mode-scoped search history with bounded recent ordering", () => {
  const hook = read("lib/hooks/useSearchHistory.ts");
  const box = read("components/search/SearchBox.tsx");
  const dropdown = read("components/search/SearchHistoryDropdown.tsx");

  assert.match(hook, /MAX_HISTORY_ITEMS\s*=\s*20/);
  assert.match(hook, /\.slice\(0,\s*10\)/);
  assert.match(hook, /accountId/);
  assert.match(hook, /mode/);
  assert.match(hook, /localStorage/);
  assert.match(hook, /toLocaleLowerCase\(\)/);
  assert.match(box, /isComposing/);
  assert.match(box, /aria-autocomplete="list"/);
  assert.match(box, /aria-activedescendant/);
  assert.match(dropdown, /role="listbox"/);
  assert.match(dropdown, /role="option"/);
  assert.match(dropdown, /onClearAll/);
  assert.match(dropdown, /onRemoveItem/);
});

test("converts only the Worker-bound query while preserving the original input", () => {
  const converter = read("lib/utils/chinese-convert.ts");
  const form = read("components/search/SearchForm.tsx");
  const home = read("components/HomeExperience.tsx");

  assert.match(converter, /from:\s*["']tw["']/);
  assert.match(converter, /to:\s*["']cn["']/);
  assert.match(converter, /traditionalToSimplified/);
  assert.match(form, /<SearchBox/);
  assert.match(home, /<SearchForm/);
  assert.match(home, /const originalQuery = searchQuery\.trim\(\)/);
  assert.match(home, /traditionalToSimplified\(originalQuery\)/);
  assert.match(home, /setQuery\(originalQuery\)/);
});
