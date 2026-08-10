import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";
import { runInNewContext } from "node:vm";
import { buildRelease } from "../../scripts/build-release.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const workRoot = join(root, "work-products/tests/work/pwa-release");
const read = (path) => readFileSync(join(root, path), "utf8");

after(() => rmSync(workRoot, { force: true, recursive: true }));

test("declares a same-origin installable manifest and root service-worker registration", () => {
  assert.equal(existsSync(join(root, "public/manifest.json")), true);
  assert.equal(existsSync(join(root, "public/sw.js")), true);
  assert.equal(existsSync(join(root, "components/ServiceWorkerRegister.tsx")), true);

  const manifest = JSON.parse(read("public/manifest.json"));
  assert.equal(manifest.name, "UXUVideo");
  assert.equal(manifest.short_name, "UXUVideo");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.orientation, "any");
  assert.ok(manifest.icons.some(({ src, purpose }) => src === "/icon.png" && /maskable/.test(purpose)));

  const layout = read("app/layout.tsx");
  const register = read("components/ServiceWorkerRegister.tsx");
  assert.match(layout, /manifest:\s*["']\/manifest\.json["']/);
  assert.match(layout, /<ServiceWorkerRegister\s*\/>/);
  assert.match(register, /isDirectPagesHost/);
  assert.match(register, /navigator\.serviceWorker\.register\(["']\/sw\.js["']/);
  assert.match(register, /scope:\s*["']\/["']/);
});

test("service worker versions static caches and rejects API, auth, and media caching", () => {
  const source = read("public/sw.js");
  assert.match(source, /uxuv-static-0\.2\.0/);
  assert.match(source, /cacheName\.startsWith\(CACHE_PREFIX\).*cacheName !== CACHE_NAME/s);
  assert.match(source, /request\.method !== ["']GET["']/);
  assert.match(source, /url\.origin !== self\.location\.origin/);
  assert.match(source, /url\.pathname\.startsWith\(["']\/api\/["']\)/);
  assert.match(source, /audio|video/);
  assert.match(source, /m3u8|mp4|webm|ts/);
  assert.match(source, /Cache-Control.*no-store/is);
  assert.doesNotMatch(source, /Authorization|Cookie|\/api\/auth/);
});

test("service worker refreshes navigations before using an offline cached page", async () => {
  const listeners = new Map();
  const cached = new Response("old page", { headers: { "Cache-Control": "no-cache" } });
  const fresh = new Response("new page", { headers: { "Cache-Control": "no-cache" } });
  let networkRequests = 0;
  let responsePromise;
  const cache = {
    match: async () => cached,
    put: async () => {},
  };
  runInNewContext(read("public/sw.js"), {
    URL,
    Set,
    Promise,
    self: {
      location: { origin: "https://worker.example" },
      addEventListener: (name, listener) => listeners.set(name, listener),
      skipWaiting: () => {},
      clients: { claim: () => {} },
    },
    caches: {
      keys: async () => [],
      delete: async () => true,
      open: async () => cache,
    },
    fetch: async () => {
      networkRequests += 1;
      return fresh;
    },
  });

  listeners.get("fetch")({
    request: {
      method: "GET",
      url: "https://worker.example/",
      mode: "navigate",
      destination: "document",
    },
    respondWith: (promise) => { responsePromise = promise; },
  });

  const response = await responsePromise;
  assert.equal(networkRequests, 1);
  assert.equal(await response.text(), "new page");
});

test("service worker keeps successful network responses usable when cache writes fail", async () => {
  const listeners = new Map();
  const fresh = new Response("fresh asset", { headers: { "Cache-Control": "public, max-age=31536000, immutable" } });
  let responsePromise;
  const cache = {
    match: async () => undefined,
    put: async () => { throw new Error("quota exceeded"); },
  };
  runInNewContext(read("public/sw.js"), {
    URL,
    Set,
    Promise,
    self: {
      location: { origin: "https://worker.example" },
      addEventListener: (name, listener) => listeners.set(name, listener),
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    caches: {
      keys: async () => [],
      delete: async () => true,
      open: async () => cache,
    },
    fetch: async () => fresh,
  });

  listeners.get("fetch")({
    request: {
      method: "GET",
      url: "https://worker.example/icon.png",
      mode: "same-origin",
      destination: "image",
    },
    respondWith: (promise) => { responsePromise = promise; },
  });

  const response = await responsePromise;
  assert.equal(await response.text(), "fresh asset");
});

test("service worker extends installation until skipWaiting completes", async () => {
  const listeners = new Map();
  let releaseSkipWaiting;
  const skipWaiting = new Promise((resolve) => { releaseSkipWaiting = resolve; });
  let installWork;
  runInNewContext(read("public/sw.js"), {
    URL,
    Set,
    Promise,
    self: {
      location: { origin: "https://worker.example" },
      addEventListener: (name, listener) => listeners.set(name, listener),
      skipWaiting: () => skipWaiting,
      clients: { claim: async () => {} },
    },
    caches: {
      keys: async () => [],
      delete: async () => true,
      open: async () => ({ match: async () => undefined, put: async () => {} }),
    },
    fetch: async () => new Response("fixture"),
  });

  listeners.get("install")({ waitUntil: (promise) => { installWork = promise; } });
  assert.ok(installWork instanceof Promise);
  releaseSkipWaiting();
  await installWork;
});

test("production export contains the PWA assets", () => {
  assert.equal(existsSync(join(root, "out/manifest.json")), true);
  assert.equal(existsSync(join(root, "out/sw.js")), true);
  assert.equal(existsSync(join(root, "out/icon.png")), true);
});

test("production export recalculates a complete eight-route PWA release manifest", () => {
  rmSync(workRoot, { force: true, recursive: true });
  const result = buildRelease({
    sourceDir: join(root, "out"),
    releaseRoot: workRoot,
    licensePath: join(root, "LICENSE"),
    version: "0.1.2",
    gitCommit: "a".repeat(40),
    apiContract: 1,
    workerRange: ">=1.0.0 <2.0.0",
  });
  const manifest = JSON.parse(readFileSync(result.manifestPath, "utf8"));

  assert.equal(Object.keys(manifest.routes).length, 8);
  for (const asset of ["/manifest.json", "/sw.js", "/icon.png"]) {
    assert.ok(manifest.assets[asset], `${asset} is missing from the release manifest`);
  }
});
