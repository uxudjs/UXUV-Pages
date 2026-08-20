import { expect, test, type APIRequestContext, type Page, type Route } from "@playwright/test";

test.use({ locale: "zh-CN" });

const session = {
  accountId: "admin-1", profileId: "admin-1", username: "admin", name: "Administrator",
  role: "super_admin", customPermissions: [], mode: "managed",
};
const runtimeConfig = {
  release: { worker: "1.0.0", pages: "0.1.2", apiContract: 1 },
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

async function fulfill(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function routeStaticPages(page: Page, request: APIRequestContext) {
  await page.route("https://uxudjs.github.io:4173/**", async (route) => {
    const requested = new URL(route.request().url());
    const response = await request.get(`http://127.0.0.1:4173${requested.pathname}${requested.search}`);
    await route.fulfill({ status: response.status(), headers: response.headers(), body: await response.body() });
  });
}

async function readyWorker(page: Page, role: "viewer" | "super_admin" = "super_admin") {
  let accountRequests = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/config") return fulfill(route, runtimeConfig);
    if (path === "/api/auth/session") return fulfill(route, {
      authenticated: true,
      session: { ...session, role },
    });
    if (path === "/api/user/config") return fulfill(route, emptyDocument("config"));
    if (path === "/api/user/sync") return fulfill(route, emptyDocument("library"));
    if (path === "/api/douban/tags") return fulfill(route, { tags: ["热门"] });
    if (path === "/api/douban/recommend") return fulfill(route, { subjects: [] });
    if (path === "/api/auth/accounts") accountRequests += 1;
    return fulfill(route, { error: { code: "NOT_FOUND" } }, 404);
  });
  return () => accountRequests;
}

const publicCopy = [
  ["zh-CN", "请从你的 UXUVideo Worker 域名访问完整应用。"],
  ["zh-TW", "請從你的 UXUVideo Worker 網域開啟完整應用程式。"],
  ["en-US", "Open the full application from your UXUVideo Worker domain."],
] as const;

for (const [locale, guidance] of publicCopy) {
  test(`direct Pages ${locale} remains public-only and responsive`, async ({ browser, request }) => {
    const context = await browser.newContext({ locale });
    const page = await context.newPage();
    let apiRequests = 0;
    await routeStaticPages(page, request);
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests += 1;
    });

    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("https://uxudjs.github.io:4173/UXUV-Pages/");
      await expect(page.getByText(guidance)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expect(apiRequests).toBe(0);
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
    await context.close();
  });
}

test("missing runtime setup retries into the focused login flow", async ({ page }, testInfo) => {
  let configAttempts = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/config") {
      configAttempts += 1;
      return configAttempts === 1
        ? fulfill(route, { error: { code: "NOT_CONFIGURED" } }, 404)
        : fulfill(route, runtimeConfig);
    }
    if (path === "/api/auth/session") return fulfill(route, { authenticated: false, session: null }, 401);
    return fulfill(route, { error: { code: "NOT_FOUND" } }, 404);
  });

  await page.goto("./");
  await expect(page.getByRole("heading", { name: "尚未完成设置" })).toBeVisible();
  const retry = page.getByRole("button", { name: "重试" });
  await expect(retry).toBeFocused();
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await testInfo.attach(`setup-missing-${width}`, { body: await page.screenshot(), contentType: "image/png" });
  }
  await retry.click();
  await expect(page.getByRole("heading", { name: "访问受限" })).toBeVisible();
  await expect(page.getByLabel("用户名")).toBeFocused();
  expect(configAttempts).toBe(2);
});

test("an expired server session returns to login with an announced reason", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/config") return fulfill(route, runtimeConfig);
    if (path === "/api/auth/session") return fulfill(route, { authenticated: true, session });
    if (path === "/api/user/config") return fulfill(route, emptyDocument("config"));
    if (path === "/api/user/sync") return fulfill(route, emptyDocument("library"));
    if (path === "/api/douban/tags") return fulfill(route, { tags: ["热门"] });
    if (path === "/api/douban/recommend") return fulfill(route, { error: { code: "AUTH_REQUIRED" } }, 401);
    return fulfill(route, { error: { code: "NOT_FOUND" } }, 404);
  });

  await page.goto("./");
  await expect(page.getByRole("heading", { name: "访问受限" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "会话已失效，请重新登录。" })).toHaveText("会话已失效，请重新登录。");
  await expect(page.getByLabel("用户名")).toBeFocused();
});

const permissionCopy = [
  ["zh-CN", "只有 super_admin 可以查看和修改账户。"],
  ["zh-TW", "只有 super_admin 可以檢視和修改帳戶。"],
  ["en-US", "Only super_admin can view and modify accounts."],
] as const;

test("account permission fallback is localized and never requests account data", async ({ browser }) => {
  for (const [locale, message] of permissionCopy) {
    const context = await browser.newContext({ locale });
    const page = await context.newPage();
    const accountRequests = await readyWorker(page, "viewer");
    await page.goto("http://127.0.0.1:4173/settings/");
    await expect(page.getByText(message)).toBeVisible();
    expect(accountRequests()).toBe(0);
    await context.close();
  }
});
