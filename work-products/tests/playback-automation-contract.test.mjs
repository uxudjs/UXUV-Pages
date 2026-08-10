import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("player consumes skip and next settings through one bounded hook", async () => {
  const [hook, player, experience] = await Promise.all([
    read("../../components/player/hooks/useAutoSkip.ts"),
    read("../../components/media/MediaPlayer.tsx"),
    read("../../components/PlayerExperience.tsx"),
  ]);
  assert.match(hook, /addEventListener\(["']ended["']/);
  assert.match(hook, /lastHandledSourceRef/);
  assert.match(player, /useAutoSkip\(\{/);
  assert.match(player, /autoSkipIntro/);
  assert.match(player, /autoSkipOutro/);
  assert.match(player, /autoNextEpisode/);
  assert.match(experience, /hasNextEpisode/);
  assert.match(experience, /onNextEpisode/);
});

test("player exposes four live ad modes and sends only bounded same-origin media options", async () => {
  const [menu, controls, media, client] = await Promise.all([
    read("../../components/player/desktop/DesktopAdFilterMenu.tsx"),
    read("../../components/player/desktop/DesktopControls.tsx"),
    read("../../components/media/MediaPlayer.tsx"),
    read("../../lib/media/media-client.ts"),
  ]);
  for (const mode of ["off", "keyword", "heuristic", "aggressive"]) assert.match(menu, new RegExp(`"${mode}"`));
  assert.match(controls, /<DesktopAdFilterMenu/);
  assert.match(media, /adFilterMode:\s*playerSettings\.adFilterMode/);
  assert.match(media, /adKeywords:\s*playerSettings\.adKeywords/);
  assert.match(client, /query\.set\(["']ad["']/);
  assert.match(client, /query\.append\(["']adkw["']/);
  const buildMediaUrl = client.match(/export function buildMediaUrl[\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(buildMediaUrl, /fetch\(/);
});
