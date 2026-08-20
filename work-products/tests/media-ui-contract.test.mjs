import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");
const mediaFiles = [
  "lib/media/media-client.ts",
  "lib/media/playback-routing.ts",
  "components/media/MediaPlayer.tsx",
  "components/PlayerExperience.tsx",
  "lib/player/hls-compatibility.ts",
  "app/player/page.tsx",
];

test("player scopes browser-direct fallback to regular video", () => {
  for (const path of mediaFiles) assert.equal(existsSync(join(root, path)), true, `${path} must exist`);
  const client = read("lib/media/media-client.ts");
  const routing = read("lib/media/playback-routing.ts");
  const player = read("components/PlayerExperience.tsx");
  const combined = mediaFiles.map(read).join("\n");

  assert.match(client, /fetch\(["']\/api\/detail["']/);
  assert.match(client, /return `\/api\/proxy\?\$\{query\}`/);
  assert.match(client, /credentials:\s*["']same-origin["']/);
  assert.match(routing, /proxyMode === ["']retry["']/);
  assert.match(routing, /fallbackSrc: directSrc/);
  assert.match(routing, /proxyMode === ["']none["']/);
  assert.match(player, /useSync\(\)/);
  assert.match(player, /getVideoDetail\(/);
  assert.match(player, /<MediaPlayer/);
  assert.doesNotMatch(combined, /fetch\(\s*(?:target|source|channel|episode)\.(?:url|baseUrl)/);
  assert.doesNotMatch([client, read("components/media/MediaPlayer.tsx")].join("\n"), /localStorage|sessionStorage/);
  assert.doesNotMatch(combined, /github\.io|ADMIN_PASSWORD|AUTH_SECRET/);
});

test("media lifecycle destroys stale HLS work and exposes classified failures", () => {
  const player = read("components/media/MediaPlayer.tsx");
  const hls = read("components/player/hooks/useHlsPlayer.ts");
  assert.match(player, /useHlsPlayer/);
  assert.match(hls, /import\(["']hls\.js["']\)/);
  assert.match(hls, /AbortController/);
  assert.match(hls, /\.destroy\(\)/);
  assert.match(player, /MEDIA_TOKEN_INVALID|RATE_LIMITED|UPSTREAM_STREAM_ERROR/);
  assert.match(player, /role=["']alert["']/);
  assert.match(player, /aria-label=["']视频播放器["']/);
});

test("player route renders its migrated static experience", () => {
  assert.match(read("app/player/page.tsx"), /<PlayerExperience\s*\/>/);
});
