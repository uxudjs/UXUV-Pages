import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testsRoot = dirname(fileURLToPath(import.meta.url));
const root = join(testsRoot, "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("builds the basic KVideo home from only its used card and grid primitives", () => {
  const home = read("components/HomeExperience.tsx");
  const card = read("components/home/MovieCard.tsx");
  const grid = read("components/home/MovieGrid.tsx");
  const primitive = read("components/ui/Card.tsx");
  const poster = read("public/placeholder-poster.svg");

  assert.match(home, /MovieGrid/);
  assert.match(card, /<Card/);
  assert.match(card, /placeholder-poster\.svg/);
  assert.match(card, /<Icon/);
  assert.match(grid, /role="status"/);
  assert.match(grid, /role="alert"/);
  assert.match(primitive, /ui-card/);
  assert.match(poster, /Image Not Available/);
});

test("loads the basic home feed through the authenticated same-origin Worker route", () => {
  const home = read("components/HomeExperience.tsx");
  const client = read("lib/content/api-client.ts");

  assert.match(home, /fetchHomeMovies/);
  assert.match(client, /doubanUrl\("recommend"/);
  assert.match(client, /credentials:\s*"same-origin"/);
  assert.doesNotMatch(client, /https?:\/\//);
});

test("opens a home poster directly in the matching player route", () => {
  const home = read("components/HomeExperience.tsx");

  assert.match(home, /const openHomeMovie = async \(movie: HomeMovie\)/);
  assert.match(home, /const found = await runSearch\(movie\.title\)/);
  assert.match(home, /groupSearchVideos\(exactMatches/);
  assert.match(home, /searchTypeFamily/);
  assert.match(home, /router\.push\(`\/player\?\$\{parameters\.toString\(\)\}`\)/);
  assert.match(home, /onMovieClick=\{\(movie\) => void openHomeMovie\(movie\)\}/);
  assert.doesNotMatch(home, /onMovieClick=\{\(movie\) => void runSearch\(movie\.title\)\}/);
});

test("uses UXUVideo for every user-visible brand reference", () => {
  const navigation = read("components/ContentNavigation.tsx");
  const playerSettings = read("components/settings/PlayerSettings.tsx");
  const updateControl = read("components/AppUpdateControl.tsx");
  const visibleBranding = `${navigation}\n${playerSettings}\n${updateControl}`;

  assert.doesNotMatch(visibleBranding, /KVideo/);
});

test("T54 keeps only high-frequency content navigation actions", () => {
  const navigation = read("components/ContentNavigation.tsx");

  for (const removed of [/Github/, /Heart/, /nav-github/, /locale-control/, /localeLabels/, /copy\.favorites/, /copy\.repository/]) {
    assert.doesNotMatch(navigation, removed);
  }
  assert.match(navigation, /ThemeSwitcher/);
  assert.doesNotMatch(navigation, /source=\{Tv\}/);
  assert.match(navigation, /source=\{LogOut\}/);
  assert.match(navigation, /signOut/);
});

test("drives KVideo discovery through typed same-origin tag and recommendation requests", () => {
  const home = read("components/HomeExperience.tsx");
  const controls = read("components/home/DiscoverControls.tsx");
  const client = read("lib/content/api-client.ts");

  assert.match(home, /<DiscoverControls/);
  assert.match(home, /contentType/);
  assert.match(home, /selectedTag/);
  assert.match(controls, /aria-pressed/);
  assert.match(controls, /data-focusable/);
  assert.match(client, /fetchHomeTags/);
  assert.match(client, /searchParams\.set\(key, value\)/);
  assert.match(client, /doubanUrl\("recommend", \{[\s\S]*type,[\s\S]*tag,/);
  assert.match(client, /credentials:\s*"same-origin"/);
  assert.doesNotMatch(`${home}\n${controls}\n${client}`, /https?:\/\//);
});

test("S21-T05 removes only the embedded continue-watching row", () => {
  const home = read("components/HomeExperience.tsx");
  assert.match(home, /onBrandActivate=\{clearSearch\}/);
  assert.doesNotMatch(home, /Continue watching|继续观看|繼續觀看|history-row|history-title/);
  assert.match(home, /historyForMode/);
  assert.match(home, /usePersonalizedRecommendations\(contentType, history\)/);
  assert.match(home, /<WatchHistorySidebar\s*\/>/);
});
