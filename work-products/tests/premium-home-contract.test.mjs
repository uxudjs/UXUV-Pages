import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const experience = await readFile(new URL("../../components/premium/PremiumExperience.tsx", import.meta.url), "utf8");
const client = await readFile(new URL("../../lib/content/premium-client.ts", import.meta.url), "utf8");

test("T29 Premium home is localized, paged, isolated, and TV focusable", () => {
  for (const locale of ["zh-CN", "zh-TW", "en"]) assert.match(experience, new RegExp(`(?:(?:"${locale}")|(?:${locale}:))`));
  assert.match(experience, /historyForMode/);
  assert.match(experience, /premiumRecommendationTerms/);
  assert.match(experience, /group.*premium/);
  assert.match(experience, /data-premium-stage/);
  assert.match(experience, /data-focusable/);
  assert.match(experience, /loadPremiumCategory\([^)]*(?:page|nextPage)/);
  assert.match(client, /page:\s*number/);
});

test("T29 keeps search and authorization on same-origin Worker routes", () => {
  assert.match(experience, /searchVideos/);
  assert.match(experience, /status === 403/);
  assert.match(client, /credentials:\s*"same-origin"/);
  assert.doesNotMatch(experience, /fetch\(\s*(?:source|video)\.(?:baseUrl|url)/);
});
