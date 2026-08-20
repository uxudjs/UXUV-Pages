import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("player resolves danmaku through the authenticated same-origin boundary", async () => {
  const [hook, player, experience] = await Promise.all([
    read("../../components/player/hooks/useDanmaku.ts"),
    read("../../components/media/MediaPlayer.tsx"),
    read("../../components/PlayerExperience.tsx"),
  ]);

  assert.match(hook, /fetch\(["'`]\/api\/danmaku/);
  assert.match(hook, /credentials:\s*["']same-origin["']/);
  assert.match(hook, /new AbortController\(\)/);
  assert.match(hook, /activeDanmakuApiId/);
  assert.match(hook, /keyword:\s*videoTitle/);
  assert.doesNotMatch(hook, /dangerouslySetInnerHTML/);
  assert.match(player, /<DanmakuCanvas/);
  assert.match(player, /danmakuOpacity/);
  assert.match(player, /danmakuFontSize/);
  assert.match(player, /danmakuDisplayArea/);
  assert.match(experience, /danmaku=\{\{/);
});

test("canvas has bounded tracks and playback lifecycle integration", async () => {
  const canvas = await read("../../components/player/DanmakuCanvas.tsx");

  assert.match(canvas, /MAX_ACTIVE_DANMAKU/);
  assert.match(canvas, /requestAnimationFrame/);
  assert.match(canvas, /Math\.abs\(currentTime - lastTimeRef\.current\)/);
  assert.match(canvas, /ResizeObserver/);
  assert.match(canvas, /aria-hidden/);
  assert.doesNotMatch(canvas, /settingsStore/);
});

test("S21-T09 requires an explicit user selection and keeps API management out of player appearance", async () => {
  const [hook, manager, player, premium] = await Promise.all([
    read("../../components/player/hooks/useDanmaku.ts"),
    read("../../components/settings/UserDanmakuSettings.tsx"),
    read("../../components/settings/PlayerSettings.tsx"),
    read("../../components/premium/PremiumSettingsExperience.tsx"),
  ]);

  assert.match(hook, /apis\.find\(\(\{ id \}\) => id === activeValue\)/);
  assert.match(hook, /activeApi\?\.url \?\? ""/);
  assert.doesNotMatch(hook, /apis\s*\[\s*0\s*\]/);
  assert.match(manager, /danmaku-api-empty/);
  assert.match(manager, /activeDanmakuApiId/);
  assert.match(manager, /danmakuEnabled/);
  assert.doesNotMatch(manager, /useRuntimeConfig|systemUrl|系统默认|系統預設|system default/i);
  assert.match(player, /hasActiveDanmakuApi/);
  assert.match(player, /disabled=\{!canDanmaku \|\| !runtime\.config\.capabilities\.danmaku \|\| !hasActiveDanmakuApi\}/);
  assert.doesNotMatch(player, /commitDanmakuUrl|player-danmaku-api|DANMAKU_COPY/);
  assert.match(premium, /<UserDanmakuSettings mode="premium" \/>/);
});
