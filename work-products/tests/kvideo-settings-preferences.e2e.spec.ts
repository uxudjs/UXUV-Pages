import { expect, test, type BrowserContext, type Route } from "@playwright/test";
import axe from "axe-core";

const domainNames = ["account", "sources", "playback", "display", "sync", "data"] as const;

const runtimeConfig = {
  release: { worker: "2.0.0", pages: "0.3.0", apiContract: 2 },
  site: { name: "UXUVideo", title: "UXUVideo", description: "Private video", iconUrl: "/icon.png" },
  capabilities: { premium: true, danmaku: false }, adKeywords: [],
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
    const domains = page.locator(".settings-domain-list > .settings-domain");
    await expect(domains).toHaveCount(domainNames.length);
    for (const [index, domain] of domainNames.entries()) await expect(domains.nth(index)).toHaveAttribute("data-settings-domain", domain);
    let display = page.locator('[data-settings-section="display"]');
    let sort = page.locator('[data-settings-section="sort"]');
    const sources = page.locator('[data-settings-section="sources"]');
    await expect(display.getByRole("heading", { name: "显示设置" })).toBeVisible();
    await expect(display.getByLabel("搜索结果显示方式")).toHaveValue("grouped");
    await expect(display.getByLabel("记住滚动位置")).toBeChecked();
    await expect(display.getByLabel("实时延迟显示")).not.toBeChecked();
    await expect(sort.getByLabel("搜索结果排序")).toHaveValue("default");
    expect(await sources.evaluate((node) => node.compareDocumentPosition(document.querySelector('[data-settings-section="display"]')!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
    expect(await display.evaluate((node) => node.compareDocumentPosition(document.querySelector('[data-settings-section="sort"]')!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();

    await display.getByLabel("搜索结果显示方式").selectOption("grouped");
    await display.getByLabel("实时延迟显示").check();
    await display.getByLabel("记住滚动位置").uncheck();
    await display.getByPlaceholder("输入类目关键词...").fill("伦理");
    await display.getByRole("button", { name: "添加", exact: true }).click();
    await sort.getByLabel("搜索结果排序").selectOption("date-asc");
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
    await expect(display.getByLabel("Search result display")).toHaveValue("grouped");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    worker.setAccount("account-b");
    await page.reload();
    display = page.locator('[data-settings-section="display"]');
    sort = page.locator('[data-settings-section="sort"]');
    await expect(page.getByRole("heading", { name: "设置", exact: true })).toBeVisible();
    await expect(display.getByLabel("搜索结果显示方式")).toHaveValue("grouped");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(sort.getByLabel("搜索结果排序")).toHaveValue("default");
    await expect(display.getByText("伦理", { exact: true })).toHaveCount(0);

    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(display).toBeVisible();
      if (width >= 1024) await expect(page.locator(".settings-anchor-nav")).toBeVisible();
      else await expect(page.locator(".settings-anchor-nav")).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.locator('.settings-anchor-nav a[href="#settings-domain-sources"]').click();
    await expect(page).toHaveURL(/#settings-domain-sources$/);
    const undersized = await page.locator(".settings-domain-list button:visible, .settings-domain-list input:visible, .settings-domain-list select:visible, .settings-anchor-nav a:visible")
      .evaluateAll((elements) => elements.flatMap((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width + 0.01 < 44 || rect.height + 0.01 < 44 ? [`${element.tagName}:${rect.width}x${rect.height}`] : [];
      }));
    expect(undersized).toEqual([]);
    await page.setViewportSize({ width: 640, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    const scaledOverflow = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("body *")].flatMap((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.right > innerWidth + 0.5
        ? [`${element.tagName}.${element.className}[${element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 32) ?? ""}]@${element.parentElement?.className ?? ""}:${rect.left.toFixed(1)}..${rect.right.toFixed(1)}>${innerWidth}`]
        : [];
    }));
    expect(scaledOverflow).toEqual([]);
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
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

  test("keeps the S21-T10 settings structure stable in three languages and four viewports", async ({ page }) => {
    await mockWorker(page.context());
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("./settings");
    const choices = { "zh-CN": "简体中文", "zh-TW": "繁體中文", en: "English" } as const;
    for (const [locale, label] of Object.entries(choices)) {
      await page.locator('[data-settings-section="display"]').getByRole("button", { name: new RegExp(label) }).click();
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await page.evaluate(() => window.scrollTo(0, 0));
      for (const width of [320, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(page.locator(".settings-domain-list")).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    }
  });
});
