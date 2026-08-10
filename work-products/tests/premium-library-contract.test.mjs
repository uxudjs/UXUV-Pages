import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("T30 gives library records and account views explicit physical namespaces", () => {
  const types = read("lib/content/types.ts");
  const playback = read("components/player/hooks/usePlaybackHistory.ts");
  const gate = read("components/PasswordGate.tsx");
  assert.match(types, /libraryRecordId/);
  assert.match(playback, /libraryRecordId/);
  assert.match(gate, /<SyncProvider\s+key=\{context\.session\.accountId\}/);
});

test("T30 keeps Premium favorites and continue links inside Premium mode", () => {
  const card = read("components/VideoCard.tsx");
  const page = read("components/FavoritesExperience.tsx");
  const favorites = read("components/favorites/FavoritesSidebar.tsx");
  const history = read("components/history/WatchHistorySidebar.tsx");
  assert.match(card, /video\.mode === "premium"/);
  assert.match(page, /role="alertdialog"/);
  assert.doesNotMatch(page, /window\.confirm/);
  assert.match(favorites, /useDialogFocusTrap/);
  assert.match(favorites, /confirmClear/);
  assert.match(history, /useDialogFocusTrap/);
  assert.match(history, /query\.set\("premium", "1"\)/);
});

test("T30 makes Premium library controls reachable by keyboard and TV focus", () => {
  for (const path of [
    "components/FavoritesExperience.tsx",
    "components/favorites/FavoritesSidebar.tsx",
    "components/history/WatchHistorySidebar.tsx",
  ]) assert.match(read(path), /data-focusable/, `${path} must expose TV focus targets`);
  const hook = read("lib/hooks/useDialogFocusTrap.ts");
  assert.match(hook, /ArrowUp/);
  assert.match(hook, /ArrowDown/);
  assert.match(hook, /event\.key [!=]==? "Tab"/);
  assert.match(hook, /returnFocusRef/);
});
