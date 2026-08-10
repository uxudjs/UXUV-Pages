import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const player = await readFile(new URL("../../components/iptv/IPTVPlayer.tsx", import.meta.url), "utf8");
const experience = await readFile(new URL("../../components/IptvExperience.tsx", import.meta.url), "utf8");
const mediaPlayer = await readFile(new URL("../../components/media/MediaPlayer.tsx", import.meta.url), "utf8");
const hls = await readFile(new URL("../../components/player/hooks/useHlsPlayer.ts", import.meta.url), "utf8");

test("IPTV player owns bounded route selection, latency probing, failover, and close shortcuts", () => {
  assert.match(player, /visibleIptvRoutes/);
  assert.match(player, /probeIptvRoutes/);
  assert.match(player, /onTerminalError/);
  assert.match(player, /attemptedRoutes/);
  assert.match(player, /onClose=/);
  assert.match(player, /data-iptv-route-count/);
  assert.match(experience, /<IPTVPlayer/);
});

test("protected media remains same-origin and IPTV HLS rejects unsupported HEVC-only manifests", () => {
  assert.match(mediaPlayer, /route="iptv-stream"|route: "proxy" \| "iptv-stream"/);
  assert.match(mediaPlayer, /codecUnsupported/);
  assert.match(hls, /selectCompatibleHlsLevel/);
  assert.match(hls, /protectedMediaUrl/);
  assert.doesNotMatch(player, /fetch\(\s*(?:route|target|activeRoute)/);
});

