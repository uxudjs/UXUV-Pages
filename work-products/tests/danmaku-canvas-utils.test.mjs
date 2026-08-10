import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

const sourceUrl = new URL("../../lib/player/danmaku-canvas-utils.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const javascript = transpileModule(source, {
  compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
}).outputText;
const canvas = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

test("canvas metrics use CSS dimensions and normalize DPR", () => {
  assert.deepEqual(canvas.resolveDanmakuCanvasMetrics({
    computedWidth: 640,
    computedHeight: 360,
    clientWidth: 600,
    clientHeight: 320,
    devicePixelRatio: 2,
  }), { width: 640, height: 360, dpr: 2, bitmapWidth: 1280, bitmapHeight: 720 });

  assert.equal(canvas.resolveDanmakuCanvasMetrics({ computedWidth: 0, computedHeight: 360 }), null);
  assert.equal(canvas.haveDanmakuCanvasMetricsChanged(null, {
    width: 640, height: 360, dpr: 1, bitmapWidth: 640, bitmapHeight: 360,
  }), true);
});

test("canvas coordinates scale and remain inside the configured display area", () => {
  assert.equal(canvas.scaleDanmakuCoordinate(120, 600, 300), 60);
  assert.equal(canvas.clampDanmakuY(-10, 20, 180), 20);
  assert.equal(canvas.clampDanmakuY(300, 20, 180), 172);
  assert.equal(canvas.resolveDanmakuLaneCount(360, 20, 0.5), 6);
  assert.equal(canvas.resolveDanmakuLaneCount(4000, 14, 1), canvas.MAX_DANMAKU_LANES);
});

