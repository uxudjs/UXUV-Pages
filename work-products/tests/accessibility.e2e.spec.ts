import { expect, test, type Page, type Route } from "@playwright/test";
import axe from "axe-core";

const session = {
  accountId: "admin-1", profileId: "admin-1", username: "admin", name: "Administrator",
  role: "super_admin", customPermissions: [], mode: "managed",
};
const config = {
  release: { worker: "1.0.0", pages: "0.2.0", apiContract: 1 },
  site: { name: "UXUVideo", title: "UXUVideo", description: "Private video", iconUrl: "/icon.png" },
  capabilities: { premium: true, iptv: true, danmaku: false },
  adKeywords: [],
  thirdPartyScripts: { videoTogether: { enabled: false, scriptUrl: null, settingUrl: null } },
  authenticated: true,
};
const emptyDocument = (kind: "config" | "library") => ({
  kind, version: 0, updatedAt: null,
  payload: kind === "config"
    ? { fields: {}, sources: [], subscriptions: [], tombstones: [] }
    : { history: [], favorites: [], tombstones: [] },
});
const routes = [
  "./", "./favorites/", "./iptv/", "./player/", "./premium/",
  "./premium/favorites/", "./premium/settings/", "./settings/",
];
const widths = [320, 768, 1024, 1440];

async function fulfill(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockWorker(page: Page) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/config") return fulfill(route, config);
    if (path === "/api/auth/session") return fulfill(route, { authenticated: true, session });
    if (path === "/api/user/config") return fulfill(route, emptyDocument("config"));
    if (path === "/api/user/sync") return fulfill(route, emptyDocument("library"));
    if (path === "/api/app-update") return fulfill(route, { currentVersion: "1.0.0", latestVersion: "1.0.0", status: "up-to-date", checkedRemotely: true });
    if (path === "/api/premium/types") return fulfill(route, { tags: [], capability: { profile: "paid", limits: {} } });
    if (path === "/api/douban/tags") return fulfill(route, { tags: ["热门"] });
    if (path === "/api/douban/recommend") return fulfill(route, { subjects: [] });
    if (path === "/api/auth/accounts") {
      return fulfill(route, { loginMode: "managed", managed: true, accounts: [{ id: "admin-1", ...session }], totalCount: 1 });
    }
    if (path === "/api/admin/usage") {
      return fulfill(route, { data: { configured: false, missing: ["CF_ANALYTICS_API_TOKEN"], message: "Cloudflare usage analytics is not configured." } });
    }
    return fulfill(route, { error: { code: "NOT_FOUND" } }, 404);
  });
}

test("all eight static entries keep the AA, viewport, console, and same-origin network gates", async ({ page }) => {
  await mockWorker(page);
  const consoleErrors: string[] = [];
  const failedResponses: string[] = [];
  const network: Array<{ url: string; method: string; headers: Record<string, string>; body: string | null }> = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("response", (response) => { if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`); });
  page.on("request", (request) => network.push({
    url: request.url(), method: request.method(), headers: request.headers(), body: request.postData(),
  }));

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of routes) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      await page.addScriptTag({ content: axe.source });
      const violations = await page.evaluate(async () => {
        const axeApi = (window as unknown as { axe: { run: (root: Document, options: unknown) => Promise<{ violations: Array<{ id: string; impact: string | null }> }> } }).axe;
        const result = await axeApi.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
        return result.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
      });
      expect(violations, `${path} at ${width}px`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${path} at ${width}px`).toBe(true);
    }
  }

  expect(consoleErrors, failedResponses.join("\n")).toEqual([]);
  expect(failedResponses).toEqual([]);
  for (const request of network) {
    const url = new URL(request.url);
    expect(["127.0.0.1", "localhost"]).toContain(url.hostname);
    expect(request.url).not.toMatch(/password|token|cookie|authorization/i);
    expect(JSON.stringify(request.headers)).not.toMatch(/admin-password|analytics-token/i);
    expect(request.body ?? "").not.toMatch(/admin-password|analytics-token/i);
  }
});

test("service worker replaces old static caches and bypasses API and media", async ({ page }) => {
  await mockWorker(page);
  await page.goto("./");
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    await registration.unregister();
    await caches.open("uxuv-static-0.1.0");
  });
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes("uxuv-static-0.1.0"))).toBe(false);

  await page.route("**/media-test.mp4", (route) => route.fulfill({ status: 200, contentType: "video/mp4", body: "fixture" }));
  await page.evaluate(async () => {
    await fetch("/api/config", { credentials: "same-origin" });
    await fetch("/icon.png");
    await fetch("/media-test.mp4");
  });

  const cachedUrls = await page.evaluate(async () => {
    const names = await caches.keys();
    const requests = await Promise.all(names.map(async (name) => (await caches.open(name)).keys()));
    return requests.flat().map(({ url }) => url);
  });
  expect(cachedUrls.some((url) => new URL(url).pathname === "/icon.png")).toBe(true);
  expect(cachedUrls.some((url) => new URL(url).pathname.startsWith("/api/"))).toBe(false);
  expect(cachedUrls.some((url) => /media-test\.mp4$/.test(new URL(url).pathname))).toBe(false);
});
