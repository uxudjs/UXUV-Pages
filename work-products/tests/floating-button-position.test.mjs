import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

const source = await readFile(new URL("../../lib/utils/floating-button-position.ts", import.meta.url), "utf8");
const javascript = transpileModule(source, {
  compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
}).outputText;
const position = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

const buttonSize = 56;
const margin = 16;

test("keeps default floating buttons centered and attached to their viewport edge", () => {
  assert.deepEqual(
    position.getDefaultFloatingButtonPosition({ width: 1024, height: 900 }, "left", 0.5, buttonSize, margin),
    { x: 16, y: 422 },
  );
  assert.deepEqual(
    position.getDefaultFloatingButtonPosition({ width: 1440, height: 900 }, "right", 0.5, buttonSize, margin),
    { x: 1368, y: 422 },
  );
});

test("preserves a dragged position within the available area after resize", () => {
  const ratios = position.getFloatingButtonRatios(
    { x: 1208, y: 332 },
    { width: 1280, height: 720 },
    buttonSize,
    margin,
  );
  assert.deepEqual(ratios, { xRatio: 1, yRatio: 0.5 });
  assert.deepEqual(
    position.getPositionFromFloatingButtonRatios(ratios, { width: 1920, height: 900 }, buttonSize, margin),
    { x: 1848, y: 422 },
  );
});
