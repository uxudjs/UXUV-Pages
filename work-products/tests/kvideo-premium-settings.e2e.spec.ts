import { expect, test, type BrowserContext, type Download, type Page, type Route } from "@playwright/test";
import axe from "axe-core";

const runtime = {
  release: { worker: "1.0.0", pages: "0.1.2", apiContract: 1 }, site: { name: "UXUVideo", title: "UXUVideo", description: "Private", iconUrl: "/icon.png" },
  capabilities: { premium: true, danmaku: true }, adKeywords: [],
  thirdPartyScripts: { videoTogether: { enabled: false, scriptUrl: null, settingUrl: null } }, authenticated: true,
};
type Kind = "config" | "library";
type TestRecord = { id: string; [key: string]: unknown };
type TestPayload = { fields: Record<string, { value: unknown; updatedAt: number }>; sources: TestRecord[]; subscriptions: TestRecord[];
  tombstones: TestRecord[]; history: TestRecord[]; favorites: TestRecord[] };
type Document = { kind: Kind; version: number; updatedAt: number; payload: TestPayload };
type FullExport = { schemaVersion: number; mode: string; config: { fields: Record<string, { value: unknown; updatedAt: number }>; sources: TestRecord[] };
  preferences: { standard: Record<string, unknown>; premium: Record<string, unknown> }; [key: string]: unknown };
const standardSource = { id: "standard-one", updatedAt: 1, name: "Standard source", baseUrl: "https://standard.example", enabled: true, group: "normal", priority: 1 };
const premiumSource = { id: "premium-one", updatedAt: 1, name: "Premium source", baseUrl: "https://premium.example", enabled: true, group: "premium", priority: 1 };
const settingsDomains = ["account", "sources", "playback", "display", "sync", "data"] as const;

async function json(route: Route, body: unknown, status = 200) { await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }); }
async function mockWorker(context: BrowserContext, initiallyAuthorized = false) {
  let authorized = initiallyAuthorized;
  const documents: Record<Kind, Document> = {
    config: { kind: "config", version: 1, updatedAt: 1, payload: { fields: {
      proxyMode: { value: "none", updatedAt: 1 }, "premium.proxyMode": { value: "retry", updatedAt: 1 },
    }, sources: [standardSource, premiumSource], subscriptions: [],
      tombstones: [{ id: "premium-deleted-source", collection: "sources", deletedAt: 1 }], history: [], favorites: [] } },
    library: { kind: "library", version: 1, updatedAt: 1, payload: {
      history: [{ id: "standard-watch", updatedAt: 1, mode: "standard", title: "Standard" }, { id: "premium:watch", updatedAt: 1, mode: "premium", title: "Premium" }],
      favorites: [{ id: "standard-fav", updatedAt: 1, mode: "standard", title: "Standard" }, { id: "premium:fav", updatedAt: 1, mode: "premium", title: "Premium" }],
      fields: {}, sources: [], subscriptions: [],
      tombstones: [{ id: "premium:deleted-favorite", collection: "favorites", deletedAt: 1 }],
    } },
  };
  const passwords: unknown[] = [];
  await context.route("**/api/**", async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname; const method = request.method();
    if (path === "/api/config") return json(route, runtime);
    if (path === "/api/auth/session") return json(route, { authenticated: true, session: { accountId: "premium-account", profileId: "premium-account", username: "admin", name: "Admin", role: "super_admin", customPermissions: [], mode: "managed" } });
    if (path === "/api/auth" && method === "POST") {
      const body = request.postDataJSON(); passwords.push(body);
      if ((body as { password?: string }).password !== "premium-password") return json(route, { error: { code: "INVALID_PREMIUM_CREDENTIALS" } }, 401);
      authorized = true; return json(route, { valid: true });
    }
    if (path === "/api/premium/types") return authorized
      ? json(route, { tags: [{ id: "recommend", label: "Recommend", value: "" }], capability: { profile: "paid", limits: { sources: 32, searchConcurrency: 8, maxPages: 3, videos: 2000, probeVideos: 100, probeConcurrency: 4, probeVariants: 4 } } })
      : json(route, { error: { code: "PREMIUM_REQUIRED", message: "Premium access is required." } }, 403);
    if (path === "/api/app-update") return json(route, { currentVersion: "1.0.0", latestVersion: "1.0.0", status: "up-to-date" });
    if (path === "/api/auth/accounts") return json(route, { loginMode: "managed", managed: true, accounts: [], totalCount: 0 });
    if (path === "/api/admin/usage") return json(route, { data: { configured: false, missing: [], message: "Not configured" } });
    const kind: Kind | null = path === "/api/user/config" ? "config" : path === "/api/user/sync" ? "library" : null;
    if (kind && method === "GET") return json(route, documents[kind]);
    if (kind && method === "POST") {
      const body = request.postDataJSON() as { payload: TestPayload };
      documents[kind] = { kind, version: documents[kind].version + 1, updatedAt: Date.now(), payload: body.payload };
      return json(route, documents[kind]);
    }
    return json(route, { error: { code: "NOT_FOUND" } }, 404);
  });
  return { documents, passwords, expire: () => { authorized = false; } };
}

