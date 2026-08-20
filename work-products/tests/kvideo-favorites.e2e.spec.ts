import { expect, test, type BrowserContext, type Route } from "@playwright/test";
import axe from "axe-core";

const runtimeConfig = {
  release: { worker: "1.0.0", pages: "0.1.2", apiContract: 1 },
  site: { name: "UXUVideo", title: "UXUVideo", description: "Private video", iconUrl: "/icon.png" },
  capabilities: { premium: true, danmaku: false }, adKeywords: [],
  thirdPartyScripts: { videoTogether: { enabled: false, scriptUrl: null, settingUrl: null } }, authenticated: true,
};

const standardFavorite = { id: "source-a:same", updatedAt: 3, videoId: "same", title: "标准收藏",
  source: "source-a", sourceName: "普通源", addedAt: 3, mode: "standard" };
const secondStandard = { id: "source-b:second", updatedAt: 2, videoId: "second", title: "第二收藏",
  source: "source-b", sourceName: "普通源乙", addedAt: 2, mode: "standard" };
const premiumFavorite = { id: "premium:source-a:same", updatedAt: 4, videoId: "same", title: "高级收藏",
  source: "source-a", sourceName: "高级源", addedAt: 4, mode: "premium" };

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockWorker(context: BrowserContext, accountId: string, initialFavorites: typeof standardFavorite[]) {
  let library = { kind: "library", version: 1, updatedAt: 1,
    payload: { history: [], favorites: initialFavorites, tombstones: [] } };
  const config = { kind: "config", version: 1, updatedAt: 1,
    payload: { fields: {}, sources: [], subscriptions: [], tombstones: [] } };
  await context.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === "/api/config") return json(route, runtimeConfig);
    if (path === "/api/auth/session") return json(route, { authenticated: true, session: {
      accountId, profileId: accountId, username: accountId, name: accountId, role: "viewer", customPermissions: [], mode: "managed",
    } });
    if (path === "/api/app-update") return json(route, {
      currentVersion: "1.0.0", latestVersion: "1.0.0", status: "up-to-date", checkedAt: "2026-08-11T08:00:00.000Z",
      source: { changelogUrl: "https://github.com/uxudjs/UXUVideo/blob/main/CHANGELOG.md", repositoryUrl: "https://github.com/uxudjs/UXUVideo" },
    });
    if (path === "/api/user/config") return json(route, config);
    if (path === "/api/user/sync" && method === "GET") return json(route, library);
    if (path === "/api/user/sync" && method === "POST") {
      const body = route.request().postDataJSON() as { payload: typeof library.payload };
      library = { kind: "library", version: library.version + 1, updatedAt: Date.now(), payload: body.payload };
      return json(route, library);
    }
    return json(route, { error: { code: "NOT_FOUND" } }, 404);
  });
}

test.describe("KVideo T13 favorites library", () => {
  test.use({ locale: "zh-CN", timezoneId: "Asia/Taipei", colorScheme: "dark" });

  test("switches grid/list, removes items, opens the keyboard sidebar, and stays responsive", async ({ page }) => {
    await mockWorker(page.context(), "viewer-one", [standardFavorite, secondStandard, premiumFavorite]);
    await page.goto("./favorites");
    await expect(page.getByRole("heading", { name: "我的收藏" })).toBeVisible();
    await expect(page.getByText("收藏容量：2/100")).toBeVisible();
    await expect(page.getByRole("link", { name: "查看 标准收藏" }))
      .toHaveAttribute("href", /\/player\?id=same&source=source-a&title=/);
    await expect(page.getByText("高级收藏")).toHaveCount(0);
    await expect(page.locator(".favorites-grid-view")).toBeVisible();
    await expect(page.locator(".collection-actions")).toHaveAttribute("data-material", "regular");
    await expect(page.getByRole("button", { name: "打开收藏夹" })).toHaveAttribute("data-material", "regular");

    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole("heading", { name: "我的收藏" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }

    await page.setViewportSize({ width: 640, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });

    await page.getByRole("button", { name: "列表", exact: true }).click();
    await expect(page.locator(".favorites-list-view")).toBeVisible();
    await page.getByRole("button", { name: "取消收藏 第二收藏" }).click();
    await expect(page.getByText("收藏容量：1/100")).toBeVisible();

    await page.getByRole("button", { name: "打开收藏夹" }).click();
    const sidebar = page.getByRole("dialog", { name: "收藏夹" });
    await expect(sidebar).toBeVisible();
    await expect(sidebar).toHaveAttribute("data-material", "regular");
    await expect(sidebar.getByText("标准收藏")).toBeVisible();
    await expect(sidebar.getByText("高级收藏")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(sidebar).toBeHidden();

    await page.goto("./settings/");
    await page.locator('[data-settings-section="display"]').getByRole("button", { name: "繁體中文", exact: true }).click();
    await page.goto("./favorites/");
    await expect(page.getByRole("heading", { name: "我的收藏" })).toBeVisible();
    await expect(page.getByText(/收藏容量：1\/100/)).toBeVisible();
    await page.goto("./settings/");
    await page.locator('[data-settings-section="display"]').getByRole("button", { name: "English", exact: true }).click();
    await page.goto("./favorites/");
    await expect(page.getByRole("heading", { name: "My favorites" })).toBeVisible();
    await expect(page.getByText(/Favorite capacity: 1\/100/)).toBeVisible();

    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () => {
      const result = await (window as unknown as { axe: typeof import("axe-core") }).axe.run(document,
        { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
      return result.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
    });
    expect(violations).toEqual([]);
  });

  test("isolates the same video id across standard, premium, and another account", async ({ browser }) => {
    const first = await browser.newContext({ locale: "zh-CN", timezoneId: "Asia/Taipei" });
    await mockWorker(first, "viewer-one", [standardFavorite, premiumFavorite]);
    const standardPage = await first.newPage();
    await standardPage.goto("./favorites");
    await expect(standardPage.getByRole("link", { name: "查看 标准收藏" })).toBeVisible();
    await expect(standardPage.getByText("高级收藏")).toHaveCount(0);
    const premiumPage = await first.newPage();
    await premiumPage.goto("./premium/favorites");
    await expect(premiumPage.getByRole("link", { name: "查看 高级收藏" })).toBeVisible();
    await expect(premiumPage.getByText("标准收藏")).toHaveCount(0);
    await first.close();

    const second = await browser.newContext({ locale: "zh-CN", timezoneId: "Asia/Taipei" });
    await mockWorker(second, "viewer-two", []);
    const emptyPage = await second.newPage();
    await emptyPage.goto("./favorites");
    await expect(emptyPage.getByText("暂无收藏", { exact: true })).toBeVisible();
    await expect(emptyPage.getByText("标准收藏")).toHaveCount(0);
    await second.close();
  });

  test("shows the fixed 100-item capacity boundary", async ({ page }) => {
    const full = Array.from({ length: 100 }, (_, index) => ({ ...standardFavorite,
      id: `source-a:item-${index}`, videoId: `item-${index}`, title: `收藏 ${index}`, addedAt: 100 - index, updatedAt: 100 - index }));
    await mockWorker(page.context(), "viewer-full", full);
    await page.goto("./favorites");
    await expect(page.getByText("收藏容量：100/100")).toBeVisible();
    await expect(page.getByRole("button", { name: "打开收藏夹" })).toBeVisible();
  });
});
