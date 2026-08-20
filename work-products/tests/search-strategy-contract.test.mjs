import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

async function loadSearchPolicy() {
  const output = ts.transpileModule(read("lib/utils/search-result-policy.ts"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

const video = (id, overrides = {}) => ({
  vod_id: id,
  vod_name: "同名作品",
  source: `source-${id}`,
  ...overrides,
});

test("T12 keeps every KVideo sort option with a deterministic final tie-break", () => {
  const policy = read("lib/utils/search-result-policy.ts");
  for (const option of ["default", "relevance", "latency-asc", "date-desc", "date-asc", "rating-desc", "name-asc", "name-desc"]) {
    assert.match(policy, new RegExp(`['\"]${option}['\"]`));
  }
  assert.match(policy, /originalIndex/);
  assert.match(policy, /blockedCategories/);
  assert.match(policy, /selectedSources/);
  assert.match(policy, /selectedTypes/);
  assert.match(policy, /selectedLanguages/);
});

test("T12 pings and probes only through authenticated same-origin Worker routes", () => {
  const latency = read("lib/hooks/useLatencyPing.ts");
  const probe = read("components/ResolutionProbeButton.tsx");
  const results = read("components/search/SearchResults.tsx");
  const card = read("components/search/SearchResultCard.tsx");

  assert.match(latency, /fetch\(["']\/api\/ping["']/);
  assert.match(latency, /method:\s*["']POST["']/);
  assert.match(latency, /AbortController/);
  assert.match(probe, /probeResolution/);
  assert.match(results, /SearchResultControls/);
  assert.match(results, /useLatencyPing/);
  assert.match(card, /ResolutionProbeButton/);
});

test("S21-T07 conservatively groups the five required title, type-family, and year fixtures", async () => {
  const { groupSearchVideos, searchGroupKey } = await loadSearchPolicy();
  const fixtures = [
    {
      name: "anime and TV stay separate",
      videos: [video("anime", { type_name: "动漫", vod_year: "2025" }), video("tv", { type_name: "电视剧", vod_year: "2025" })],
      groups: 2,
    },
    {
      name: "same family and year merge",
      videos: [video("movie-cn", { type_name: "电影", vod_year: "2025" }), video("movie-tw", { type_name: "電影", vod_year: "2025" })],
      groups: 1,
    },
    {
      name: "different years stay separate",
      videos: [video("year-a", { type_name: "电影", vod_year: "2024" }), video("year-b", { type_name: "电影", vod_year: "2025" })],
      groups: 2,
    },
    {
      name: "unknown fields do not join known buckets",
      videos: [video("unknown"), video("known", { type_name: "电影", vod_year: "2025" })],
      groups: 2,
    },
    {
      name: "NFC and collapsed whitespace preserve a legitimate merge",
      videos: [video("space-a", { vod_name: " 同名　作品 ", type_name: "電影", vod_year: "2025" }), video("space-b", { vod_name: "同名 作品", type_name: "电影", vod_year: "2025" })],
      groups: 1,
    },
  ];

  for (const fixture of fixtures) {
    assert.equal(groupSearchVideos(fixture.videos, {}).length, fixture.groups, fixture.name);
  }
  assert.notEqual(
    searchGroupKey(video("punctuation-a", { vod_name: "作品-2", type_name: "电影", vod_year: "2025" })),
    searchGroupKey(video("punctuation-b", { vod_name: "作品2", type_name: "电影", vod_year: "2025" })),
  );
});

test("S21-T07 keeps representative selection latency-ranked and stable inside each conservative group", async () => {
  const { groupSearchVideos } = await loadSearchPolicy();
  const groups = groupSearchVideos([
    video("slow", { type_name: "电影", vod_year: "2025", source: "slow" }),
    video("fast", { type_name: "電影", vod_year: "2025", source: "fast" }),
  ], { slow: 180, fast: 40 });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].representative.source, "fast");
  assert.deepEqual(groups[0].videos.map(({ source }) => source), ["fast", "slow"]);
});
