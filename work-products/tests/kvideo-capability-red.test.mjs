import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const fixtureRoot = fileURLToPath(new URL("./fixtures/kvideo-4.9.19/", import.meta.url));
const matrixPath = fileURLToPath(new URL("../../../UXUVideo/work-products/kvideo-parity-matrix.md", import.meta.url));
const observationPath = fileURLToPath(new URL("./fixtures/uxuv-pages-0.1.2/observed-dom.json", import.meta.url));
const observed = JSON.parse(readFileSync(observationPath, "utf8"));

const sha256 = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const ids = readFileSync(matrixPath, "utf8").split(/\r?\n/)
  .map((line) => line.match(/^\|\s*([A-Z][A-Z0-9-]*-[A-Z]?\d{3})\s*\|/)?.[1])
  .filter(Boolean);

function routeForId(id) {
  if (/^(SRC|SET|DAT)-/.test(id)) return "settings";
  if (/^FAV-/.test(id)) return "favorites";
  if (/^IPTV-/.test(id)) return "iptv";
  if (/^PRE-/.test(id)) return "premium";
  if (/^(HIS|PLY-|DAN|ADS|EXT)-/.test(id) || /^PLY-[ACS]/.test(id)) return "player";
  return "home";
}

assert.equal(ids.length, 273, "The frozen matrix must contain exactly 273 capability IDs");
assert.equal(observed.pagesCommit, "4bc847affa76755a5c99ce249d793aa43e0b83bb");

for (const id of ids) {
  test(`RED ${id}`, () => {
    const route = routeForId(id);
    const reference = JSON.parse(readFileSync(`${fixtureRoot}dom/${route}-1024.json`, "utf8"));
    assert.deepEqual(
      { id, route, observedSha256: sha256(observed.routes[route]) },
      { id, route, observedSha256: sha256(reference) },
    );
  });
}
