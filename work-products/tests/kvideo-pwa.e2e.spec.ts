import { expect, test, type BrowserContext, type Route } from "@playwright/test";

const runtime = {
  release: { worker: "1.0.0", pages: "0.1.2", apiContract: 1 },
  site: { name: "UXUVideo", title: "UXUVideo", description: "Private", iconUrl: "/icon.png" },
  capabilities: { premium: true, iptv: false, danmaku: false },
  adKeywords: [],
  sources: { subscriptionSources: "", iptvSources: "", mergeSources: false, danmakuApiUrl: "" },
  thirdPartyScripts: { videoTogether: { enabled: false, scriptUrl: null, settingUrl: null } },
  authenticated: true,
};

const session = {
  accountId: "pwa-viewer", profileId: "pwa-viewer", username: "pwa-viewer", name: "PWA Viewer",
  role: "viewer", customPermissions: [], mode: "managed",
};

const syncedDocument = (kind: "config" | "library") => ({
  kind,
  version: 1,
  updatedAt: 1,
  payload: kind === "config"
    ? { fields: {}, subscriptions: [], tombstones: [], sources: [] }
    : { favorites: [], history: [], tombstones: [] },
});

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockWorker(context: BrowserContext) {
  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/config") return json(route, runtime);
    if (url.pathname === "/api/auth/session") return json(route, { authenticated: true, session });
    if (url.pathname === "/api/user/config") return json(route, syncedDocument("config"));
    if (url.pathname === "/api/user/sync") return json(route, syncedDocument("library"));
    if (url.pathname === "/api/douban/tags") return json(route, { tags: ["热门"] });
    if (url.pathname === "/api/douban/recommend") return json(route, { subjects: [], hasMore: false });
    return json(route, { error: { code: "NOT_FOUND" } }, 404);
  });
}

test.describe("KVideo T31 PWA", () => {
  test.use({ locale: "zh-CN", timezoneId: "Asia/Taipei", colorScheme: "dark", viewport: { width: 1440, height: 900 } });

  test("is browser-installable and preserves the approved shell in standalone mode", async ({ page }, testInfo) => {
    await mockWorker(page.context());
    await page.addInitScript(() => {
      const nativeMatchMedia = window.matchMedia.bind(window);
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: (query: string) => query === "(display-mode: standalone)"
          ? {
            matches: true, media: query, onchange: null,
            addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
            dispatchEvent: () => true,
          }
          : nativeMatchMedia(query),
      });
      Object.defineProperty(navigator, "standalone", { configurable: true, get: () => true });
    });
    await page.goto("./");
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));

    const devtools = await page.context().newCDPSession(page);
    const appManifest = await devtools.send("Page.getAppManifest");
    const manifest = JSON.parse(appManifest.data ?? "{}");
    expect(manifest).toMatchObject({ start_url: "/", scope: "/", display: "standalone", orientation: "any" });
    const installability = await devtools.send("Page.getInstallabilityErrors");
    expect(installability.installabilityErrors.map(({ errorId }) => errorId)).toEqual(["in-incognito"]);

    const scenarios = [
      { width: 320, locale: "zh-CN", nav: "主导航" },
      { width: 768, locale: "zh-TW", nav: "主導覽" },
      { width: 1024, locale: "en", nav: "Primary navigation" },
      { width: 1440, locale: "zh-CN", nav: "主导航" },
    ];
    for (const scenario of scenarios) {
      await page.setViewportSize({ width: scenario.width, height: 900 });
      await page.getByLabel(/^(语言|語言|Language)$/).selectOption(scenario.locale);
      await expect(page.getByRole("navigation", { name: scenario.nav })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const brand = page.locator(".content-brand");
      await brand.focus();
      await page.keyboard.press("Tab");
      await expect(page.locator(":focus")).toHaveAttribute("data-focusable", "true");
      await page.screenshot({ path: testInfo.outputPath(`pwa-standalone-${scenario.width}.png`), animations: "disabled" });
    }
  });

  test("upgrades static caches, excludes protected requests, and refreshes from the offline shell", async ({ page, context }) => {
    await mockWorker(context);
    await page.route("**/media-test.mp4", (route) => route.fulfill({ status: 200, contentType: "video/mp4", body: "fixture" }));
    await page.goto("./settings/");
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      await registration.unregister();
      await caches.open("uxuv-static-0.1.1");
      await caches.open("unrelated-cache");
    });
    await page.reload();
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes("uxuv-static-0.1.1"))).toBe(false);
    expect(await page.evaluate(async () => (await caches.keys()).includes("unrelated-cache"))).toBe(true);
    await page.reload();

    await page.evaluate(async () => {
      await fetch("/api/config", { credentials: "same-origin" });
      await fetch("/icon.png");
      await fetch("/media-test.mp4");
    });
    const cachedPaths = await page.evaluate(async () => {
      const names = await caches.keys();
      const requests = await Promise.all(names.map(async (name) => (await caches.open(name)).keys()));
      return requests.flat().map(({ url }) => new URL(url).pathname);
    });
    expect(cachedPaths).toContain("/UXUV-Pages/settings/");
    expect(cachedPaths).toContain("/icon.png");
    expect(cachedPaths.some((path) => path.startsWith("/api/"))).toBe(false);
    expect(cachedPaths.some((path) => path.endsWith("media-test.mp4"))).toBe(false);

    await context.setOffline(true);
    const response = await page.reload({ waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.locator("body")).toContainText("设置");
    await context.setOffline(false);
  });
});
