import { expect, test, type BrowserContext, type Route } from "@playwright/test";

const runtime = {
  release: { worker: "1.0.0", pages: "0.1.2", apiContract: 1 },
  site: { name: "UXUVideo", title: "UXUVideo", description: "Private", iconUrl: "/icon.png" },
  capabilities: { premium: true, danmaku: false }, adKeywords: [],
  thirdPartyScripts: { videoTogether: { enabled: false, scriptUrl: null, settingUrl: null } }, authenticated: true,
};
const standardFavorite = { id: "standard:shared:same", updatedAt: 3, videoId: "same", title: "Standard favorite",
  source: "shared", sourceName: "Standard source", addedAt: 3, mode: "standard" };
const premiumFavorite = { id: "premium:shared:same", updatedAt: 4, videoId: "same", title: "Premium favorite",
  source: "premium-source", sourceName: "Premium source", addedAt: 4, mode: "premium" };
const standardHistory = { id: "standard:shared:same", updatedAt: 5, videoId: "same", title: "Standard history",
  source: "shared", episodeIndex: 0, playbackPosition: 30, duration: 300, mode: "standard" };
const premiumHistory = { id: "premium:shared:same", updatedAt: 6, videoId: "same", title: "Premium history",
  source: "premium-source", episodeIndex: 1, playbackPosition: 60, duration: 600, mode: "premium" };

type Library = { kind: "library"; version: number; updatedAt: number; payload: {
  history: Array<Record<string, unknown>>; favorites: Array<Record<string, unknown>>; tombstones: Array<Record<string, unknown>>;
} };

const session = (accountId: string) => ({ accountId, profileId: accountId, username: accountId, name: accountId,
  role: "viewer", customPermissions: [], mode: "managed" });
const library = (favorites: Array<Record<string, unknown>>, history: Array<Record<string, unknown>>): Library => ({
  kind: "library", version: 1, updatedAt: 1, payload: { favorites, history, tombstones: [] },
});
const config = { kind: "config", version: 1, updatedAt: 1, payload: { fields: {}, subscriptions: [], tombstones: [], sources: [
  { id: "shared", updatedAt: 1, name: "Standard source", baseUrl: "https://standard.example", enabled: true, group: "normal" },
  { id: "premium-source", updatedAt: 1, name: "Premium source", baseUrl: "https://premium.example", enabled: true, group: "premium" },
] } };

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockWorker(context: BrowserContext) {
  let active: string | null = "viewer-one";
  const libraries = new Map<string, Library>([
    ["viewer-one", library([standardFavorite, premiumFavorite], [standardHistory, premiumHistory])],
    ["viewer-two", library([], [])],
  ]);
  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === "/api/config") return json(route, runtime);
    if (url.pathname === "/api/auth/session" && method === "GET") return active
      ? json(route, { authenticated: true, session: session(active) }) : json(route, { authenticated: false });
    if (url.pathname === "/api/auth/session" && method === "DELETE") { active = null; return json(route, { authenticated: false }); }
    if (url.pathname === "/api/auth" && method === "POST") {
      const body = route.request().postDataJSON() as { username?: string };
      active = body.username && libraries.has(body.username) ? body.username : "viewer-two";
      return json(route, { session: session(active) });
    }
    if (!active) return json(route, { error: { code: "UNAUTHORIZED" } }, 401);
    if (url.pathname === "/api/user/config") return json(route, config);
    if (url.pathname === "/api/user/sync" && method === "GET") return json(route, libraries.get(active));
    if (url.pathname === "/api/user/sync" && method === "POST") {
      const body = route.request().postDataJSON() as { payload: Library["payload"] };
      const previous = libraries.get(active)!;
      const next = { kind: "library" as const, version: previous.version + 1, updatedAt: Date.now(), payload: body.payload };
      libraries.set(active, next);
      return json(route, next);
    }
    return json(route, { error: { code: "NOT_FOUND" } }, 404);
  });
  return { library: (accountId: string) => libraries.get(accountId)! };
}

