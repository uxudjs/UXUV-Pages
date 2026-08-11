import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROUTES = {
  "/": "index.html",
  "/favorites": "favorites/index.html",
  "/iptv": "iptv/index.html",
  "/player": "player/index.html",
  "/premium": "premium/index.html",
  "/premium/favorites": "premium/favorites/index.html",
  "/premium/settings": "premium/settings/index.html",
  "/settings": "settings/index.html",
};

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const FORBIDDEN = /\b(?:ADMIN_PASSWORD|AUTH_SECRET|CF_API_TOKEN)\b|set-cookie\s*:/i;
const slash = (path) => path.replaceAll("\\", "/");

function files(root, directory = root) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    if (lstatSync(absolute).isSymbolicLink()) throw new Error(`Release source contains symlink: ${entry.name}`);
    return entry.isDirectory() ? files(root, absolute) : [slash(relative(root, absolute))];
  }).sort();
}

function contentType(path) {
  if (path === "LICENSE") return "text/plain; charset=utf-8";
  const type = MIME[extname(path).toLowerCase()];
  if (!type) throw new Error(`Unsupported MIME type for ${path}`);
  return type;
}

function validateIdentity(manifest) {
  if (!VERSION.test(manifest.pagesVersion)) throw new Error("Release requires a semantic version");
  if (!Number.isInteger(manifest.apiContract) || manifest.apiContract < 1) throw new Error("Invalid API contract");
  if (!/^>=\d+\.\d+\.\d+ <\d+\.\d+\.\d+$/.test(manifest.workerRange)) throw new Error("Invalid Worker range");
}

export function validateReleaseManifest(manifest, releaseDir) {
  validateIdentity(manifest);
  if (manifest.schemaVersion !== 1) throw new Error("Invalid release manifest schema");
  if (JSON.stringify(manifest.routes) !== JSON.stringify(ROUTES)) throw new Error("Static route manifest mismatch");
  if (!manifest.assets || Array.isArray(manifest.assets) || typeof manifest.assets !== "object") {
    throw new Error("Invalid release manifest assets");
  }

  const listed = Object.values(manifest.assets).map((asset) => asset.path).sort();
  const actual = files(releaseDir).filter((path) => path !== "release-manifest.json");
  if (JSON.stringify(listed) !== JSON.stringify(actual)) throw new Error("Manifest has a missing asset or unlisted resource");

  for (const [urlPath, asset] of Object.entries(manifest.assets)) {
    if (urlPath !== `/${asset.path}` || asset.path.includes("..") || resolve(releaseDir, asset.path) === resolve(releaseDir)) {
      throw new Error(`Unsafe asset path: ${asset.path}`);
    }
    const absolute = resolve(releaseDir, asset.path);
    if (!absolute.startsWith(`${resolve(releaseDir)}${sep}`) || !existsSync(absolute)) throw new Error(`Manifest references missing asset: ${asset.path}`);
    if (asset.contentType !== contentType(asset.path)) throw new Error(`MIME mismatch for ${asset.path}`);
    if (asset.contentType.includes("charset") && FORBIDDEN.test(readFileSync(absolute, "utf8"))) throw new Error(`Sensitive content in ${asset.path}`);
  }

  for (const path of Object.values(ROUTES)) {
    if (!manifest.assets[`/${path}`]) throw new Error(`Route is missing HTML asset: ${path}`);
  }
  return true;
}

function sameTree(left, right) {
  const leftFiles = files(left);
  const rightFiles = files(right);
  return JSON.stringify(leftFiles) === JSON.stringify(rightFiles)
    && leftFiles.every((path) => readFileSync(join(left, path)).equals(readFileSync(join(right, path))));
}

function replaceCurrent(staging, target, backup) {
  if (!existsSync(target)) {
    renameSync(staging, target);
    return;
  }

  renameSync(target, backup);
  try {
    renameSync(staging, target);
    rmSync(backup, { force: true, recursive: true });
  } catch (error) {
    if (!existsSync(target) && existsSync(backup)) renameSync(backup, target);
    throw error;
  }
}

export function buildRelease({ sourceDir, releaseRoot, licensePath, version, apiContract, workerRange }) {
  validateIdentity({ pagesVersion: version, apiContract, workerRange });
  if (!existsSync(sourceDir) || !existsSync(licensePath)) throw new Error("Release source and LICENSE are required");
  mkdirSync(releaseRoot, { recursive: true });
  const suffix = `${process.pid}-${randomUUID()}`;
  const staging = join(releaseRoot, `.tmp-current-${suffix}`);
  const target = join(releaseRoot, "current");
  const backup = join(releaseRoot, `.previous-current-${suffix}`);
  mkdirSync(staging, { recursive: true });

  try {
    for (const path of files(sourceDir)) {
      const destination = join(staging, path);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(join(sourceDir, path), destination);
    }
    copyFileSync(licensePath, join(staging, "LICENSE"));
    const assets = Object.fromEntries(files(staging).map((path) => [
      `/${path}`,
      { path, contentType: contentType(path) },
    ]));
    const manifest = {
      schemaVersion: 1,
      pagesVersion: version,
      apiContract,
      workerRange,
      routes: ROUTES,
      assets,
    };
    validateReleaseManifest(manifest, staging);
    const manifestPath = join(staging, "release-manifest.json");
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    if (existsSync(target) && sameTree(staging, target)) {
      return { releaseDir: target, manifestPath: join(target, "release-manifest.json"), unchanged: true };
    }
    replaceCurrent(staging, target, backup);
    return { releaseDir: target, manifestPath: join(target, "release-manifest.json"), unchanged: false };
  } finally {
    if (existsSync(staging)) rmSync(staging, { force: true, recursive: true });
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const result = buildRelease({
    sourceDir: join(root, "out"),
    releaseRoot: join(root, "release"),
    licensePath: join(root, "LICENSE"),
    version: packageJson.version,
    apiContract: 1,
    workerRange: ">=1.0.0 <2.0.0",
  });
  console.log(`${result.unchanged ? "Verified" : "Updated"} current Pages release at ${relative(root, result.releaseDir)}`);
}
