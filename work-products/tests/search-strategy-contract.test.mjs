import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

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
