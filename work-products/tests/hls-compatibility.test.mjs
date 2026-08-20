import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

async function loadCompatibility() {
  const source = readFileSync(new URL("../../lib/player/hls-compatibility.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

test("S21-T08 selects a non-HEVC HLS level and fails closed for unsupported HEVC-only manifests", async () => {
  const policy = await loadCompatibility();
  assert.deepEqual(policy.selectCompatibleHlsLevel([
    { videoCodec: "hvc1.1.6.L120" }, { videoCodec: "avc1.640028" },
  ], false), { level: 1, incompatible: false });
  assert.deepEqual(policy.selectCompatibleHlsLevel([{ videoCodec: "hev1.1.6.L120" }], false),
    { level: null, incompatible: true });
  assert.deepEqual(policy.selectCompatibleHlsLevel([{ videoCodec: "hev1.1.6.L120" }], true),
    { level: 0, incompatible: false });
  assert.deepEqual(policy.selectCompatibleHlsLevel([{ videoCodec: null }], false),
    { level: 0, incompatible: false });
});

test("S21-T08 detects HEVC support through both standardized MP4 codec labels", async () => {
  const { supportsHevcPlayback } = await loadCompatibility();
  assert.equal(supportsHevcPlayback({ canPlayType: (value) => value.includes("hvc1") ? "probably" : "" }), true);
  assert.equal(supportsHevcPlayback({ canPlayType: (value) => value.includes("hev1") ? "maybe" : "" }), true);
  assert.equal(supportsHevcPlayback({ canPlayType: () => "" }), false);
});
