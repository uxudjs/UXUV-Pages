import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("T21 composes the player route from the reviewed shell components", () => {
  const player = read("components/PlayerExperience.tsx");
  for (const component of ["PlayerNavbar", "VideoMetadata", "EpisodeList"]) {
    assert.match(player, new RegExp(component));
  }
  assert.doesNotMatch(player, /<PlayerFavoriteButton/);
  assert.match(player, /data-no-spatial/);
  assert.match(player, /shellControls/);
  assert.match(player, /premium/);
});

test("T21 keeps grouped source payloads out of short player URLs", () => {
  const player = read("components/PlayerExperience.tsx");
  const cache = read("lib/media/grouped-sources-cache.ts");
  assert.match(player, /groupedSources/);
  assert.match(player, /\bgs\b/);
  assert.match(player, /readGroupedSources/);
  assert.match(cache, /sessionStorage/);
  assert.match(cache, /MAX_CACHE_ENTRIES/);
  assert.doesNotMatch(cache, /password|cookie|authorization/i);
});

test("T21 preserves the reviewed source and episode list boundaries", () => {
  const episodes = read("components/player/EpisodeList.tsx");
  assert.match(episodes, /EPISODES_PER_PAGE\s*=\s*50/);
  assert.match(episodes, /MAX_VISIBLE_SOURCES\s*=\s*5/);
  assert.match(episodes, /episodeLayout/);
  assert.match(episodes, /role="radiogroup"/);
  assert.match(episodes, /typeName/);
  assert.match(episodes, /sourceSectionCollapsed/);
  assert.match(episodes, /episodeSectionCollapsed/);
  assert.match(episodes, /scrollIntoView/);
  assert.match(episodes, /shiftKey/);
  assert.match(episodes, /scrollLeft/);
});

test("T21 exposes fixed metadata search, navigation, and one-click favorite controls", () => {
  const metadata = read("components/player/VideoMetadata.tsx");
  const navbar = read("components/player/PlayerNavbar.tsx");
  const favorite = read("components/player/PlayerFavoriteButton.tsx");
  assert.match(metadata, /splitPersonNames/);
  assert.match(metadata, /movie\.douban\.com\/celebrities\/search/);
  assert.match(navbar, /router\.back/);
  assert.match(navbar, /premium\/settings/);
  assert.match(navbar, /PlayerFavoriteButton/);
  assert.match(navbar, /displayInitial\(auth\?\.session\.name, auth\?\.session\.username\)/);
  assert.doesNotMatch(navbar, /\bSettings\b|locale-control|setLocale|<select/);
  assert.match(favorite, /aria-pressed/);
  assert.match(favorite, /upsertRecord/);
  assert.match(favorite, /removeRecord/);
});

test("S21-T12 shares one player width and keeps cinema sources and episodes below the video", () => {
  const player = read("components/PlayerExperience.tsx");
  const css = read("app/globals.css");
  assert.match(css, /--player-content-width/);
  assert.match(css, /\.player-navbar[^}]+width:\s*var\(--player-content-width\)/s);
  assert.match(css, /\.player-main[^}]+width:\s*var\(--player-content-width\)/s);
  assert.match(css, /\.player-layout\[data-viewport="cinema"\][^}]+grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(css, /\.player-layout\[data-viewport="cinema"\][^}]+\.episode-options[^}]+overflow-x:\s*auto/s);
  assert.match(player, /<section className="player-secondary">[\s\S]+<div className="desktop-metadata">/);
});

test("S21-T12 disables the global back-to-top control only for web fullscreen", () => {
  const backToTop = read("components/ui/BackToTop.tsx");
  const fullscreen = read("components/player/hooks/useFullscreenControls.ts");
  assert.match(backToTop, /player-web-fullscreen-open/);
  assert.match(backToTop, /MutationObserver/);
  assert.match(backToTop, /hidden=\{webFullscreen\}/);
  assert.match(backToTop, /tabIndex=\{webFullscreen \? -1/);
  assert.match(fullscreen, /fullscreenMode !== "window"/);
  assert.match(fullscreen, /document\.body\.classList\.add\("player-web-fullscreen-open"\)/);
});
