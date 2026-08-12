import { expect, test, type BrowserContext, type Route } from "@playwright/test";
import axe from "axe-core";

const runtime = {
  release: { worker: "1.0.0", pages: "0.1.2", apiContract: 1 },
  site: { name: "UXUVideo", title: "UXUVideo", description: "Private video", iconUrl: "/icon.png" },
  capabilities: { premium: true, iptv: false, danmaku: false }, adKeywords: [],
  sources: { subscriptionSources: "", iptvSources: "", mergeSources: false, danmakuApiUrl: "" },
  thirdPartyScripts: { videoTogether: { enabled: false, scriptUrl: null, settingUrl: null } }, authenticated: true,
};

type Kind = "config" | "library";
type RemoteDocument = { kind: Kind; version: number; updatedAt: number; payload: Record<string, unknown> };
async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockWorker(context: BrowserContext) {
  let updateStatus: "update-available" | "up-to-date" | "ahead-of-remote" | "check-failed" = "update-available";
  const documents: Record<Kind, RemoteDocument> = {
    config: { kind: "config", version: 1, updatedAt: 1, payload: {
      fields: { rememberScrollPosition: { value: true, updatedAt: 1 } },
      sources: [{ id: "fixture-source", updatedAt: 1, name: "Fixture", baseUrl: "https://catalog.example", enabled: true }],
      subscriptions: [], tombstones: [],
    } },
    library: { kind: "library", version: 1, updatedAt: 1, payload: {
      history: [{ id: "watch-1", updatedAt: 1, title: "Watch fixture", mode: "standard" }],
      favorites: [{ id: "favorite-1", updatedAt: 1, title: "Favorite fixture", mode: "standard" }], tombstones: [],
    } },
  };
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/config") return json(route, runtime);
    if (path === "/api/auth/session") return json(route, { authenticated: true, session: {
      accountId: "data-account", profileId: "data-account", username: "data", name: "Data admin",
      role: "super_admin", customPermissions: [], mode: "managed",
    } });
    if (path === "/api/app-update") {
      if (updateStatus === "check-failed") return json(route, { status: updateStatus }, 503);
      return json(route, { status: updateStatus, currentVersion: "0.1.2", latestVersion: updateStatus === "update-available" ? "0.2.0" : "0.1.2",
        checkedAt: new Date().toISOString(), source: { changelogUrl: "https://github.com/example/UXUV-Pages/blob/main/CHANGELOG.md" } });
    }
    const kind: Kind | null = path === "/api/user/config" ? "config" : path === "/api/user/sync" ? "library" : null;
    if (kind && request.method() === "GET") return json(route, documents[kind]);
    if (kind && request.method() === "POST") {
      const body = request.postDataJSON() as { payload: Record<string, unknown> };
      documents[kind] = { kind, version: documents[kind].version + 1, updatedAt: Date.now(), payload: body.payload };
      return json(route, documents[kind]);
    }
    return json(route, { error: { code: "NOT_FOUND" } }, 404);
  });
  return { documents, setUpdateStatus: (status: typeof updateStatus) => { updateStatus = status; } };
}

