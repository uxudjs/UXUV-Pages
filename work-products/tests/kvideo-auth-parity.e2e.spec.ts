import { expect, test, type Page, type Route } from "@playwright/test";
import axe from "axe-core";

const session = {
  accountId: "fixture-admin",
  profileId: "fixture-admin",
  username: "admin",
  name: "Administrator",
  role: "super_admin",
  customPermissions: [],
  mode: "managed",
};
const config = {
  release: { worker: "1.0.0", pages: "0.1.2", apiContract: 1 },
  site: { name: "UXUVideo", title: "UXUVideo", description: "Fixture UI", iconUrl: "/icon.png" },
  capabilities: { premium: true, iptv: true, danmaku: true },
  adKeywords: [],
  thirdPartyScripts: { videoTogether: { enabled: false, scriptUrl: null, settingUrl: null } },
  authenticated: false,
};
const emptyDocument = (kind: "config" | "library") => ({
  kind,
  version: 0,
  updatedAt: null,
  payload: kind === "config"
    ? { fields: {}, sources: [], subscriptions: [], tombstones: [] }
    : { history: [], favorites: [], tombstones: [] },
});

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockWorker(page: Page, options: { rejectLogin?: boolean } = {}) {
  let authenticated = false;
  const loginRequests: Array<{ url: string; method: string; headers: Record<string, string>; body: unknown }> = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/config") return json(route, { ...config, authenticated });
    if (url.pathname === "/api/auth/session") {
      return json(route, authenticated ? { authenticated: true, session } : { authenticated: false, session: null });
    }
    if (url.pathname === "/api/auth" && request.method() === "POST") {
      loginRequests.push({
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        body: request.postDataJSON(),
      });
      if (options.rejectLogin) return json(route, { error: { code: "INVALID_CREDENTIALS" } }, 401);
      authenticated = true;
      return json(route, { valid: true, session });
    }
    if (url.pathname === "/api/user/config") return json(route, emptyDocument("config"));
    if (url.pathname === "/api/user/sync") return json(route, emptyDocument("library"));
    if (url.pathname === "/api/admin/usage") {
      return json(route, { data: { configured: false, missing: ["CF_ANALYTICS_API_TOKEN"], message: "Usage fixture is not configured." } });
    }
    return json(route, { error: { code: "NOT_FOUND" } }, 404);
  });

  return { loginRequests };
}

test.describe("reviewed KVideo login", () => {
  test.use({ locale: "zh-CN", timezoneId: "Asia/Taipei", colorScheme: "dark" });

  test("matches the approved 1024px visual and layout contract", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await mockWorker(page);
    await page.goto("./");
    await expect(page.getByRole("heading", { name: "访问受限" })).toBeVisible();
    await expect(page.getByLabel("用户名")).toBeFocused();

    const boxes = await page.locator("#login-username,#login-password,.auth-submit").evaluateAll((elements) => (
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return [Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)];
      })
    ));
    expect(boxes).toEqual([
      [337, 452, 350, 50],
      [337, 518, 350, 50],
      [337, 584, 350, 48],
    ]);

    const screenshot = await page.screenshot({ fullPage: true, animations: "disabled" });
    expect(screenshot).toMatchSnapshot(["states", "login-1024.png"], { maxDiffPixelRatio: 0.005 });
  });

  test("keeps four breakpoints keyboard accessible and axe-clean", async ({ page }) => {
    await mockWorker(page);
    await page.goto("./");
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const card = await page.locator(".auth-card").boundingBox();
      expect(card).not.toBeNull();
      expect(card!.x).toBeGreaterThanOrEqual(16);
      expect(card!.x + card!.width).toBeLessThanOrEqual(width - 16);
      await page.addScriptTag({ content: axe.source });
      const violations = await page.evaluate(async () => {
        const api = (window as unknown as { axe: typeof import("axe-core") }).axe;
        const result = await api.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
        return result.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
      });
      expect(violations, `${width}px`).toEqual([]);
    }

    await page.getByLabel("用户名").fill("admin");
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("密码")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "登录" })).toBeFocused();
  });

  test("submits credentials only to the same-origin POST body and enters the app", async ({ page }) => {
    const consoleMessages: string[] = [];
    page.on("console", (message) => consoleMessages.push(message.text()));
    const worker = await mockWorker(page);
    await page.goto("./");
    await page.getByLabel("用户名").fill("admin");
    await page.getByLabel("密码").fill("fixture-password");
    await page.getByLabel("密码").press("Enter");
    await expect(page.getByText("Administrator")).toBeVisible();

    expect(worker.loginRequests).toHaveLength(1);
    const request = worker.loginRequests[0];
    expect(request.method).toBe("POST");
    expect(new URL(request.url).pathname).toBe("/api/auth");
    expect(new URL(request.url).search).toBe("");
    expect(request.headers.authorization).toBeUndefined();
    expect(request.body).toEqual({ username: "admin", password: "fixture-password" });
    expect(JSON.stringify(await page.context().storageState())).not.toContain("fixture-password");
    expect(consoleMessages.join("\n")).not.toContain("fixture-password");
  });

  test("announces invalid credentials and restores focus to the password", async ({ page }) => {
    await mockWorker(page, { rejectLogin: true });
    await page.goto("./");
    await page.getByLabel("用户名").fill("admin");
    await page.getByLabel("密码").fill("wrong-password");
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page.locator(".auth-error[role=alert]")).toHaveText("用户名或密码不正确。");
    await expect(page.getByLabel("密码")).toBeFocused();
  });
});

for (const entry of [
  { locale: "zh-CN", title: "访问受限", description: "请输入用户名和密码以继续", username: "用户名", password: "密码", submit: "登录" },
  { locale: "zh-TW", title: "存取受限", description: "請輸入使用者名稱和密碼以繼續", username: "使用者名稱", password: "密碼", submit: "登入" },
  { locale: "en-US", title: "Access restricted", description: "Enter your username and password to continue", username: "Username", password: "Password", submit: "Sign in" },
] as const) {
  test.describe(`login locale ${entry.locale}`, () => {
    test.use({ locale: entry.locale });
    test("renders localized labels", async ({ page }) => {
      await mockWorker(page);
      await page.goto("./");
      await expect(page.getByRole("heading", { name: entry.title })).toBeVisible();
      await expect(page.getByText(entry.description)).toBeVisible();
      await expect(page.getByLabel(entry.username)).toBeVisible();
      await expect(page.getByLabel(entry.password)).toBeVisible();
      await expect(page.getByRole("button", { name: entry.submit })).toBeVisible();
    });
  });
}
