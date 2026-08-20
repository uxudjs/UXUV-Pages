import { expect, test, type Page, type Route } from "@playwright/test";
import axe from "axe-core";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const session = {
  accountId: "admin-1", profileId: "admin-1", username: "admin", name: "Administrator",
  role: "super_admin", customPermissions: [], mode: "managed",
};
const config = {
  release: { worker: "2.0.0", pages: "0.3.0", apiContract: 2 },
  site: { name: "UXUVideo", title: "UXUVideo", description: "Private video", iconUrl: "/icon.png" },
  capabilities: { premium: true, danmaku: false },
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
  "./", "./favorites/", "./player/", "./premium/",
  "./premium/favorites/", "./premium/settings/", "./settings/",
];
const widths = [320, 768, 1024, 1440];
const candidateRoot = fileURLToPath(new URL(
  process.env.UXUV_WRITE_VISUAL_CANDIDATE === "1"
    ? "./fixtures/ui-review/section21-candidate/"
    : "./work/section21-candidate-draft/",
  import.meta.url,
));

test.use({ launchOptions: { args: ["--disable-gpu"] } });

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
    if (path === "/api/app-update") return fulfill(route, { currentVersion: "2.0.0", latestVersion: "2.0.0", status: "up-to-date", checkedRemotely: true });
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

async function expectHomeFloatingControlClear(page: Page, label: string) {
  await expect(page.locator(".favorites-sidebar-toggle")).toBeVisible();
  await expect(page.locator(".kvideo-tag-sort-list .kvideo-sortable-tag").first()).toBeVisible();
  const geometry = await page.evaluate(() => {
    const rectangle = (selector: string) => {
      const bounds = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
      return bounds ? { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom } : null;
    };
    const favorite = rectangle(".favorites-sidebar-toggle");
    const firstTag = rectangle(".kvideo-tag-sort-list .kvideo-sortable-tag");
    const manage = rectangle(".kvideo-tag-controls button");
    const intersects = (first: typeof favorite, second: typeof favorite) => !!first && !!second
      && first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top;
    return {
      firstTagGap: favorite && firstTag ? firstTag.left - favorite.right : null,
      tagOverlap: intersects(favorite, firstTag),
      manageOverlap: intersects(favorite, manage),
    };
  });
  expect(geometry.tagOverlap, `${label}: floating favorite overlaps first tag`).toBe(false);
  expect(geometry.manageOverlap, `${label}: floating favorite overlaps manage control`).toBe(false);
  expect(geometry.firstTagGap, `${label}: missing floating/tag geometry`).not.toBeNull();
  expect(geometry.firstTagGap!).toBeGreaterThanOrEqual(8);
}

