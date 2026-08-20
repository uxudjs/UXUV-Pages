import { expect, test, type BrowserContext, type Route } from "@playwright/test";
import axe from "axe-core";

const runtimeConfig = {
  release: { worker: "1.0.0", pages: "0.1.2", apiContract: 1 },
  site: { name: "UXUVideo", title: "UXUVideo", description: "Private video", iconUrl: "/icon.png" },
  capabilities: { premium: true, danmaku: false }, adKeywords: [],
  thirdPartyScripts: { videoTogether: { enabled: false, scriptUrl: null, settingUrl: null } }, authenticated: true,
};

const existingSource = {
  id: "existing", updatedAt: 1, name: "Existing source", baseUrl: "https://existing.example/api",
  searchPath: "/api.php/provide/vod/", detailPath: "/api.php/provide/vod/", enabled: true,
  group: "normal", kind: "subscription", priority: 1,
};
const premiumSource = {
  id: "premium-sub-source", updatedAt: 1, name: "Premium subscription source", baseUrl: "https://premium-subscription.example/api",
  searchPath: "/api.php/provide/vod/", detailPath: "/api.php/provide/vod/", enabled: true,
  group: "premium", kind: "subscription", priority: 1,
};
const premiumSubscription = {
  id: "premium-subscription", updatedAt: 1, lastUpdated: 1, name: "Premium subscription",
  url: "https://safe.example/premium-subscription.json", sourceIds: ["premium-sub-source"], mode: "premium",
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockWorker(context: BrowserContext) {
  let subscriptionReads = 0;
  let config = { kind: "config", version: 1, updatedAt: 1,
    payload: { fields: {}, sources: [existingSource, premiumSource], subscriptions: [premiumSubscription], tombstones: [] as unknown[] } };
  const library = { kind: "library", version: 1, updatedAt: 1,
    payload: { history: [], favorites: [], tombstones: [] } };
  const importedUrls: string[] = [];
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === "/api/config") return json(route, runtimeConfig);
    if (path === "/api/auth/session") return json(route, { authenticated: true, session: {
      accountId: "import-user", profileId: "import-user", username: "import-user", name: "Import user",
      role: "viewer", customPermissions: [], mode: "managed",
    } });
    if (path === "/api/user/config" && method === "GET") return json(route, config);
    if (path === "/api/user/config" && method === "POST") {
      const body = request.postDataJSON() as { payload: typeof config.payload };
      config = { kind: "config", version: config.version + 1, updatedAt: Date.now(), payload: body.payload };
      return json(route, config);
    }
    if (path === "/api/user/sync") return json(route, library);
    if (path === "/api/source-import") {
      expect(method).toBe("POST");
      expect(request.headers()["content-type"]).toContain("application/json");
      const body = request.postDataJSON() as { url: string };
      importedUrls.push(body.url);
      if (body.url.includes("127.0.0.1")) return json(route, { error: { code: "UPSTREAM_URL_BLOCKED" } }, 400);
      if (body.url.includes("subscription")) {
        subscriptionReads += 1;
        if (subscriptionReads === 2) return json(route, { error: { code: "UPSTREAM_UNAVAILABLE" } }, 502);
        return json(route, { text: JSON.stringify([{
          id: subscriptionReads === 1 ? "sub-source" : "sub-source-next",
          name: subscriptionReads === 1 ? "Subscription source" : "Subscription source replaced",
          baseUrl: "https://subscription-media.example/api",
        }]) });
      }
      return json(route, { text: JSON.stringify([{ id: "link-source", name: "Link source", baseUrl: "https://link-media.example/api" }]) });
    }
    return json(route, { error: { code: "NOT_FOUND" } }, 404);
  });
  return { importedUrls, config: () => config };
}

async function openImporter(page: import("@playwright/test").Page) {
  const section = page.locator('[data-settings-section="sources"]');
  await section.locator(".source-import-button").click();
  return page.locator(".import-modal");
}

