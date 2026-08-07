import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after, before } from "node:test";
import { buildRelease, validateReleaseManifest } from "../../scripts/build-release.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const workRoot = join(root, "work-products/tests/work/release-manifest");
const version = "1.2.3";
const gitCommit = "a".repeat(40);
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
    gitCommit,
    apiContract: 1,
    workerRange: ">=1.0.0 <2.0.0",
    ...overrides,
  };
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("base64");
}

test("release manifest is complete, reproducible, and byte-verifiable", () => {
  const first = fixture("complete-a");
  const second = fixture("complete-b");
  const firstResult = buildRelease(options(first));
  const secondResult = buildRelease(options(second));
  const manifest = JSON.parse(readFileSync(firstResult.manifestPath, "utf8"));

  assert.deepEqual(manifest.routes, routes);
  assert.equal(manifest.pagesVersion, version);
  assert.equal(manifest.gitCommit, gitCommit);
  assert.ok(manifest.assets["/LICENSE"]);
  assert.equal(Object.keys(manifest.assets).length, 12);

  for (const [urlPath, asset] of Object.entries(manifest.assets)) {
    const absolute = join(firstResult.releaseDir, asset.path);
    assert.ok(existsSync(absolute), `${urlPath} is missing`);
    assert.equal(asset.sha256, sha256(absolute));
    assert.equal(asset.sri, `sha256-${asset.sha256}`);
    assert.notEqual(asset.contentType, "application/octet-stream");
  }

  assert.deepEqual(readFileSync(firstResult.manifestPath), readFileSync(secondResult.manifestPath));
});

test("release identity rejects mutable versions and non-full commits", () => {
  const paths = fixture("identity");
  for (const invalid of ["latest", "main", "1.2", "1.2.3-beta.1"]) {
    assert.throws(() => buildRelease(options(paths, { version: invalid })), /immutable semantic version/);
  }
  assert.throws(() => buildRelease(options(paths, { gitCommit: "abc1234" })), /40-character commit/);
});

test("manifest validation detects missing files, MIME drift, and hash drift", () => {
  const paths = fixture("tamper");
  const result = buildRelease(options(paths));
  const original = JSON.parse(readFileSync(result.manifestPath, "utf8"));
  const assetKey = "/_next/static/app.js";

  const badMime = structuredClone(original);
  badMime.assets[assetKey].contentType = "text/css; charset=utf-8";
  assert.throws(() => validateReleaseManifest(badMime, result.releaseDir), /MIME mismatch/);

  const badHash = structuredClone(original);
  badHash.assets[assetKey].sha256 = "invalid";
  assert.throws(() => validateReleaseManifest(badHash, result.releaseDir), /SHA-256 mismatch/);

  rmSync(join(result.releaseDir, original.assets[assetKey].path));
  assert.throws(() => validateReleaseManifest(original, result.releaseDir), /missing asset/);
});

test("an immutable version allows identical rebuilds but rejects changed bytes", () => {
  const paths = fixture("overwrite");
  const first = buildRelease(options(paths));
  const before = readFileSync(join(first.releaseDir, "_next/static/app.js"));
  assert.equal(buildRelease(options(paths)).unchanged, true);

  write(join(paths.sourceDir, "_next/static/app.js"), "console.log('changed');\n");
  assert.throws(() => buildRelease(options(paths)), /refusing to overwrite immutable release/i);
  assert.deepEqual(readFileSync(join(first.releaseDir, "_next/static/app.js")), before);
});
