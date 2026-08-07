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
  ["/iptv", "app/iptv/page.tsx"],
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
  assert.equal(packageJson.scripts["release:build"], "node scripts/build-release.mjs");
  assert.equal(packageJson.scripts.lint, "eslint");
  assert.equal(packageJson.scripts.build, "next build");
  assert.equal(packageJson.dependencies.next, "16.2.12");
  assert.match(nextConfig, /output:\s*["']export["']/);
  assert.match(nextConfig, /unoptimized:\s*true/);
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
  assert.doesNotMatch(combined, /type=["']password["']|<form\b/i);
  assert.match(combined, /请从你的 UXUVideo Worker 域名访问/);
});