test.describe("KVideo T16 source import and subscriptions", () => {
  test.use({ locale: "zh-CN", timezoneId: "Asia/Taipei", colorScheme: "dark" });

  test("previews four import paths, rejects unsafe input, manages subscriptions, and restores TV focus", async ({ page }) => {
    const worker = await mockWorker(page.context());
    const externalFetches: string[] = [];
    page.on("request", (request) => {
      const target = new URL(request.url());
      if (["fetch", "xhr"].includes(request.resourceType()) && target.origin !== "http://127.0.0.1:4173") externalFetches.push(request.url());
    });
    await page.goto("./settings");
    const section = page.locator('[data-settings-section="sources"]');
    const importButton = section.locator(".source-import-button");
    let modal = await openImporter(page);
    await expect(modal.getByRole("tab", { name: "JSON 粘贴" })).toBeFocused();

    const jsonInput = modal.getByLabel("粘贴来源 JSON");
    await jsonInput.fill(JSON.stringify([{ id: "secret-source", name: "Secret", baseUrl: "https://secret.example/api", token: "do-not-import" }]));
    await modal.getByRole("button", { name: "校验并预览" }).click();
    await expect(modal.getByRole("alert")).toContainText("已拒绝整个导入");
    await expect(section.getByText("Secret", { exact: true })).toHaveCount(0);

    await jsonInput.fill(JSON.stringify([
      { id: "existing", name: "Duplicate", baseUrl: "https://duplicate.example/api" },
      { id: "json-source", name: "JSON source", baseUrl: "https://json.example/api" },
      { id: "broken", name: "Broken", baseUrl: "file:///private" },
    ]));
    await modal.getByRole("button", { name: "校验并预览" }).click();
    const preview = modal.locator(".import-preview");
    await expect(preview).toContainText("总计: 3");
    await expect(preview).toContainText("有效: 1");
    await expect(preview).toContainText("重复: 1");
    await expect(preview).toContainText("无效: 1");
    await preview.getByRole("button", { name: "导入有效来源" }).click();
    await expect(section.getByText("JSON source", { exact: true })).toBeVisible();
    await expect(section.getByText("Existing source", { exact: true })).toBeVisible();

    await modal.getByRole("tab", { name: "文件", exact: true }).click();
    await modal.getByLabel("选择 JSON 文件").setInputFiles({
      name: "sources.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify([{ id: "file-source", name: "File source", baseUrl: "https://file.example/api" }])),
    });
    await expect(modal.locator(".import-preview")).toContainText("File source");
    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);
    await expect(importButton).toBeFocused();
    await expect(section.getByText("File source", { exact: true })).toHaveCount(0);

    modal = await openImporter(page);
    await modal.getByRole("tab", { name: "链接", exact: true }).click();
    const linkInput = modal.getByLabel("来源链接");
    await linkInput.fill("http://127.0.0.1/private.json");
    await modal.getByRole("button", { name: "校验并预览" }).click();
    await expect(modal.getByRole("alert")).toContainText("无法安全读取");
    await linkInput.fill("https://safe.example/sources.json");
    await modal.getByRole("button", { name: "校验并预览" }).click();
    await modal.locator(".import-preview").getByRole("button", { name: "导入有效来源" }).click();
    await expect(section.getByText("Link source", { exact: true })).toBeVisible();

    await modal.getByRole("tab", { name: "订阅", exact: true }).click();
    await modal.getByLabel("订阅名称").fill("My subscription");
    await modal.getByLabel("订阅链接").fill("https://safe.example/subscription.json");
    await modal.getByRole("button", { name: "预览并添加订阅" }).click();
    await expect(modal.locator(".import-preview")).toContainText("Subscription source");
    await modal.locator(".import-preview").getByRole("button", { name: "导入有效来源" }).click();
    await expect(modal.getByText("My subscription", { exact: true })).toBeVisible();
    await expect(modal.getByText("Premium subscription", { exact: true })).toHaveCount(0);
    await expect(section.locator(".source-subscription-summary").getByText("My subscription", { exact: true })).toBeVisible();
    await expect(section.locator(".source-subscription-summary")).toContainText("https://safe.example/subscription.json");
    await expect(section.getByText("Subscription source", { exact: true })).toBeVisible();
    await expect(section.locator(".source-manager-row").filter({ hasText: "Subscription source" })
      .locator(".source-kind-subscription")).toHaveCount(1);
    await expect.poll(() => worker.config().payload.subscriptions.find(({ id }) => id !== "premium-subscription")?.sourceIds).toEqual(["sub-source"]);
    type SubscriptionRecord = typeof premiumSubscription & { lastError?: string };
    const firstSubscription = worker.config().payload.subscriptions.find(({ id }) => id !== "premium-subscription") as SubscriptionRecord;
    await modal.getByRole("button", { name: "更新", exact: true }).click();
    await expect(modal.getByRole("alert")).toContainText("无法安全读取");
    await expect.poll(() => (worker.config().payload.subscriptions.find(({ id }) => id === firstSubscription.id) as SubscriptionRecord | undefined)?.lastError).toBe("request");
    expect(worker.config().payload.sources.some(({ id }) => id === "sub-source")).toBe(true);
    expect(worker.config().payload.subscriptions.find(({ id }) => id === firstSubscription.id)?.lastUpdated).toBe(firstSubscription.lastUpdated);

    await modal.getByRole("button", { name: "更新", exact: true }).click();
    await expect(modal.locator(".import-preview")).toContainText("Subscription source replaced");
    expect(worker.config().payload.sources.some(({ id }) => id === "sub-source")).toBe(true);
    expect(worker.config().payload.tombstones.some((entry) => (entry as { id?: string }).id === "sub-source")).toBe(false);
    await modal.locator(".import-preview").getByRole("button", { name: "导入有效来源" }).click();
    await expect(section.getByText("Subscription source replaced", { exact: true })).toBeVisible();
    await expect.poll(() => worker.config().payload.subscriptions.find(({ id }) => id === firstSubscription.id)?.sourceIds).toEqual(["sub-source-next"]);
    const refreshed = worker.config().payload.subscriptions.find(({ id }) => id === firstSubscription.id) as SubscriptionRecord;
    expect(refreshed.lastUpdated).toBeGreaterThan(firstSubscription.lastUpdated);
    expect(refreshed.lastError).toBeUndefined();
    expect(worker.config().payload.sources.some(({ id }) => id === "sub-source")).toBe(false);
    expect(worker.config().payload.tombstones.some((entry) => (entry as { id?: string }).id === "sub-source")).toBe(true);
    expect(worker.config().payload.sources.find(({ id }) => id === "sub-source-next")).toMatchObject({ kind: "subscription", group: "normal" });
    expect(worker.config().payload.sources.find(({ id }) => id === "premium-sub-source")).toEqual(premiumSource);
    expect(worker.config().payload.subscriptions.find(({ id }) => id === "premium-subscription")).toEqual(premiumSubscription);

    await modal.getByRole("button", { name: "删除 My subscription" }).click();
    const confirmation = modal.getByRole("alertdialog", { name: "删除此订阅？" });
    await confirmation.getByRole("button", { name: "删除", exact: true }).click();
    await expect(modal.getByText("尚无订阅。")).toBeVisible();
    await expect(section.getByText("Subscription source replaced", { exact: true })).toBeVisible();

    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(modal).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await modal.getByRole("button", { name: "关闭导入窗口" }).focus();
    await page.keyboard.press("Shift+Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);

    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () => {
      const result = await (window as unknown as { axe: typeof import("axe-core") }).axe.run(document,
        { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
      return result.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
    });
    expect(violations).toEqual([]);

    await page.keyboard.press("Escape");
    const display = page.locator('[data-settings-section="display"]');
    await display.getByRole("button", { name: /繁體中文/ }).click();
    modal = await openImporter(page);
    await expect(page.getByRole("dialog", { name: "匯入影片來源" })).toBeVisible();
    await page.keyboard.press("Escape");
    await display.getByRole("button", { name: /English/ }).click();
    modal = await openImporter(page);
    await expect(page.getByRole("dialog", { name: "Import video sources" })).toBeVisible();

    expect(worker.importedUrls).toEqual([
      "http://127.0.0.1/private.json", "https://safe.example/sources.json",
      "https://safe.example/subscription.json", "https://safe.example/subscription.json", "https://safe.example/subscription.json",
    ]);
    expect(externalFetches).toEqual([]);
    const saved = worker.config().payload;
    expect(saved.sources.some(({ id }) => id === "existing")).toBe(true);
    expect(saved.sources.some(({ id }) => id === "file-source")).toBe(false);
    expect(saved.sources.find(({ id }) => id === "sub-source-next")).toMatchObject({ kind: "subscription", group: "normal" });
    expect(saved.subscriptions).toEqual([premiumSubscription]);
  });
});
