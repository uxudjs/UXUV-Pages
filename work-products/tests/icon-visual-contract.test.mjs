import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => readFileSync(join(root, path));

test("T63 keeps the default icon a 1024 square PNG with the fixed U/V render contract", () => {
  const png = read("public/icon.png");
  const render = read("work-products/tests/render-icon-review.mjs").toString("utf8");
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 1024);
  assert.equal(png.readUInt32BE(20), 1024);
  for (const color of ["#0F172A", "#60A5FA", "#94A3B8"]) assert.match(render, new RegExp(color, "i"));
  assert.match(render, /aria-label="UXUVideo U V icon"/);
  assert.doesNotMatch(render, /gradient|filter=|shadow|\.ico/i);
});

test("T63 produces six scale and two mask review fixtures without changing runtime icon priority", () => {
  const fixtureRoot = "work-products/tests/fixtures/icon-review";
  for (const size of [16, 32, 48, 192, 512, 1024]) assert.equal(existsSync(join(root, fixtureRoot, `icon-${size}.png`)), true);
  for (const mask of ["circle", "rounded-square"]) assert.equal(existsSync(join(root, fixtureRoot, `mask-${mask}.png`)), true);
  assert.equal(existsSync(join(root, fixtureRoot, "icon-review-sheet.png")), true);
  assert.match(read("components/ContentNavigation.tsx").toString("utf8"), /runtime\.config\.site\.iconUrl/);
  assert.match(read("components/player/PlayerNavbar.tsx").toString("utf8"), /runtime\.config\.site\.iconUrl/);
  assert.match(read("components/SiteIconProvider.tsx").toString("utf8"), /runtime\.config\.site\.iconUrl/);
});
