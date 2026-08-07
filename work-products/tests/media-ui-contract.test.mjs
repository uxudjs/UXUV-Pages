import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");
const mediaFiles = [
  "lib/media/media-client.ts",
  "components/media/MediaPlayer.tsx",
  "components/PlayerExperience.tsx",
  "components/IptvExperience.tsx",
  "app/player/page.tsx",
  "app/iptv/page.tsx",
];

test("player and IPTV static entries use only same-origin Worker media routes", () => {
  for (const path of mediaFiles) assert.equal(existsSync(join(root, path)), true, `${path} must exist`);
  const client = read("lib/media/media-client.ts");
  const player = read("components/PlayerExperience.tsx");
  const iptv = read("components/IptvExperience.tsx");
  const combined = mediaFiles.map(read).join("\n");

  assert.match(client, /fetch\(["']\/api\/detail["']/);
  assert.match(client, /["']\/api\/proxy["']/);
  assert.match(client, /\/api\/iptv\?/);
  assert.match(client, /["']\/api\/iptv\/stream["']/);
  assert.match(client, /credentials:\s*["']same-origin["']/);
  assert.match(player, /useSync\(\)/);
  assert.match(player, /getVideoDetail\(/);
  assert.match(player, /<MediaPlayer/);
  assert.match(iptv, /useRuntimeConfig\(\)/);
  assert.match(iptv, /iptv_access/);
  assert.match(iptv, /loadIptvPlaylist\(/);
  assert.match(iptv, /<MediaPlayer/);
  assert.doesNotMatch(combined, /fetch\(\s*(?:target|source|channel|episode)\.(?:url|baseUrl)/);
  assert.doesNotMatch(combined, /localStorage|sessionStorage|github\.io|ADMIN_PASSWORD|AUTH_SECRET/);
});

test("media lifecycle destroys stale HLS work and exposes classified failures", () => {
  const player = read("components/media/MediaPlayer.tsx");
  assert.match(player, /import\(["']hls\.js["']\)/);
  assert.match(player, /AbortController/);
  assert.match(player, /\.destroy\(\)/);
  assert.match(player, /MEDIA_TOKEN_INVALID|IPTV_ACCESS_REQUIRED|RATE_LIMITED|UPSTREAM_STREAM_ERROR/);
  assert.match(player, /role=["']alert["']/);
  assert.match(player, /aria-label=["']视频播放器["']/);
});

test("player and IPTV routes render their migrated static experiences", () => {
  assert.match(read("app/player/page.tsx"), /<PlayerExperience\s*\/>/);
  assert.match(read("app/iptv/page.tsx"), /<IptvExperience\s*\/>/);
});
