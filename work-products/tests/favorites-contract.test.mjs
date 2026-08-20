import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("T13 keeps favorites account-bound, mode-bound, and capped at the KVideo limit", () => {
  const policy = read("lib/content/favorites-policy.ts");
  const isolation = read("lib/content/library-isolation.ts");
  const home = read("components/HomeExperience.tsx");
  const premium = read("components/premium/PremiumExperience.tsx");
  assert.match(policy, /MAX_FAVORITES\s*=\s*100/);
  assert.match(policy, /recordBelongsToMode/);
  assert.match(isolation, /mode === "premium"/);
  assert.match(home, /favoritesForMode/);
  assert.match(premium, /favoritesForMode/);
  assert.match(home, /MAX_FAVORITES/);
  assert.match(premium, /MAX_FAVORITES/);
});

test("T13 exposes grid, list, sidebar, capacity, removal, and empty-state boundaries", () => {
  const page = read("components/FavoritesExperience.tsx");
  const sidebar = read("components/favorites/FavoritesSidebar.tsx");
  assert.match(page, /favorites-grid-view/);
  assert.match(page, /favorites-list-view/);
  assert.match(page, /MAX_FAVORITES/);
  assert.match(page, /removeRecord/);
  assert.match(page, /empty-collection/);
  assert.match(sidebar, /role="dialog"/);
  assert.match(sidebar, /removeRecord/);
  assert.match(page, /<FavoritesSidebar/);
  assert.match(page, /<WatchHistorySidebar/);
});

test("T13 limits favorites glass to controls and dialogs", () => {
  const page = read("components/FavoritesExperience.tsx");
  const sidebar = read("components/favorites/FavoritesSidebar.tsx");
  assert.match(page, /className="favorites-legacy-header"[^>]*data-material="regular"/s);
  assert.match(page, /className="collection-actions"[^>]*data-material="regular"/s);
  assert.match(page, /className="collection-confirm"[^>]*data-material="regular"/s);
  assert.match(sidebar, /className="favorites-sidebar-toggle"[^>]*data-material="regular"/s);
  assert.match(sidebar, /className="favorites-sidebar is-open"[^>]*data-material="regular"/s);
  assert.match(sidebar, /className="history-confirm"[^>]*data-material="regular"/s);
});
