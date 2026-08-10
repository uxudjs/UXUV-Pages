import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");
const modules = [
  "components/player/hooks/useHlsPlayer.ts",
  "components/player/hooks/usePlaybackHistory.ts",
  "components/player/hooks/useSourceResolutionProbe.ts",
  "components/player/hooks/useStallDetection.ts",
  "components/player/hooks/useVideoResolution.ts",
  "lib/player/resolution-cache.ts",
];

test("T24 separates bounded playback lifecycle modules", () => {
  for (const path of modules) assert.equal(existsSync(join(root, path)), true, `${path} must exist`);
  const hls = read(modules[0]);
  assert.match(hls, /AbortController/);
  assert.match(hls, /destroy\(\)/);
  assert.match(hls, /MAX_NETWORK_RETRIES/);
  assert.match(hls, /proxyMode/);
  assert.doesNotMatch(hls, /buildMediaUrl|target\s*:/);
});

test("T24 connects real media events to bounded history and resolution state", () => {
  const player = read("components/media/MediaPlayer.tsx");
  const route = read("components/PlayerExperience.tsx");
  assert.match(player, /useHlsPlayer/);
  assert.match(player, /useStallDetection/);
  assert.match(player, /useVideoResolution/);
  assert.match(player, /initialTime/);
  assert.match(player, /onProgress/);
  assert.doesNotMatch(player, /import\("hls\.js"\)/);
  assert.match(route, /usePlaybackHistory/);
  assert.match(route, /failedSources/);
  assert.match(route, /sortPlaybackSources/);
  assert.match(route, /onTerminalError/);
  assert.match(route, /useLatencyPing/);
  assert.match(route, /useSourceResolutionProbe/);
});

test("T24 preserves local progress frequently while bounding remote library writes", () => {
  const history = read("components/player/hooks/usePlaybackHistory.ts");
  const sync = read("components/SyncProvider.tsx");
  for (const token of ["HISTORY_LOCAL_WRITE_MS", "HISTORY_REMOTE_SYNC_DELAY_MS", "normalizePlaybackTitle", "findPlaybackHistory"]) {
    assert.match(history, new RegExp(token));
  }
  assert.match(sync, /syncDelay/);
  assert.match(sync, /replaceScheduled/);
});

test("T24 exposes actual played resolution and episode-scoped cache reuse", () => {
  const resolution = read("components/player/hooks/useVideoResolution.ts");
  const cache = read("lib/player/resolution-cache.ts");
  assert.match(resolution, /loadedmetadata/);
  assert.match(resolution, /resize/);
  assert.match(cache, /origin/);
  assert.match(cache, /episodeIndex/);
  assert.match(cache, /shouldReuseCachedResolution/);
  assert.match(read("lib/content/probe-client.ts"), /probeResolutions/);
  assert.match(read("components/player/EpisodeList.tsx"), /sourceResolutions/);
});
