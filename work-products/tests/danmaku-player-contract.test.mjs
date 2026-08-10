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
