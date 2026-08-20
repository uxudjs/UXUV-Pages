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

test("T18 exposes current player, proxy, ad, and danmaku controls through one synced snapshot", () => {
  const player = read("components/settings/PlayerSettings.tsx");
  const danmaku = read("components/settings/UserDanmakuSettings.tsx");
  const hook = read("lib/hooks/usePlayerSettings.ts");
  const consumer = read("components/media/MediaPlayer.tsx");
  for (const token of [
    "fullscreenType", "seekStepSeconds", "proxyMode", "autoNextEpisode",
    "showModeIndicator", "adFilterMode",
    "adKeywords", "videoTogetherEnabled", "danmakuEnabled", "danmakuOpacity", "danmakuFontSize", "danmakuDisplayArea",
  ]) assert.match(player, new RegExp(token));
  assert.match(hook, /updateConfigField/);
  assert.match(consumer, /usePlayerSettings/);
  assert.match(consumer, /data-proxy-mode/);
  assert.match(consumer, /playerSettings\.videoTogetherEnabled/);
  assert.match(danmaku, /activeDanmakuApiId/);
  assert.match(danmaku, /unsafeDanmakuUrlReason/);
  assert.match(player, /hasActiveDanmakuApi/);
  assert.doesNotMatch(player, /commitDanmakuUrl|player-danmaku-api|DANMAKU_COPY/);
  assert.doesNotMatch(player, /autoSkipIntro|skipIntroSeconds|autoSkipOutro|skipOutroSeconds/);
  assert.match(player, /playbackBehavior|networkPath|adFiltering|danmakuAppearance/);
  assert.match(danmaku, /danmaku-api-empty/);
});

test("T18 keeps the settings order, three languages, permissions, and direct fallback boundary explicit", () => {
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
  assert.match(player, /CORS/);
  assert.match(player, /回退一次|回退一次/);
  assert.match(danmaku, /activeDanmakuApiId/);
  assert.doesNotMatch(danmaku, /useRuntimeConfig/);
  const premium = read("components/premium/PremiumSettingsExperience.tsx");
  assert.match(premium, /<UserDanmakuSettings mode="premium" \/>/);
  assert.match(premium, /settings-domain-playback/);
});

test("S21-T11 drives skip automation only from the current player video rule", () => {
  const experience = read("components/PlayerExperience.tsx");
  const media = read("components/media/MediaPlayer.tsx");
  const settings = read("lib/hooks/usePlayerSettings.ts");
  assert.match(experience, /SkipRuleEditor/);
  assert.match(experience, /videoSkipRuleKey\(mode, sourceId, videoId\)/);
  assert.match(experience, /skipRule=\{skipRule\}/);
  assert.match(media, /skipRule\?:\s*VideoSkipRule/);
  assert.match(media, /autoSkipIntro:\s*skipRule\?\.introEnabled/);
  assert.match(media, /autoSkipOutro:\s*skipRule\?\.outroEnabled/);
  assert.doesNotMatch(media, /playerSettings\.(?:autoSkipIntro|skipIntroSeconds|autoSkipOutro|skipOutroSeconds)/);
  assert.match(settings, /updateConfigField\("videoSkipRules"/);
  assert.match(settings, /deleteVideoSkipRule/);
});