async function chooseEnglish(page: Page) {
  await page.locator('[data-settings-section="display"]').getByRole("button", { name: /English/ }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
}
async function openPremiumImporter(page: Page) {
  const sources = page.locator('[data-settings-section="premium-sources"]');
  await sources.locator(".source-heading-actions .primary-button").click();
  await page.locator(".source-modal-import").click();
  return page.locator(".import-modal");
}
async function downloadText(download: Download) {
  const stream = await download.createReadStream(); const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

test.describe("KVideo T20 Premium settings", () => {
  test.use({ locale: "zh-CN", timezoneId: "Asia/Taipei", colorScheme: "dark" });

  test("fails closed on server authorization and isolates Premium source and player changes", async ({ page }) => {
    const worker = await mockWorker(page.context());
    await page.goto("./premium/settings/");
    await expect(page.getByRole("heading", { name: "高级模式设置" })).toBeVisible();
    await expect(page.locator('[data-settings-section="premium-sources"]')).toHaveCount(0);
    await expect(page.locator(".settings-anchor-nav")).toHaveCount(0);
    await expect(page.locator(".settings-domain")).toHaveCount(0);
    await page.getByLabel("Premium 密码").fill("bad");
    await page.getByRole("button", { name: "验证" }).click();
    await expect(page.getByText("Premium 验证失败。")).toBeVisible();
    await page.getByLabel("Premium 密码").fill("premium-password");
    await page.getByRole("button", { name: "验证" }).click();
    const domains = page.locator(".settings-domain-list > .settings-domain");
    await expect(domains).toHaveCount(settingsDomains.length);
    for (const [index, domain] of settingsDomains.entries()) await expect(domains.nth(index)).toHaveAttribute("data-settings-domain", domain);
    const sources = page.locator('[data-settings-section="premium-sources"]');
    await expect(sources.getByText("Premium source", { exact: true })).toBeVisible();
    await expect(sources.getByText("Standard source", { exact: true })).toHaveCount(0);
    await page.locator('[data-settings-section="display"]').getByRole("button", { name: /繁體中文/ }).click();
    await expect(page.getByRole("heading", { name: "進階模式設定" })).toBeVisible();
    await chooseEnglish(page);
    const player = page.locator('[data-settings-section="player"]');
    const danmaku = page.locator('[data-settings-section="danmaku-apis"]');
    await expect(danmaku.locator(".danmaku-api-empty")).toContainText("No danmaku APIs");
    await expect(player.getByLabel("Enable danmaku")).toBeDisabled();
    await expect(player.locator(".player-danmaku-api")).toHaveCount(0);
    await danmaku.getByLabel("API name").fill("Premium API");
    await danmaku.getByLabel("API URL (https://…)").fill("https://premium-danmaku.example/api");
    await danmaku.getByRole("button", { name: "Add", exact: true }).click();
    await expect(player.getByLabel("Enable danmaku")).toBeDisabled();
    await danmaku.getByRole("button", { name: "Set as preferred Premium API" }).click();
    await expect(player.getByLabel("Enable danmaku")).toBeEnabled();
    await player.getByLabel("Enable danmaku").check();
    await expect.poll(() => worker.documents.config.payload.fields["premium.activeDanmakuApiId"]?.value).toMatch(/^danmaku-/);
    await expect.poll(() => worker.documents.config.payload.fields["premium.danmakuEnabled"]?.value).toBe(true);
    expect(worker.documents.config.payload.fields.activeDanmakuApiId).toBeUndefined();
    expect(worker.documents.config.payload.fields.danmakuEnabled).toBeUndefined();

    await sources.getByRole("button", { name: "Add source" }).click();
    const add = page.getByRole("dialog", { name: "Add Premium video source" });
    await add.getByLabel("Source name").fill("Premium extra");
    await add.getByLabel("API URL").fill("https://premium-extra.example/api");
    await add.getByRole("button", { name: "Add", exact: true }).click();
    await expect(sources.getByText("Premium extra", { exact: true })).toBeVisible();

    const importer = await openPremiumImporter(page);
    await importer.getByLabel("Paste source JSON").fill(JSON.stringify([{ id: "premium-imported", name: "Premium imported", baseUrl: "https://premium-imported.example" }]));
    await importer.getByRole("button", { name: "Validate and preview" }).click();
    await importer.getByRole("button", { name: "Import valid sources" }).click();
    await page.keyboard.press("Escape");
    await expect(sources.getByText("Premium imported", { exact: true })).toBeVisible();
    await expect.poll(() => worker.documents.config.payload.sources.find(({ id }: { id: string }) => id === "premium-imported")?.group).toBe("premium");

    await player.getByLabel("Playback proxy mode").selectOption("always");
    await expect.poll(() => worker.documents.config.payload.fields["premium.proxyMode"]?.value).toBe("always");
    expect(worker.documents.config.payload.fields.proxyMode.value).toBe("none");
    const display = page.locator('[data-settings-section="display"]');
    await display.getByLabel("Search result display").selectOption("grouped");
    expect(await page.evaluate(() => localStorage.getItem("uxuv-search-display:v1:premium-account:premium"))).toBe("grouped");
    expect(await page.evaluate(() => localStorage.getItem("uxuv-search-display:v1:premium-account:standard"))).toBeNull();

    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      if (width >= 1024) await expect(page.locator(".settings-anchor-nav")).toBeVisible();
      else await expect(page.locator(".settings-anchor-nav")).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 1024, height: 1000 });
    const undersized = await page.locator(".settings-domain-list button:visible, .settings-domain-list input:visible, .settings-domain-list select:visible, .settings-anchor-nav a:visible")
      .evaluateAll((elements) => elements.flatMap((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width + 0.01 < 44 || rect.height + 0.01 < 44 ? [`${element.tagName}:${rect.width}x${rect.height}`] : [];
      }));
    expect(undersized).toEqual([]);
    await page.setViewportSize({ width: 640, height: 1000 });
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
    const premiumViolations = await page.evaluate(async () => (await (window as unknown as { axe: typeof import("axe-core") }).axe.run(document)).violations
      .filter(({ impact }) => impact === "serious" || impact === "critical"));
    expect(premiumViolations).toEqual([]);

    worker.expire();
    await page.getByRole("link", { name: "Verify access again" }).click();
    await expect(page.getByLabel("Premium password")).toBeVisible();
    await expect(page.locator('[data-settings-section="premium-sources"]')).toHaveCount(0);
    await expect(page.locator('[data-settings-section="danmaku-apis"]')).toHaveCount(0);
    await expect(page.locator(".settings-anchor-nav")).toHaveCount(0);
    await expect(page.locator(".settings-domain")).toHaveCount(0);
    expect(worker.passwords).toEqual([{ type: "premium", password: "bad" }, { type: "premium", password: "premium-password" }]);
  });

  test("round-trips both modes and preserves Premium data when importing a v1 standard backup", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("uxuv-search-display:v1:premium-account:standard", "grouped");
      localStorage.setItem("uxuv-search-display:v1:premium-account:premium", "normal");
      localStorage.setItem("uxuv-search-policy:v1:premium-account:standard", JSON.stringify({ sortBy: "date-desc", realtimeLatency: false, blockedCategories: [] }));
      localStorage.setItem("uxuv-search-policy:v1:premium-account:premium", JSON.stringify({ sortBy: "name-asc", realtimeLatency: true, blockedCategories: ["premium-blocked"] }));
    });
    const worker = await mockWorker(page.context(), true);
    await page.goto("./settings/"); await chooseEnglish(page);
    const data = page.locator('[data-settings-section="data"]');
    await data.getByRole("button", { name: /Export settings/ }).click();
    const dialog = page.getByRole("dialog", { name: "Export all settings data" });
    const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download JSON" }).click()]);
    const full = JSON.parse(await downloadText(download)) as FullExport;
    expect(full).toMatchObject({ schemaVersion: 2, mode: "all", preferences: {
      standard: { searchDisplayMode: "grouped" }, premium: { searchDisplayMode: "normal", searchPolicy: { sortBy: "name-asc" } },
    } });
    expect(full.config.sources.map(({ id }: { id: string }) => id)).toEqual(["standard-one", "premium-one"]);
    await page.keyboard.press("Escape");

    full.config.fields.standardImported = { value: true, updatedAt: 2 };
    full.config.fields["premium.imported"] = { value: true, updatedAt: 2 };
    full.preferences.standard.searchDisplayMode = "normal";
    full.preferences.premium.searchDisplayMode = "grouped";
    await data.getByRole("button", { name: /Import settings/ }).click();
    let importer = page.getByRole("dialog", { name: "Import all settings data" });
    await importer.getByLabel("Paste JSON").fill(JSON.stringify(full));
    await importer.getByRole("button", { name: "Validate and preview" }).click();
    await importer.getByRole("button", { name: "Confirm import" }).click();
    await expect.poll(() => worker.documents.config.payload.fields["premium.imported"]?.value).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem("uxuv-search-display:v1:premium-account:standard"))).toBe("normal");
    expect(await page.evaluate(() => localStorage.getItem("uxuv-search-display:v1:premium-account:premium"))).toBe("grouped");
    await page.keyboard.press("Escape");

    const standardOnly = { schemaVersion: 1, product: "UXUVideo", mode: "standard", exportedAt: new Date().toISOString(),
      included: { searchHistory: true, watchHistory: true },
      config: { fields: { v1Imported: { value: true, updatedAt: 3 } }, sources: [standardSource], subscriptions: [], tombstones: [] },
      library: { history: [{ id: "v1-watch", updatedAt: 3, mode: "standard" }], favorites: [{ id: "v1-fav", updatedAt: 3, mode: "standard" }], tombstones: [] },
      preferences: { searchDisplayMode: "grouped", searchPolicy: { sortBy: "default", realtimeLatency: false, blockedCategories: [] }, searchHistory: [], homeTags: { movie: [], tv: [] } } };
    await data.getByRole("button", { name: /Import settings/ }).click();
    importer = page.getByRole("dialog", { name: "Import all settings data" });
    await importer.getByLabel("Paste JSON").fill(JSON.stringify(standardOnly));
    await importer.getByRole("button", { name: "Validate and preview" }).click();
    await importer.getByRole("button", { name: "Confirm import" }).click();
    await expect.poll(() => worker.documents.config.payload.fields.v1Imported?.value).toBe(true);
    expect(worker.documents.config.payload.fields["premium.imported"]?.value).toBe(true);
    expect(worker.documents.config.payload.sources.some(({ id }: { id: string }) => id === "premium-one")).toBe(true);
    expect(worker.documents.library.payload.favorites.some(({ id }: { id: string }) => id === "premium:fav")).toBe(true);
    expect(worker.documents.config.payload.tombstones.some(({ id }: { id: string }) => id === "premium-deleted-source")).toBe(true);
    expect(worker.documents.library.payload.tombstones.some(({ id }: { id: string }) => id === "premium:deleted-favorite")).toBe(true);

    for (const width of [320, 768, 1024, 1440]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () => (await (window as unknown as { axe: typeof import("axe-core") }).axe.run(document)).violations
      .filter(({ impact }) => impact === "serious" || impact === "critical"));
    expect(violations).toEqual([]);
  });
});
