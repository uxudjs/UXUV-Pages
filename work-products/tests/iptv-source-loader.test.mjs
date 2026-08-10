import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import test from "node:test";

const output = await build({ entryPoints: [fileURLToPath(new URL("../../lib/iptv/source-loader.ts", import.meta.url))],
  bundle: true, write: false, platform: "node", format: "esm", target: "es2022" });
const loader = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);

const sources = Array.from({ length: 7 }, (_, index) => ({ id: `source-${index}`, name: `Source ${index}`,
  url: `https://source-${index}.example/list.m3u`, kind: "builtin", updatedAt: 0 }));

test("loads at most three source or nested playlist requests concurrently and caches each root", async () => {
  let active = 0;
  let maximum = 0;
  let requests = 0;
  const fetcher = async () => {
    requests += 1;
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return new Response(`#EXTM3U\n#EXTINF:-1 group-title="Test",Channel\nhttps://media.example/live.m3u8`);
  };
  const first = await loader.loadIptvSources(sources, { fetcher, force: true });
  assert.equal(first.length, 7);
  assert.equal(first.every(({ state }) => state === "ready"), true);
  assert.equal(maximum, 3);
  assert.equal(requests, 7);
  const second = await loader.loadIptvSources(sources, { fetcher });
  assert.equal(requests, 7);
  assert.equal(second.every(({ cached }) => cached), true);
});

test("reports one failed source without discarding successful source results", async () => {
  const results = await loader.loadIptvSources(sources.slice(0, 2), { force: true, fetcher: async (input) => {
    const url = String(input);
    return url.includes("source-0") ? new Response("failed", { status: 502 })
      : new Response(`#EXTM3U\n#EXTINF:-1,Good\nhttps://media.example/good.m3u8`);
  } });
  assert.deepEqual(results.map(({ state }) => state), ["error", "ready"]);
  assert.equal(results[0].status, 502);
});
