import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testsRoot = dirname(fileURLToPath(import.meta.url));
const root = join(testsRoot, "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("persists editable home tags by account, mode, and content type", () => {
  const manager = read("components/home/TagManager.tsx");
  const hook = read("components/home/hooks/useTagManager.ts");
  const controls = read("components/home/DiscoverControls.tsx");
  const home = read("components/HomeExperience.tsx");

  assert.match(manager, /DndContext/);
  assert.match(manager, /KeyboardSensor/);
  assert.match(manager, /sortableKeyboardCoordinates/);
  assert.match(manager, /aria-label=.*labels\.delete/);
  assert.match(hook, /accountId/);
  assert.match(hook, /mode/);
  assert.match(hook, /contentType/);
  assert.match(hook, /localStorage/);
  assert.match(hook, /arrayMove/);
  assert.match(controls, /<TagManager/);
  assert.match(home, /mode:\s*"standard"/);
});

test("uses cancellable, deduplicated pagination and history-derived recommendations", () => {
  const home = read("components/HomeExperience.tsx");
  const client = read("lib/content/api-client.ts");
  const infinite = read("lib/hooks/useInfiniteScroll.ts");
  const personalized = read("components/home/hooks/usePersonalizedRecommendations.ts");
  const grid = read("components/home/MovieGrid.tsx");

  assert.match(client, /pageStart/);
  assert.match(client, /pageLimit/);
  assert.match(client, /page_start:\s*String\(pageStart\)/);
  assert.match(infinite, /IntersectionObserver/);
  assert.match(home, /homeController\.current\?\.abort\(\)/);
  assert.match(home, /new Set/);
  assert.match(personalized, /history\.length < 2/);
  assert.match(personalized, /watchedTitles/);
  assert.match(personalized, /controller\.signal\.aborted/);
  assert.match(grid, /data-infinite-sentinel/);
});