test("all seven static entries keep the AA, viewport, console, and same-origin network gates", async ({ page }) => {
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

test("Liquid Glass keeps theme tokens, reduced motion, forced-color focus, and 44px controls", async ({ page }) => {
  await mockWorker(page);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("./");

  const navigation = page.locator(".content-nav-glass");
  await expect(navigation).toBeVisible();
  await expect(page.locator(".theme-switcher button")).toHaveCount(3);
  await expect(page.locator(".theme-switcher")).toHaveAttribute("data-material", "clear");
  expect(await page.locator(".theme-switcher").evaluate((element) => getComputedStyle(element).backdropFilter)).toBe("none");
  const visibleMaterials = page.locator('[data-material="regular"]:visible, [data-material="clear"]:visible');
  expect(await visibleMaterials.count()).toBeGreaterThan(0);
  for (let index = 0; index < 3; index += 1) {
    const choice = page.locator(".theme-switcher button").nth(index);
    await choice.click();
    await expect(choice).toHaveAttribute("aria-pressed", "true");
  }
  const resolvedThemes = await page.evaluate(() => ["light", "dark"].map((theme) => {
    document.documentElement.dataset.theme = theme;
    const style = getComputedStyle(document.body);
    return {
      regular: style.getPropertyValue("--glass-regular-bg").trim(),
      clear: style.getPropertyValue("--glass-clear-bg").trim(),
      border: style.getPropertyValue("--glass-border").trim(),
      hitSize: style.getPropertyValue("--control-hit-size").trim(),
    };
  }));
  expect(resolvedThemes[0].regular).not.toBe(resolvedThemes[1].regular);
  for (const theme of resolvedThemes) {
    expect(theme.clear).not.toBe("");
    expect(theme.border).not.toBe("");
    expect(theme.hitSize).toBe("2.75rem");
  }
  const transitionDurations = await navigation.evaluate((element) => getComputedStyle(element).transitionDuration.split(","));
  expect(transitionDurations.every((duration) => Number.parseFloat(duration) <= 0.01)).toBe(true);
  const selectedTheme = page.locator('.theme-switcher button[aria-pressed="true"]');
  await expect(selectedTheme).toHaveCount(1);
  expect(await selectedTheme.evaluate((element) => getComputedStyle(element).transform)).toBe("none");
  const navigationControls = page.locator(".content-nav-actions button, .content-nav-actions a, .content-nav-actions select");
  const controlBoxes = await navigationControls.evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { width: box.width, height: box.height };
  }));
  expect(controlBoxes.length).toBeGreaterThan(0);
  expect(controlBoxes.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);

  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.reload();
  const forcedNavigation = page.locator(".content-nav-glass");
  await expect(forcedNavigation).toBeVisible();
  expect(await forcedNavigation.evaluate((element) => getComputedStyle(element).backdropFilter)).toBe("none");
  expect(await forcedNavigation.evaluate((element) => getComputedStyle(element).getPropertyValue("--glass-regular-bg").trim())).toBe("Canvas");
  const settingsLink = page.locator(".nav-user");
  const box = await settingsLink.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await settingsLink.focus();
  expect(await settingsLink.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
});

test.describe("Section 21 route candidates", () => {
  test.use({ serviceWorkers: "block" });

test("writes isolated Section 21 route candidates without replacing approved baselines", async ({ page }) => {
  test.setTimeout(120_000);
  await mockWorker(page);
  await mkdir(candidateRoot, { recursive: true });
  const candidateRoutes = [
    { name: "home", path: "./" },
    { name: "favorites", path: "./favorites/" },
    { name: "premium", path: "./premium/" },
    { name: "premium-favorites", path: "./premium/favorites/" },
    { name: "premium-settings", path: "./premium/settings/" },
    { name: "settings", path: "./settings/" },
    { name: "not-found", path: "./section21-not-found/" },
  ];
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });

  await page.goto("./");
  for (const locale of ["zh-CN", "zh-TW", "en"] as const) {
    await page.evaluate((value) => localStorage.setItem("uxuv-locale:admin-1", value), locale);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of candidateRoutes) {
        const response = await page.goto(route.path);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        if (route.name === "not-found") {
          expect(response?.status()).toBe(404);
          await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
        } else await expect(page.locator("main")).toBeVisible();
        await expect(page.locator(".app-update-trigger")).toContainText("2.0.0");
        await page.addStyleTag({ content: ".sync-status{display:none!important}" });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (route.name === "home") await expectHomeFloatingControlClear(page, `${locale}/${width}`);
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all([...document.images].map((image) => image.decode().catch(() => undefined)));
          window.scrollTo(0, 0);
          (document.activeElement as HTMLElement | null)?.blur();
          await new Promise<void>((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame())));
        });
        await page.mouse.move(0, 0);
        await page.screenshot({
          path: join(candidateRoot, `routes-${route.name}-${locale}-${width}.png`),
          fullPage: true,
          animations: "disabled",
        });
      }
    }
  }

  for (const width of [1280, 1360]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("./");
    await expectHomeFloatingControlClear(page, `continuous/${width}`);
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("./");
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await expectHomeFloatingControlClear(page, "zoom-200/320");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
});
