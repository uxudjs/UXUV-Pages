import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

async function loadPolicy() {
  const directory = await mkdtemp(join(tmpdir(), "uxuv-iptv-playback-"));
  const outfile = join(directory, "policy.mjs");
  await build({ entryPoints: [new URL("../../lib/iptv/playback-policy.ts", import.meta.url).pathname.slice(1)],
    outfile, bundle: true, platform: "node", format: "esm" });
  const policy = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
  return { policy, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

test("collapses IPTV routes after the first three without losing stable order", async () => {
  const { policy, cleanup } = await loadPolicy();
  try {
    const routes = ["https://media.example/1.m3u8", "https://media.example/2.m3u8",
      "https://media.example/3.m3u8", "https://media.example/4.m3u8"];
    assert.deepEqual(policy.visibleIptvRoutes(routes, false), routes.slice(0, 3));
    assert.deepEqual(policy.visibleIptvRoutes(routes, true), routes);
  } finally { await cleanup(); }
});

test("prefers H.264 and measured latency while keeping HEVC as an explicit fallback", async () => {
  const { policy, cleanup } = await loadPolicy();
  try {
    const avc = "https://media.example/live-h264.m3u8";
    const unknown = "https://media.example/live.m3u8";
    const hevc = "https://media.example/live-hevc.m3u8";
    const ordered = policy.orderIptvRoutes([hevc, unknown, avc], new Map([[avc, 40], [unknown, 20], [hevc, 5]]), false);
    assert.deepEqual(ordered, [avc, unknown, hevc]);
    assert.equal(policy.isHevcRoute(hevc), true);
    assert.equal(policy.isHevcRoute(avc), false);
  } finally { await cleanup(); }
});

test("selects a non-HEVC HLS level or reports an incompatible HEVC-only manifest", async () => {
  const { policy, cleanup } = await loadPolicy();
  try {
    assert.deepEqual(policy.selectCompatibleHlsLevel([
      { videoCodec: "hvc1.1.6.L120" }, { videoCodec: "avc1.640028" },
    ], false), { level: 1, incompatible: false });
    assert.deepEqual(policy.selectCompatibleHlsLevel([{ videoCodec: "hev1.1.6.L120" }], false),
      { level: null, incompatible: true });
    assert.deepEqual(policy.selectCompatibleHlsLevel([{ videoCodec: "hev1.1.6.L120" }], true),
      { level: 0, incompatible: false });
  } finally { await cleanup(); }
});

test("bounded route probing uses at most three requests and preserves failures", async () => {
  const { policy, cleanup } = await loadPolicy();
  try {
    let active = 0;
    let maximum = 0;
    const fetchImpl = async (_input, init) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      const target = JSON.parse(init.body).url;
      return new Response(JSON.stringify({ success: !target.endsWith("/4"), latency: Number(target.at(-1)) * 10 }),
        { headers: { "Content-Type": "application/json" } });
    };
    const routes = [1, 2, 3, 4, 5].map((value) => `https://media.example/${value}`);
    const result = await policy.probeIptvRoutes(routes, { fetchImpl });
    assert.equal(maximum, 3);
    assert.deepEqual([...result.entries()], [[routes[0], 10], [routes[1], 20], [routes[2], 30], [routes[4], 50]]);
  } finally { await cleanup(); }
});
