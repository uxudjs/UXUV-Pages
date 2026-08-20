import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("T11 search results keep incremental batches and the KVideo card boundary", () => {
  const client = read("lib/content/search-client.ts");
  const home = read("components/HomeExperience.tsx");
  const results = read("components/search/SearchResults.tsx");
  const grid = read("components/search/VideoGrid.tsx");
  const policy = read("lib/utils/search-result-policy.ts");
  const grouped = read("components/search/VideoGroupCard.tsx");
  const card = read("components/search/SearchResultCard.tsx");

  assert.match(client, /onVideos:\s*\(videos:\s*Video\[\]\)/);
  assert.match(client, /onVideos\(\[\.\.\.videos\.values\(\)\]\)/);
  assert.match(home, /<SearchResults/);
  assert.match(results, /accountId=/);
  assert.match(results, /mode=/);
  assert.match(policy, /normalizedTitle/);
  assert.match(grid, /groupSearchVideos/);
  assert.match(grid, /VideoGroupCard/);
  assert.match(grouped, /data-result-kind="group"/);
  assert.match(grouped, /videos\.length/);
  assert.match(grouped, /storeGroupedSources/);
  assert.doesNotMatch(grouped, /sessionStorage\.setItem/);
  assert.match(card, /data-result-kind="video"/);
  assert.match(card, /sourceName/);
  assert.match(card, /type_name/);
  assert.match(card, /vod_lang/);
});

test("T11 display preference is isolated by account and mode", () => {
  const preference = read("lib/hooks/useSearchDisplayMode.ts");
  assert.match(preference, /encodeURIComponent\(accountId\)/);
  assert.match(preference, /mode/);
  assert.match(preference, /uxuv-search-display:v1/);
  assert.match(preference, /value === "normal" \? "normal" : "grouped"/);
  assert.match(preference, /useSyncExternalStore\(subscribe, getSnapshot, \(\) => "grouped"\)/);
});

test("S21-T07 keeps compact controls collapsed while sort and category blocking stay on one row", () => {
  const controls = read("components/search/SearchResultControls.tsx");
  const css = read("app/globals.css");
  assert.match(controls, /useState\(false\)/);
  assert.match(controls, /aria-expanded=\{expanded\}/);
  assert.match(controls, /hidden=\{!expanded\}/);
  assert.match(controls, /kvideo-block-category-compact/);
  assert.match(css, /\.kvideo-result-policy-row\s*\{[^}]*grid-template-columns:[^}]*minmax\(0,\s*1fr\)[^}]*minmax\(0,\s*1fr\)/s);
  assert.match(css, /\.capability-hint\s*\{[^}]*margin:[^;}]*8px[^}]*font-size/s);
});

test("S21-T07 places probe and favorite controls in one non-overlapping 44px action region", () => {
  const card = read("components/search/SearchResultCard.tsx");
  const group = read("components/search/VideoGroupCard.tsx");
  const grid = read("components/search/VideoGrid.tsx");
  const css = read("app/globals.css");
  assert.match(card, /kvideo-result-actions/);
  assert.match(group, /kvideo-result-actions/);
  assert.match(grid, /favoriteVideo=/);
  assert.match(group, /favoriteVideo \?\? representative/);
  assert.match(css, /\.kvideo-result-actions\s*\{[^}]*gap:\s*8px/s);
  assert.match(css, /\.kvideo-result-favorite\s*\{[^}]*min-height:\s*var\(--control-hit-size\)/s);
  assert.match(css, /\.kvideo-result-probe\s*\{[^}]*min-height:\s*var\(--control-hit-size\)/s);
});
