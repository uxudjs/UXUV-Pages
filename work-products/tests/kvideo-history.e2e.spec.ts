import { expect, test, type BrowserContext, type Route } from "@playwright/test";
import axe from "axe-core";

const runtimeConfig = {
  release: { worker: "1.0.0", pages: "0.1.2", apiContract: 1 },
  site: { name: "UXUVideo", title: "UXUVideo", description: "Private video", iconUrl: "/icon.png" },
  capabilities: { premium: true, iptv: false, danmaku: false }, adKeywords: [],
  thirdPartyScripts: { videoTogether: { enabled: false, scriptUrl: null, settingUrl: null } }, authenticated: true,
};

const standardHistory = { id: "source-a:same", updatedAt: 4, videoId: "same", title: "标准记录", source: "source-a",
  episodeIndex: 2, playbackPosition: 180, duration: 1200, mode: "standard" };
const secondStandard = { id: "source-b:second", updatedAt: 3, videoId: "second", title: "第二记录", source: "source-b",
  episodeIndex: 0, playbackPosition: 20, duration: 600, mode: "standard" };
const premiumHistory = { id: "premium:source-a:same", updatedAt: 5, videoId: "same", title: "高级记录", source: "source-a",
  episodeIndex: 1, playbackPosition: 90, duration: 900, mode: "premium" };

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockWorker(context: BrowserContext, accountId: string, initialHistory: typeof standardHistory[]) {
  let library = { kind: "library", version: 1, updatedAt: 1,
    payload: { history: initialHistory, favorites: [], tombstones: [] } };
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

test.describe("KVideo T14 watch history", () => {
  test.use({ locale: "zh-CN", timezoneId: "Asia/Taipei", colorScheme: "dark" });

  test("continues, confirms removal and clear, localizes, and stays responsive", async ({ page }) => {
    await mockWorker(page.context(), "viewer-one", [standardHistory, secondStandard, premiumHistory]);
    await page.goto("./favorites");
    await page.getByRole("button", { name: "打开观看历史" }).click();
    const sidebar = page.getByRole("dialog", { name: "观看历史" });
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByText("2/50 条")).toBeVisible();
    await expect(sidebar.getByText("高级记录")).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "继续播放 标准记录" }))
      .toHaveAttribute("href", /\/player\?id=same&source=source-a&title=.*&episode=2&position=180&duration=1200/);

    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(sidebar).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }

    await sidebar.getByRole("button", { name: "删除记录 第二记录" }).click();
    const removeDialog = page.getByRole("alertdialog", { name: "删除这条历史记录？" });
    await expect(removeDialog).toBeVisible();
    await removeDialog.getByRole("button", { name: "取消" }).click();
    await expect(sidebar.getByText("第二记录")).toBeVisible();
    await sidebar.getByRole("button", { name: "删除记录 第二记录" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "确认删除" }).click();
    await expect(sidebar.getByText("第二记录")).toHaveCount(0);

    await page.keyboard.press("Escape");
    await page.goto("./settings/");
    await page.locator('[data-settings-section="display"]').getByRole("button", { name: "繁體中文", exact: true }).click();
    await page.goto("./favorites/");
    await page.getByRole("button", { name: "開啟觀看記錄" }).click();
    await expect(page.getByRole("dialog", { name: "觀看記錄" })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.goto("./settings/");
    await page.locator('[data-settings-section="display"]').getByRole("button", { name: "English", exact: true }).click();
    await page.goto("./favorites/");
    await page.getByRole("button", { name: "Open watch history" }).click();
    await expect(page.getByRole("dialog", { name: "Watch history" })).toBeVisible();
    await page.getByRole("dialog", { name: "Watch history" }).getByRole("button", { name: "Clear history" }).click();
    await expect(page.getByRole("alertdialog", { name: "Clear all watch history?" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await page.getByRole("dialog", { name: "Watch history" }).getByRole("button", { name: "Clear history" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("No watch history")).toBeVisible();

    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () => {
      const result = await (window as unknown as { axe: typeof import("axe-core") }).axe.run(document,
        { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
      return result.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
    });
    expect(violations).toEqual([]);
  });

  test("isolates the same video across standard, premium, and another account", async ({ browser }) => {
    const first = await browser.newContext({ locale: "zh-CN", timezoneId: "Asia/Taipei" });
    await mockWorker(first, "viewer-one", [standardHistory, premiumHistory]);
    const standardPage = await first.newPage();
    await standardPage.goto("./favorites");
    await standardPage.getByRole("button", { name: "打开观看历史" }).click();
    await expect(standardPage.getByRole("dialog", { name: "观看历史" }).getByText("标准记录")).toBeVisible();
    await expect(standardPage.getByText("高级记录")).toHaveCount(0);
    const premiumPage = await first.newPage();
    await premiumPage.goto("./premium/favorites");
    await premiumPage.getByRole("button", { name: "打开观看历史" }).click();
    await expect(premiumPage.getByRole("dialog", { name: "观看历史" }).getByText("高级记录")).toBeVisible();
    await expect(premiumPage.getByText("标准记录")).toHaveCount(0);
    await first.close();

    const second = await browser.newContext({ locale: "zh-CN", timezoneId: "Asia/Taipei" });
    await mockWorker(second, "viewer-two", []);
    const emptyPage = await second.newPage();
    await emptyPage.goto("./favorites");
    await emptyPage.getByRole("button", { name: "打开观看历史" }).click();
    await expect(emptyPage.getByText("暂无观看历史")).toBeVisible();
    await expect(emptyPage.getByText("标准记录")).toHaveCount(0);
    await second.close();
  });

  test("shows only the newest 50 records without deleting overflow", async ({ page }) => {
    const history = Array.from({ length: 52 }, (_, index) => ({ ...standardHistory,
      id: `source-a:item-${index}`, videoId: `item-${index}`, title: `记录 ${index}`, updatedAt: 100 - index }));
    await mockWorker(page.context(), "viewer-full", [...history, premiumHistory]);
    await page.goto("./favorites");
    await page.getByRole("button", { name: "打开观看历史" }).click();
    const sidebar = page.getByRole("dialog", { name: "观看历史" });
    await expect(sidebar.getByText("50/50 条")).toBeVisible();
    await expect(sidebar.locator("li")).toHaveCount(50);
    await expect(sidebar.getByText("记录 49", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("记录 50", { exact: true })).toHaveCount(0);
  });
});
