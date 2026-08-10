import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("T11 search results keep incremental batches and the KVideo card boundary", () => {
  const client = read("lib/content/search-client.ts");
  const home = read("components/HomeExperience.tsx");
  const results = read("components/search/SearchResults.tsx");
  const grid = read("components/search/VideoGrid.tsx");
  const grouped = read("components/search/VideoGroupCard.tsx");
  const card = read("components/search/SearchResultCard.tsx");

  assert.match(client, /onVideos:\s*\(videos:\s*Video\[\]\)/);
  assert.match(client, /onVideos\(\[\.\.\.videos\.values\(\)\]\)/);
  assert.match(home, /<SearchResults/);
  assert.match(results, /accountId=/);
  assert.match(results, /mode=/);
  assert.match(grid, /toLocaleLowerCase\(\)/);
  assert.match(grid, /VideoGroupCard/);
  assert.match(grouped, /data-result-kind="group"/);
  assert.match(grouped, /videos\.length/);
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
  assert.match(preference, /value === "grouped" \? "grouped" : "normal"/);
});