async function english(page: import("@playwright/test").Page) {
  const display = page.locator('[data-settings-section="display"]');
  await display.getByRole("button", { name: /English/ }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
}

async function streamText(download: import("@playwright/test").Download) {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

test.describe("KVideo T19 data and update settings", () => {
  test.use({ locale: "zh-CN", timezoneId: "Asia/Taipei", colorScheme: "dark" });

  test("exports safe bytes and imports only after a complete transactional preview", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("uxuv-search-display:v1:data-account:standard", "grouped");
      localStorage.setItem("uxuv-search-policy:v1:data-account:standard", JSON.stringify({ sortBy: "date-desc", realtimeLatency: true, blockedCategories: ["blocked"] }));
      localStorage.setItem("uxuv-search-history:v1:data-account:standard", JSON.stringify([{ query: "fixture", timestamp: 10, resultCount: 2 }]));
      localStorage.setItem("uxuv-home-tags:v1:data-account:standard:movie", JSON.stringify(["热门", "电影"]));
      localStorage.setItem("uxuv-home-tags:v1:data-account:standard:tv", JSON.stringify(["热门", "剧集"]));
    });
    const worker = await mockWorker(page.context());
    await page.goto("./settings");
    await english(page);
    const data = page.locator('[data-settings-section="data"]');
    const exportButton = data.getByRole("button", { name: /Export settings/ });
    await exportButton.click();
    const exportDialog = page.getByRole("dialog", { name: "Export all settings data" });
    await expect(exportDialog.getByText("Passwords, cookies, and secrets are never included.")).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent("download"), exportDialog.getByRole("button", { name: "Download JSON" }).click()]);
    const exportedText = await streamText(download);
    const exported = JSON.parse(exportedText) as Record<string, unknown>;
    expect(exportedText).toBe(`${JSON.stringify(exported, null, 2)}\n`);
    expect(exported).toMatchObject({ schemaVersion: 2, product: "UXUVideo", mode: "all",
      included: { searchHistory: true, watchHistory: true } });
    expect(exportedText).not.toMatch(/password|passwd|cookie|authorization|access[_-]?token|private[_-]?key/i);
    await page.keyboard.press("Escape");
    await expect(exportButton).toBeFocused();

    await expect.poll(() => ((worker.documents.config.payload.fields as Record<string, { value: unknown }>).locale?.value)).toBe("en");
    const beforeConfig = JSON.stringify(worker.documents.config.payload);
    const beforeLibrary = JSON.stringify(worker.documents.library.payload);
    const importButton = data.getByRole("button", { name: /Import settings/ });
    await importButton.click();
    let importDialog = page.getByRole("dialog", { name: "Import all settings data" });
    const unsafe = JSON.stringify({ ...exported, password: "fixture-secret" });
    await importDialog.getByLabel("Paste JSON").fill(unsafe);
    await importDialog.getByRole("button", { name: "Validate and preview" }).click();
    await expect(importDialog.getByRole("alert")).toContainText("entire import was rejected");
    expect(JSON.stringify(worker.documents.config.payload)).toBe(beforeConfig);
    expect(JSON.stringify(worker.documents.library.payload)).toBe(beforeLibrary);

    await importDialog.getByLabel("Paste JSON").fill(JSON.stringify({ ...exported, mode: "premium" }));
    await importDialog.getByRole("button", { name: "Validate and preview" }).click();
    await expect(importDialog.getByRole("alert")).toContainText("Premium-mode data cannot be imported");
    await importDialog.getByLabel("Paste JSON").evaluate((node) => {
      const textarea = node as HTMLTextAreaElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(textarea, "x".repeat(1024 * 1024 + 1));
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await importDialog.getByRole("button", { name: "Validate and preview" }).click();
    await expect(importDialog.getByRole("alert")).toContainText("1 MiB");

    const valid = structuredClone(exported) as {
      config: { fields: Record<string, unknown> }; library: { favorites: Array<Record<string, unknown>> };
      preferences: { standard: { searchDisplayMode: string; searchPolicy: Record<string, unknown> } };
    };
    valid.config.fields.importedFlag = { value: true, updatedAt: 20 };
    valid.library.favorites.push({ id: "favorite-imported", updatedAt: 20, title: "Imported", mode: "standard" });
    valid.preferences.standard.searchDisplayMode = "normal";
    valid.preferences.standard.searchPolicy = { sortBy: "name-asc", realtimeLatency: false, blockedCategories: [] };
    const validText = JSON.stringify(valid);
    await importDialog.getByLabel("Paste JSON").fill(validText);
    await importDialog.getByRole("button", { name: "Validate and preview" }).click();
    await expect(importDialog.getByRole("heading", { name: "Import preview" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(importButton).toBeFocused();
    expect(JSON.stringify(worker.documents.config.payload)).toBe(beforeConfig);

    await importButton.click();
    importDialog = page.getByRole("dialog", { name: "Import all settings data" });
    await importDialog.getByLabel("Paste JSON").fill(validText);
    await importDialog.getByRole("button", { name: "Validate and preview" }).click();
    await importDialog.getByRole("button", { name: "Confirm import" }).click();
    await expect(importDialog.getByRole("status")).toContainText("waiting to sync");
    await expect.poll(() => (worker.documents.config.payload.fields as Record<string, { value: unknown }>).importedFlag?.value).toBe(true);
    await expect.poll(() => (worker.documents.library.payload.favorites as Array<{ id: string }>).some(({ id }) => id === "favorite-imported")).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem("uxuv-search-display:v1:data-account:standard"))).toBe("normal");
  });

  test("renders three update outcomes and keeps dialogs operable at TV and mobile widths", async ({ page }) => {
    const worker = await mockWorker(page.context());
    await page.goto("./settings");
    await english(page);
    const updateEntry = page.getByRole("button", { name: "View version and updates" });
    await updateEntry.click();
    const version = page.getByRole("dialog", { name: "Version and updates" });
    await expect(version.getByText("Update available", { exact: true })).toBeVisible();
    worker.setUpdateStatus("up-to-date");
    await version.getByRole("button", { name: "Check again" }).click();
    await expect(version.getByText("Up to date", { exact: true })).toBeVisible();
    worker.setUpdateStatus("ahead-of-remote");
    await version.getByRole("button", { name: "Check again" }).click();
    await expect(version.getByText("Local version is newer", { exact: true })).toBeVisible();
    worker.setUpdateStatus("check-failed");
    await version.getByRole("button", { name: "Check again" }).click();
    await expect(version.getByText("Update check failed", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(version).toBeHidden();
    await expect(updateEntry).toBeFocused();

    const data = page.locator('[data-settings-section="data"]');
    await data.getByRole("button", { name: /Import settings/ }).click();
    const dialog = page.getByRole("dialog", { name: "Import all settings data" });
    await expect(dialog.getByLabel("Paste JSON")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByLabel("Or choose a JSON file")).toBeFocused();
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(dialog).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () => {
      const result = await (window as unknown as { axe: typeof import("axe-core") }).axe.run(document,
        { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
      return result.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
    });
    expect(violations).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(data.getByRole("button", { name: /Import settings/ })).toBeFocused();
  });
});
