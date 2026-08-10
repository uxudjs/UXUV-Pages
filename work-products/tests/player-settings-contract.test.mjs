import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("T18 preserves the reviewed player defaults, ranges, and compatibility boundary", () => {
  const policy = read("lib/player/player-settings.ts");
  for (const token of [
    "autoNextEpisode: true", "autoSkipIntro: false", "skipIntroSeconds: 0",
    "autoSkipOutro: false", "skipOutroSeconds: 0", "seekStepSeconds: 10",
    'adFilterMode: "heuristic"', 'fullscreenType: "auto"', 'proxyMode: "retry"',
    "videoTogetherEnabled: false",
    "danmakuEnabled: false", "danmakuOpacity: 0.7", "danmakuFontSize: 20", "danmakuDisplayArea: 0.5",
  ]) assert.match(policy, new RegExp(token));
  assert.match(policy, /MIN_SEEK_STEP_SECONDS = 1/);
  assert.match(policy, /MAX_SEEK_STEP_SECONDS = 120/);
  assert.match(policy, /MAX_SKIP_SECONDS = 600/);
  assert.match(policy, /uxuv-player-settings-account-migration-v1/);
});

test("T18 exposes every player, skip, proxy, ad, and danmaku control through one synced snapshot", () => {
  const player = read("components/settings/PlayerSettings.tsx");
  const danmaku = read("components/settings/UserDanmakuSettings.tsx");
  const hook = read("lib/hooks/usePlayerSettings.ts");
  const consumer = read("components/media/MediaPlayer.tsx");
  for (const token of [
    "fullscreenType", "seekStepSeconds", "proxyMode", "autoNextEpisode", "autoSkipIntro",
    "skipIntroSeconds", "autoSkipOutro", "skipOutroSeconds", "showModeIndicator", "adFilterMode",
    "adKeywords", "videoTogetherEnabled", "danmakuEnabled", "danmakuOpacity", "danmakuFontSize", "danmakuDisplayArea",
  ]) assert.match(player, new RegExp(token));
  assert.match(hook, /updateConfigField/);
  assert.match(consumer, /usePlayerSettings/);
  assert.match(consumer, /data-proxy-mode/);
  assert.match(consumer, /playerSettings\.videoTogetherEnabled/);
  assert.match(danmaku, /activeDanmakuApiId/);
  assert.match(danmaku, /unsafeDanmakuUrlReason/);
});

test("T18 keeps the settings order, three languages, permissions, and same-origin safety explanation explicit", () => {
  const page = read("app/settings/page.tsx");
  const player = read("components/settings/PlayerSettings.tsx");
  const danmaku = read("components/settings/UserDanmakuSettings.tsx");
  assert.match(page, /<PlayerSettings/);
  assert.match(page, /<UserDanmakuSettings/);
  for (const locale of ["zh-CN", "zh-TW", "en"]) {
    assert.match(player, new RegExp(`(?:(?:"${locale}")|(?:${locale}:))`));
    assert.match(danmaku, new RegExp(`(?:(?:"${locale}")|(?:${locale}:))`));
  }
  assert.match(player, /player_settings/);
  assert.match(player, /same-origin/);
  assert.match(danmaku, /danmaku_api/);
});
