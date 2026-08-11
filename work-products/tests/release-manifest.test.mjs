import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after, before } from "node:test";
import { buildRelease, validateReleaseManifest } from "../../scripts/build-release.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const workRoot = join(root, "work-products/tests/work/release-manifest");
const version = "1.2.3";
const routes = {
  "/": "index.html",
  "/favorites": "favorites/index.html",
  "/iptv": "iptv/index.html",
  "/player": "player/index.html",
  "/premium": "premium/index.html",
  "/premium/favorites": "premium/favorites/index.html",
  "/premium/settings": "premium/settings/index.html",
  "/settings": "settings/index.html",
};

before(() => {
  rmSync(workRoot, { force: true, recursive: true });
  mkdirSync(workRoot, { recursive: true });
});
after(() => rmSync(workRoot, { force: true, recursive: true }));

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function fixture(name) {
  const base = join(workRoot, name);
  const sourceDir = join(base, "out");
  const releaseRoot = join(base, "release");
  const licensePath = join(base, "LICENSE");
  for (const [route, path] of Object.entries(routes)) write(join(sourceDir, path), `<h1>${route}</h1>`);
  write(join(sourceDir, "_next/static/app.js"), "console.log('public');\n");
  write(join(sourceDir, "_next/static/app.css"), "body { color: black; }\n");
  write(join(sourceDir, "icon.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>\n");
  write(licensePath, "MIT License\n");
  return { sourceDir, releaseRoot, licensePath };
}

function options(paths, overrides = {}) {
  return {
    ...paths,
    version,
    apiContract: 1,
    workerRange: ">=1.0.0 <2.0.0",
    ...overrides,
  };
}

test("builds one current release manifest without commit, SHA, or SRI identity fields", () => {
  const first = fixture("complete-a");
  const second = fixture("complete-b");
  const firstResult = buildRelease(options(first));
  const secondResult = buildRelease(options(second));
  const manifest = JSON.parse(readFileSync(firstResult.manifestPath, "utf8"));

  assert.equal(firstResult.releaseDir, join(first.releaseRoot, "current"));
  assert.deepEqual(manifest.routes, routes);
  assert.equal(manifest.pagesVersion, version);
  assert.equal(manifest.apiContract, 1);
  assert.equal(manifest.workerRange, ">=1.0.0 <2.0.0");
  assert.equal(Object.hasOwn(manifest, "gitCommit"), false);
  assert.ok(manifest.assets["/LICENSE"]);
  assert.equal(Object.keys(manifest.assets).length, 12);

  for (const [urlPath, asset] of Object.entries(manifest.assets)) {
    assert.ok(existsSync(join(firstResult.releaseDir, asset.path)), `${urlPath} is missing`);
    assert.deepEqual(Object.keys(asset).sort(), ["contentType", "path"]);
    assert.notEqual(asset.contentType, "application/octet-stream");
  }

  assert.deepEqual(readFileSync(firstResult.manifestPath), readFileSync(secondResult.manifestPath));
});

test("rejects invalid version, API contract, and Worker range", () => {
  const paths = fixture("identity");
  for (const invalid of ["latest", "main", "1.2", "1.2.3-beta.1"]) {
    assert.throws(() => buildRelease(options(paths, { version: invalid })), /semantic version/);
  }
  assert.throws(() => buildRelease(options(paths, { apiContract: 0 })), /API contract/);
  assert.throws(() => buildRelease(options(paths, { workerRange: "latest" })), /Worker range/);
});

test("manifest validation rejects missing files, MIME drift, unsafe paths, and sensitive text", () => {
  const paths = fixture("validation");
  const result = buildRelease(options(paths));
  const original = JSON.parse(readFileSync(result.manifestPath, "utf8"));
  const assetKey = "/_next/static/app.js";

  const badMime = structuredClone(original);
  badMime.assets[assetKey].contentType = "text/css; charset=utf-8";
  assert.throws(() => validateReleaseManifest(badMime, result.releaseDir), /MIME mismatch/);

  const unsafe = structuredClone(original);
  unsafe.assets[assetKey].path = "../app.js";
  assert.throws(() => validateReleaseManifest(unsafe, result.releaseDir), /unsafe|missing asset/i);

  const missing = structuredClone(original);
  delete missing.assets[assetKey];
  assert.throws(() => validateReleaseManifest(missing, result.releaseDir), /missing asset|unlisted resource/i);

  const sensitive = fixture("sensitive");
  write(join(sensitive.sourceDir, "notice.txt"), "ADMIN_PASSWORD=must-not-ship\n");
  assert.throws(() => buildRelease(options(sensitive)), /sensitive content/i);
});

test("the same version can replace the current release after a content revision", () => {
  const paths = fixture("replace-current");
  const first = buildRelease(options(paths));
  assert.equal(buildRelease(options(paths)).unchanged, true);

  const changed = "console.log('changed');\n";
  write(join(paths.sourceDir, "_next/static/app.js"), changed);
  const second = buildRelease(options(paths));

  assert.equal(second.releaseDir, first.releaseDir);
  assert.equal(second.unchanged, false);
  assert.equal(readFileSync(join(second.releaseDir, "_next/static/app.js"), "utf8"), changed);
});
