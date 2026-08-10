import { expect, test, type BrowserContext, type Route } from "@playwright/test";
import axe from "axe-core";

const runtimeConfig = {
  release: { worker: "1.0.0", pages: "0.1.2", apiContract: 1 },
  site: { name: "UXUVideo", title: "UXUVideo", description: "Private video", iconUrl: "/icon.png" },
  capabilities: { premium: true, iptv: false, danmaku: false }, adKeywords: [],
  thirdPartyScripts: { videoTogether: { enabled: false, scriptUrl: null, settingUrl: null } }, authenticated: true,
};

type ConfigDocument = { kind: "config"; version: number; updatedAt: number; payload: {
  fields: Record<string, { value: unknown; updatedAt: number }>; sources: unknown[]; subscriptions: unknown[]; tombstones: unknown[];
} };

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockWorker(context: BrowserContext) {
  let accountId = "account-a";
  const documents = new Map<string, ConfigDocument>();
  const document = (id: string) => {
    if (!documents.has(id)) documents.set(id, { kind: "config", version: 1, updatedAt: 1,
      payload: { fields: {}, sources: [], subscriptions: [], tombstones: [] } });
    return documents.get(id)!;
  };
  const library = { kind: "library", version: 1, updatedAt: 1, payload: { history: [], favorites: [], tombstones: [] } };
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/config") return json(route, runtimeConfig);
    if (path === "/api/auth/session") return json(route, { authenticated: true, session: {
      accountId, profileId: accountId, username: accountId, name: accountId, role: "viewer", customPermissions: [], mode: "managed",
    } });
    if (path === "/api/user/config" && request.method() === "GET") return json(route, document(accountId));
    if (path === "/api/user/config" && request.method() === "POST") {
      const body = request.postDataJSON() as { payload: ConfigDocument["payload"] };
      const current = document(accountId);
      documents.set(accountId, { kind: "config", version: current.version + 1, updatedAt: Date.now(), payload: body.payload });
      return json(route, documents.get(accountId));
    }
    if (path === "/api/user/sync") return json(route, library);
    return json(route, { error: { code: "NOT_FOUND" } }, 404);
  });
  return { setAccount: (next: string) => { accountId = next; }, document };
}

test.describe("KVideo T17 account preferences", () => {
  test.use({ locale: "zh-CN", timezoneId: "Asia/Taipei", colorScheme: "dark" });

  test("applies reviewed defaults, persists live settings, and isolates another account", async ({ page }) => {
    const worker = await mockWorker(page.context());
    await page.goto("./settings");
    let display = page.locator('[data-settings-section="display"]');
    let sort = page.locator('[data-settings-section="sort"]');
    const sources = page.locator('[data-settings-section="sources"]');
    await expect(display.getByRole("heading", { name: "显示设置" })).toBeVisible();
    await expect(display.getByText("默认显示", { exact: true }).locator("..")).toHaveAttribute("aria-pressed", "true");
    await expect(display.getByLabel("记住滚动位置")).toBeChecked();
    await expect(display.getByLabel("实时延迟显示")).not.toBeChecked();
    await expect(sort.getByRole("button", { name: "默认排序" })).toHaveAttribute("aria-pressed", "true");
    expect(await display.evaluate((node) => node.compareDocumentPosition(document.querySelector('[data-settings-section="sources"]')!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
    expect(await sources.evaluate((node) => node.compareDocumentPosition(document.querySelector('[data-settings-section="sort"]')!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();

    await display.getByRole("button", { name: /合并同名源/ }).click();
    await display.getByLabel("实时延迟显示").check();
    await display.getByLabel("记住滚动位置").uncheck();
    await display.getByPlaceholder("输入类目关键词...").fill("伦理");
    await display.getByRole("button", { name: "添加", exact: true }).click();
    await sort.getByRole("button", { name: "发布时间（旧到新）" }).click();
    await page.goto("./");
    await page.getByRole("button", { name: "设为浅色主题" }).click();
    await page.goto("./settings");
    display = page.locator('[data-settings-section="display"]');
    await display.getByRole("button", { name: /English/ }).click();
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await expect.poll(() => worker.document("account-a").payload.fields.locale?.value).toBe("en");
    await expect.poll(() => worker.document("account-a").payload.fields.theme?.value).toBe("light");
    await expect.poll(() => worker.document("account-a").payload.fields.rememberScrollPosition?.value).toBe(false);
    const accountA = await page.evaluate(() => ({
      locale: localStorage.getItem("uxuv-locale:account-a"), theme: localStorage.getItem("uxuv-theme:account-a"),
      display: localStorage.getItem("uxuv-search-display:v1:account-a:standard"),
      search: JSON.parse(localStorage.getItem("uxuv-search-policy:v1:account-a:standard") ?? "{}"),
    }));
    expect(accountA).toMatchObject({ locale: "en", theme: "light", display: "grouped",
      search: { sortBy: "date-asc", realtimeLatency: true, blockedCategories: ["伦理"] } });

    await page.reload();
    display = page.locator('[data-settings-section="display"]');
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await expect(display.getByRole("button", { name: /Group matching titles/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    worker.setAccount("account-b");
    await page.reload();
    display = page.locator('[data-settings-section="display"]');
    sort = page.locator('[data-settings-section="sort"]');
    await expect(page.getByRole("heading", { name: "设置", exact: true })).toBeVisible();
    await expect(display.getByRole("button", { name: /默认显示/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(sort.getByRole("button", { name: "默认排序" })).toHaveAttribute("aria-pressed", "true");
    await expect(display.getByText("伦理", { exact: true })).toHaveCount(0);

    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(display).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () => {
      const result = await (window as unknown as { axe: typeof import("axe-core") }).axe.run(document,
        { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
      return result.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
    });
    expect(violations).toEqual([]);
  });

  test("migrates legacy global theme and locale once without leaking them to a second account", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("uxuv-theme", "dark");
      localStorage.setItem("uxuv-locale", "zh-TW");
    });
    const worker = await mockWorker(page.context());
    await page.goto("./settings");
    await expect(page.getByRole("heading", { name: "設定", exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await page.evaluate(() => localStorage.getItem("uxuv-theme:account-a"))).toBe("dark");
    expect(await page.evaluate(() => localStorage.getItem("uxuv-locale:account-a"))).toBe("zh-TW");

    worker.setAccount("account-b");
    await page.reload();
    await expect(page.getByRole("heading", { name: "设置", exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await page.evaluate(() => localStorage.getItem("uxuv-theme:account-b"))).toBe("system");
    expect(await page.evaluate(() => localStorage.getItem("uxuv-locale:account-b"))).toBe("zh-CN");
  });
});
