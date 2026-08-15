import { expect, test, type BrowserContext, type Route } from "@playwright/test";
import axe from "axe-core";

const runtimeConfig = {
  release: { worker: "1.0.0", pages: "0.1.2", apiContract: 1 },
  site: { name: "UXUVideo", title: "UXUVideo", description: "Private video", iconUrl: "/icon.png" },
  capabilities: { premium: true, iptv: false, danmaku: false }, adKeywords: [],
  thirdPartyScripts: { videoTogether: { enabled: false, scriptUrl: null, settingUrl: null } }, authenticated: true,
};

const sources = Array.from({ length: 12 }, (_, index) => ({
  id: index === 11 ? "personal-one" : `system-${index + 1}`,
  updatedAt: 20 - index,
  name: index === 11 ? "个人源" : `系统源 ${index + 1}`,
  baseUrl: `https://${index + 1}.example.com/api.php/provide/vod`,
  searchPath: "/api.php/provide/vod/",
  detailPath: "/api.php/provide/vod/",
  enabled: true,
  group: "normal",
  kind: index === 11 ? "personal" : "system",
  priority: index + 1,
}));

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockWorker(context: BrowserContext, accountId: string, initialSources: typeof sources) {
  let config = { kind: "config", version: 1, updatedAt: 1,
    payload: { fields: {}, sources: initialSources, subscriptions: [], tombstones: [] } };
  const library = { kind: "library", version: 1, updatedAt: 1,
    payload: { history: [], favorites: [], tombstones: [] } };
  await context.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === "/api/config") return json(route, runtimeConfig);
    if (path === "/api/auth/session") return json(route, { authenticated: true, session: {
      accountId, profileId: accountId, username: accountId, name: accountId, role: "viewer", customPermissions: [], mode: "managed",
    } });
    if (path === "/api/user/config" && method === "GET") return json(route, config);
    if (path === "/api/user/config" && method === "POST") {
      const body = route.request().postDataJSON() as { payload: typeof config.payload };
      config = { kind: "config", version: config.version + 1, updatedAt: Date.now(), payload: body.payload };
      return json(route, config);
    }
    if (path === "/api/user/sync") return json(route, library);
    return json(route, { error: { code: "NOT_FOUND" } }, 404);
  });
}

test.describe("KVideo T15 settings and standard sources", () => {
  test.use({ locale: "zh-CN", timezoneId: "Asia/Taipei", colorScheme: "dark" });

  test("adds, edits, toggles, orders, confirms deletion, localizes, and stays responsive", async ({ page }) => {
    await mockWorker(page.context(), "viewer-one", sources);
    await page.goto("./settings");
    await expect(page.getByRole("heading", { name: "设置", exact: true })).toBeVisible();
    const section = page.locator('[data-settings-section="sources"]');
    await expect(section.getByRole("heading", { name: "视频源管理" })).toBeVisible();
    await expect(section.locator(".source-manager-row")).toHaveCount(10);
    await expect(section.getByText("0 JSON 订阅 · 12 独立来源 · 系统 11 · 个人 1")).toBeVisible();
    await section.getByRole("button", { name: "显示全部 (12)" }).click();
    await expect(section.locator(".source-manager-row")).toHaveCount(12);
    await expect(section.locator(".source-kind-system").first()).toHaveText("系统");
    await expect(section.locator(".source-kind-personal")).toHaveText("个人");

    await section.getByRole("button", { name: "添加源" }).click();
    let modal = page.getByRole("dialog", { name: "添加个人视频源" });
    await modal.getByLabel("源名称").fill("Personal Extra");
    await expect(modal.getByLabel("源 ID")).toHaveValue("personal-extra");
    await modal.getByLabel("接口地址").fill("ftp://unsafe.example/file");
    await modal.getByRole("button", { name: "添加", exact: true }).click();
    await expect(modal.getByRole("alert")).toHaveText("请输入有效的 HTTP 或 HTTPS 地址。");
    await modal.getByLabel("接口地址").fill("https://extra.example/api.php/provide/vod/");
    await modal.getByRole("button", { name: "添加", exact: true }).click();
    await expect(section.getByText("Personal Extra", { exact: true })).toBeVisible();

    await section.getByRole("button", { name: "编辑 个人源" }).click();
    modal = page.getByRole("dialog", { name: "编辑个人视频源" });
    await modal.getByLabel("源名称").fill("个人源已编辑");
    await modal.getByRole("button", { name: "保存" }).click();
    await expect(section.getByText("个人源已编辑", { exact: true })).toBeVisible();

    await section.getByRole("button", { name: "停用 系统源 1", exact: true }).click();
    await expect(section.getByRole("button", { name: "启用 系统源 1", exact: true })).toBeVisible();
    await section.getByRole("button", { name: "下移 系统源 1", exact: true }).click();
    await expect(section.locator(".source-manager-info strong").nth(0)).toHaveText("系统源 2");
    await expect(section.locator(".source-manager-info strong").nth(1)).toHaveText("系统源 1");

    const drag = section.getByRole("button", { name: "拖动排序 Personal Extra" });
    await drag.focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Space");
    await expect(drag).toBeFocused();
    await expect(section.locator(".source-manager-info strong").nth(11)).toHaveText("Personal Extra");

    await section.getByRole("button", { name: "删除 个人源已编辑" }).click();
    let confirm = page.getByRole("alertdialog", { name: "删除视频源？" });
    await confirm.getByRole("button", { name: "取消" }).click();
    await expect(section.getByText("个人源已编辑", { exact: true })).toBeVisible();
    await section.getByRole("button", { name: "删除 个人源已编辑" }).click();
    confirm = page.getByRole("alertdialog", { name: "删除视频源？" });
    await confirm.getByRole("button", { name: "确认删除" }).click();
    await expect(section.getByText("个人源已编辑", { exact: true })).toHaveCount(0);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("uxuv-sync-v1:viewer-one:config") ?? "null"));
    expect(saved.payload.sources.some(({ id }: { id: string }) => id === "personal-extra")).toBe(true);
    expect(saved.payload.sources.some(({ id }: { id: string }) => id === "personal-one")).toBe(false);
    expect(saved.payload.tombstones.some(({ id }: { id: string }) => id === "personal-one")).toBe(true);

    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(section).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    const display = page.locator('[data-settings-section="display"]');
    await display.getByRole("button", { name: /繁體中文/ }).click();
    await expect(page.getByRole("heading", { name: "影片來源管理" })).toBeVisible();
    await display.getByRole("button", { name: /English/ }).click();
    await expect(page.getByRole("heading", { name: "Video sources", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();

    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () => {
      const result = await (window as unknown as { axe: typeof import("axe-core") }).axe.run(document,
        { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
      return result.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
    });
    expect(violations).toEqual([]);
  });

  test("keeps another account's source document isolated", async ({ browser }) => {
    const second = await browser.newContext({ locale: "zh-CN", timezoneId: "Asia/Taipei" });
    await mockWorker(second, "viewer-two", []);
    const page = await second.newPage();
    await page.goto("./settings");
    const section = page.locator('[data-settings-section="sources"]');
    await expect(section.getByText("尚未配置视频源。")).toBeVisible();
    await expect(section.getByText("Personal Extra", { exact: true })).toHaveCount(0);
    await second.close();
  });
});
