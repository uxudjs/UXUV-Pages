import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");

const routes = new Map([
  ["/", "app/page.tsx"],
  ["/favorites", "app/favorites/page.tsx"],
  ["/player", "app/player/page.tsx"],
  ["/premium", "app/premium/page.tsx"],
  ["/premium/favorites", "app/premium/favorites/page.tsx"],
  ["/premium/settings", "app/premium/settings/page.tsx"],
  ["/settings", "app/settings/page.tsx"],
]);

function sourceFiles(directory) {
  const absolute = join(root, directory);
  if (!existsSync(absolute)) return [];

  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const path = join(absolute, entry.name);
    if (entry.isDirectory()) return sourceFiles(relative(root, path));
    return [".ts", ".tsx", ".js", ".jsx", ".mjs"].includes(extname(path)) ? [path] : [];
  });
}

test("defines a reproducible Next.js static-export toolchain", () => {
  const packageJson = JSON.parse(read("package.json"));
  const nextConfig = read("next.config.ts");

  assert.equal(packageJson.private, true);
  assert.match(packageJson.scripts.test, /work-products\/tests\/static-export-contract\.test\.mjs/);
  assert.match(packageJson.scripts.test, /work-products\/tests\/release-manifest\.test\.mjs/);
  assert.match(packageJson.scripts.test, /work-products\/tests\/pages-deployment\.test\.mjs/);
  assert.equal(packageJson.scripts["release:build"], "node scripts/build-release.mjs");
  assert.equal(packageJson.scripts.lint, "eslint");
  assert.equal(packageJson.scripts.build, "next build && node scripts/transpile-client-assets.mjs out/_next/static");
  assert.equal(packageJson.dependencies.next, "16.3.0");
  assert.match(nextConfig, /output:\s*["']export["']/);
  assert.match(nextConfig, /unoptimized:\s*true/);
});

test("pins only the KVideo browser dependencies needed by later UI slices", () => {
  const packageJson = JSON.parse(read("package.json"));
  const packageLock = JSON.parse(read("package-lock.json"));
  const expectedDependencies = {
    "@dnd-kit/core": "6.3.1",
    "@dnd-kit/sortable": "10.0.0",
    "@dnd-kit/utilities": "3.2.2",
    "lucide-react": "0.577.0",
    "opencc-js": "1.0.5",
    "zustand": "5.0.12",
  };

  for (const [name, version] of Object.entries(expectedDependencies)) {
    assert.equal(packageJson.dependencies[name], version, `${name} must be pinned in package.json`);
    assert.equal(packageLock.packages[""].dependencies[name], version, `${name} must be pinned in package-lock.json`);
    assert.equal(packageLock.packages[`node_modules/${name}`].version, version, `${name} lock entry drifted`);
  }
  assert.equal(packageJson.devDependencies.esbuild, "0.28.2");
  assert.equal(packageLock.packages[""].devDependencies.esbuild, "0.28.2");
  assert.equal(packageLock.packages["node_modules/esbuild"].version, "0.28.2");
  for (const forbidden of ["@upstash/redis", "@vercel/analytics"]) {
    assert.equal(packageJson.dependencies[forbidden], undefined, `${forbidden} is server or deployment specific`);
    assert.equal(packageJson.devDependencies[forbidden], undefined, `${forbidden} is server or deployment specific`);
  }

  assert.match(packageJson.scripts.test, /work-products\/tests\/kvideo-webview-compatibility\.test\.mjs/);
  assert.ok(existsSync(join(root, "scripts/transpile-client-assets.mjs")));
});

test("declares eight deterministic static page entries", () => {
  for (const [route, path] of routes) {
    assert.ok(existsSync(join(root, path)), `${route} must be declared by ${path}`);
  }
});

test("keeps the Pages source public-only and browser-only", () => {
  assert.equal(existsSync(join(root, "app/api")), false);
  assert.equal(existsSync(join(root, "lib/server")), false);

  const source = sourceFiles("app").concat(sourceFiles("components"), sourceFiles("lib"));
  const combined = source.map((path) => readFileSync(path, "utf8")).join("\n");

  assert.doesNotMatch(combined, /(?:from|require\()\s*["'](?:node:)?fs["']/);
  assert.doesNotMatch(combined, /server-only|@vercel\/analytics/);
  assert.doesNotMatch(combined, /ADMIN_PASSWORD|AUTH_SECRET|CF_API_TOKEN/);
  assert.match(combined, /isDirectPagesHost/);
  assert.match(combined, /请从你的 UXUVideo Worker 域名访问/);
});
