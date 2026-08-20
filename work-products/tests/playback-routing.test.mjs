import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";

const directory = await mkdtemp(join(tmpdir(), "uxuv-playback-routing-"));
const output = join(directory, "playback-routing.mjs");

await build({
  entryPoints: [fileURLToPath(new URL("../../lib/media/playback-routing.ts", import.meta.url))],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: output,
});

const { resolvePlaybackSources } = await import(`${pathToFileURL(output).href}?v=${Date.now()}`);
test.after(() => rm(directory, { recursive: true, force: true }));

const target = "https://media.example/video.m3u8?token=fixture";
const protectedSrc = `/api/proxy?url=${encodeURIComponent(target)}`;

test("retry starts on the Worker route and exposes one direct fallback", () => {
  assert.deepEqual(resolvePlaybackSources(target, protectedSrc, "retry"), {
    primarySrc: protectedSrc,
    fallbackSrc: target,
  });
});

test("none starts directly while always stays protected", () => {
  assert.deepEqual(resolvePlaybackSources(target, protectedSrc, "none"), {
    primarySrc: target,
    fallbackSrc: null,
  });
  assert.deepEqual(resolvePlaybackSources(target, protectedSrc, "always"), {
    primarySrc: protectedSrc,
    fallbackSrc: null,
  });
});

test("unsafe targets never enter the browser-direct path", () => {
  for (const unsafe of ["javascript:alert(1)", "data:text/plain,video", "https://user:pass@media.example/video.m3u8"]) {
    assert.deepEqual(resolvePlaybackSources(unsafe, protectedSrc, "none"), {
      primarySrc: protectedSrc,
      fallbackSrc: null,
    });
    assert.deepEqual(resolvePlaybackSources(unsafe, protectedSrc, "retry"), {
      primarySrc: protectedSrc,
      fallbackSrc: null,
    });
  }
});