test.describe("KVideo T30 Premium library", () => {
  test.use({ locale: "zh-CN", timezoneId: "Asia/Taipei", colorScheme: "dark", viewport: { width: 1440, height: 900 } });

  test("isolates Premium records, preserves standard records, and traps keyboard and TV focus", async ({ page }, testInfo) => {
    const worker = await mockWorker(page.context());
    await page.goto("./premium/favorites/");
    await expect(page.getByRole("heading", { name: "Premium 收藏" })).toBeVisible();
    await expect(page.getByRole("link", { name: "查看 Premium favorite" })).toHaveAttribute("href", /premium=1/);
    await expect(page.getByText("Standard favorite")).toHaveCount(0);
    await expect(page.getByText("收藏容量：1\/100")).toBeVisible();
    await expect(page.locator(".collection-actions")).toHaveAttribute("data-material", "regular");

    await page.evaluate(() => scrollTo(0, 0));
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`premium-library-${width}.png`), animations: "disabled" });
    }
    await page.setViewportSize({ width: 640, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    await page.setViewportSize({ width: 1440, height: 900 });

    const favoritesToggle = page.getByRole("button", { name: "打开收藏夹" });
    await expect(favoritesToggle).toHaveAttribute("data-material", "regular");
    await favoritesToggle.click();
    const favoritesDialog = page.getByRole("dialog", { name: "收藏夹" });
    await expect(favoritesDialog).toHaveAttribute("data-material", "regular");
    await expect(favoritesDialog.getByText("Premium favorite")).toBeVisible();
    await expect(favoritesDialog.getByText("Standard favorite")).toHaveCount(0);
    await expect(favoritesDialog.getByRole("button", { name: "关闭收藏夹" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    expect(await page.locator(":focus").evaluate((element) => Boolean(element.closest(".favorites-sidebar")))).toBe(true);
    await favoritesDialog.getByRole("button", { name: "取消收藏 Premium favorite" }).click();
    const favoriteConfirm = page.getByRole("alertdialog", { name: "取消这项收藏？" });
    await expect(favoriteConfirm).toHaveAttribute("data-material", "regular");
    expect(await favoriteConfirm.evaluate((element) => getComputedStyle(element).backdropFilter)).toBe("none");
    await expect(favoriteConfirm.getByRole("button", { name: "取消" })).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(favoriteConfirm.getByRole("button", { name: "确认删除" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(favoritesDialog.getByText("Premium favorite")).toHaveCount(0);
    await expect.poll(() => worker.library("viewer-one").payload.favorites.map(({ title }) => title)).toEqual(["Standard favorite"]);
    await page.keyboard.press("Escape");
    await expect(favoritesToggle).toBeFocused();

    const historyToggle = page.getByRole("button", { name: "打开观看历史" });
    await expect(historyToggle).toHaveAttribute("data-material", "regular");
    await historyToggle.click();
    const historyDialog = page.getByRole("dialog", { name: "观看历史" });
    await expect(historyDialog).toHaveAttribute("data-material", "regular");
    await expect(historyDialog.getByRole("link", { name: "继续播放 Premium history" })).toHaveAttribute("href", /premium=1/);
    await expect(historyDialog.getByText("Standard history")).toHaveCount(0);
    await historyDialog.getByRole("button", { name: "清空历史" }).click();
    const historyConfirm = page.getByRole("alertdialog", { name: "清空全部观看历史？" });
    await page.keyboard.press("Escape");
    await expect(historyConfirm).toHaveCount(0);
    await expect(page.locator(":focus")).toBeFocused();
    await historyDialog.getByRole("button", { name: "清空历史" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "确认删除" }).click();
    await expect(historyDialog.getByText("暂无观看历史")).toBeVisible();
    await expect.poll(() => worker.library("viewer-one").payload.history.map(({ title }) => title)).toEqual(["Standard history"]);
  });

  test("clears the in-memory view on account switch and restores each account's own data", async ({ page }) => {
    await mockWorker(page.context());
    await page.goto("./premium/favorites/");
    await expect(page.getByText("Premium favorite")).toBeVisible();
    await page.getByRole("button", { name: "退出登录" }).click();
    await page.getByLabel("用户名").fill("viewer-two");
    await page.getByLabel("密码").fill("account-two-password");
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page.getByText("暂无收藏", { exact: true })).toBeVisible();
    await expect(page.getByText("Premium favorite")).toHaveCount(0);
    await page.getByRole("button", { name: "退出登录" }).click();
    await page.getByLabel("用户名").fill("viewer-one");
    await page.getByLabel("密码").fill("account-one-password");
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page.getByText("Premium favorite")).toBeVisible();
  });

  test("localizes the Premium library and both sidebar controls in all three languages", async ({ browser }) => {
    for (const scenario of [
      { locale: "zh-CN", heading: "Premium 收藏", favorites: "打开收藏夹", history: "打开观看历史" },
      { locale: "zh-TW", heading: "Premium 收藏", favorites: "開啟收藏夾", history: "開啟觀看記錄" },
      { locale: "en-US", heading: "Premium favorites", favorites: "Open favorites", history: "Open watch history" },
    ]) {
      const context = await browser.newContext({ locale: scenario.locale });
      await mockWorker(context);
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:4173/premium/favorites/");
      await expect(page.getByRole("heading", { name: scenario.heading })).toBeVisible();
      await expect(page.getByRole("button", { name: scenario.favorites })).toBeVisible();
      await expect(page.getByRole("button", { name: scenario.history })).toBeVisible();
      await context.close();
    }
  });
});
