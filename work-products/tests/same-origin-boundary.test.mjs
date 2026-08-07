import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");
const productFiles = [
  "lib/content/types.ts",
  "lib/content/search-client.ts",
  "components/ContentNavigation.tsx",
  "components/VideoCard.tsx",
  "components/HomeExperience.tsx",
  "components/FavoritesExperience.tsx",
  "app/page.tsx",
  "app/favorites/page.tsx",
];
const premiumFiles = [
  "lib/content/api-client.ts",
  "lib/content/premium-client.ts",
  "lib/content/probe-client.ts",
  "components/ResolutionProbeButton.tsx",
  "components/premium/PremiumExperience.tsx",
  "components/premium/PremiumSettingsExperience.tsx",
  "app/premium/page.tsx",
  "app/premium/favorites/page.tsx",
  "app/premium/settings/page.tsx",
];

test("home and favorites use only same-origin APIs and the synced library document", () => {
  for (const path of productFiles) {
    assert.equal(existsSync(join(root, path)), true, `${path} must exist`);
  }

  const searchClient = read("lib/content/search-client.ts");
  const home = read("components/HomeExperience.tsx");
  const favorites = read("components/FavoritesExperience.tsx");
  const videoCard = read("components/VideoCard.tsx");
  const combined = productFiles.map(read).join("\n");

  assert.match(searchClient, /fetch\(["']\/api\/search-parallel["']/);
  assert.match(searchClient, /credentials:\s*["']same-origin["']/);
  assert.match(home, /useSync\(\)/);
  assert.match(home, /documents\.config\.payload\.sources/);
  assert.match(home, /searchVideos\(/);
  assert.match(videoCard, /\/player\?/);
  assert.match(videoCard, /upsertRecord|onToggleFavorite/);
  assert.match(favorites, /documents\.library\.payload\.favorites/);
  assert.match(favorites, /removeRecord\(["']library["'],\s*["']favorites["']/);
  assert.doesNotMatch(combined, /https?:\/\/[^\s"']+\/api\//);
  assert.doesNotMatch(combined, /github\.io|next\/image|localStorage|sessionStorage/);
});

test("home and favorites pages render their static client experiences", () => {
  assert.match(read("app/page.tsx"), /<HomeExperience\s*\/>/);
  assert.match(read("app/favorites/page.tsx"), /<FavoritesExperience\s*\/>/);
});

test("premium and probe clients stay same-origin and pages render static experiences", () => {
  for (const path of premiumFiles) {
    assert.equal(existsSync(join(root, path)), true, `${path} must exist`);
  }

  const apiClient = read("lib/content/api-client.ts");
  const premiumClient = read("lib/content/premium-client.ts");
  const probeClient = read("lib/content/probe-client.ts");
  const premium = read("components/premium/PremiumExperience.tsx");
  const settings = read("components/premium/PremiumSettingsExperience.tsx");
  const combined = premiumFiles.map(read).join("\n");

  assert.match(apiClient, /ContentApiError/);
  assert.match(premiumClient, /fetch\(["']\/api\/premium\/types["']/);
  assert.match(premiumClient, /fetch\(["']\/api\/premium\/category["']/);
  assert.match(premiumClient, /fetch\(["']\/api\/auth["']/);
  assert.match(probeClient, /fetch\(["']\/api\/probe-resolution["']/);
  assert.match(premiumClient + probeClient, /credentials:\s*["']same-origin["']/);
  assert.match(premium, /useSync\(\)/);
  assert.match(premium, /capability/);
  assert.match(settings, /upsertRecord\(["']config["'],\s*["']sources["']/);
  assert.match(read("app/premium/page.tsx"), /<PremiumExperience\s*\/>/);
  assert.match(read("app/premium/favorites/page.tsx"), /<FavoritesExperience\s+mode=["']premium["']/);
  assert.match(read("app/premium/settings/page.tsx"), /<PremiumSettingsExperience\s*\/>/);
  assert.doesNotMatch(combined, /https?:\/\/[^\s"']+\/api\//);
  assert.doesNotMatch(combined, /github\.io|localStorage|sessionStorage|ADMIN_PASSWORD|AUTH_SECRET/);
});
