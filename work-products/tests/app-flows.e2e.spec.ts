import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";

test.use({ locale: "zh-CN", timezoneId: "Asia/Taipei" });

const adminSession = {
  accountId: "admin-1",
  profileId: "admin-1",
  username: "admin",
  name: "Administrator",
  role: "super_admin",
  customPermissions: [],
  mode: "managed",
};

const runtimeConfig = {
  release: { worker: "1.0.0", pages: "0.1.2", apiContract: 1 },
  site: { name: "UXUVideo", title: "UXUVideo", description: "Private video", iconUrl: "/icon.png" },
  capabilities: { premium: true, danmaku: false },
  adKeywords: [],
  thirdPartyScripts: {
    videoTogether: { enabled: false, scriptUrl: null, settingUrl: null },
  },
  authenticated: false,
};
const paidCapability = {
  profile: "paid",
  limits: { sources: 32, searchConcurrency: 6, maxPages: 3, videos: 2000, probeVideos: 50, probeConcurrency: 6, probeVariants: 4 },
};
const freeCapability = {
  profile: "free",
  limits: { sources: 12, searchConcurrency: 5, maxPages: 3, videos: 500, probeVideos: 6, probeConcurrency: 3, probeVariants: 2 },
};
const unconfiguredUsage = {
  data: {
    configured: false,
    missing: ["CF_ANALYTICS_API_TOKEN", "CF_ACCOUNT_ID"],
    message: "Cloudflare usage analytics is not configured.",
  },
};
const homeSubjects = {
  subjects: [
    { id: "home-1", title: "示例电影", cover: "placeholder-poster.svg", rate: "8.8", url: "" },
  ],
};

const account = (id: string, username: string, name: string, role = "viewer") => ({
  id,
  username,
  name,
  role,
  customPermissions: [],
  createdAt: 1,
  updatedAt: 1,
});

interface MockDocument {
  kind: "config" | "library";
  version: number;
  updatedAt: number | null;
  payload: Record<string, unknown> & { tombstones: unknown[] };
}

interface MockConfigRecord {
  id: string;
  updatedAt: number;
  [key: string]: unknown;
}

interface MockConfigPayload {
  fields: Record<string, { value: unknown; updatedAt: number }>;
  sources: MockConfigRecord[];
  subscriptions: MockConfigRecord[];
  tombstones: Array<{ collection: string; id: string; deletedAt: number }>;
}

interface MockLibraryPayload {
  history: MockConfigRecord[];
  favorites: MockConfigRecord[];
  tombstones: Array<{ collection: string; id: string; deletedAt: number }>;
}

const emptyDocument = (kind: "config" | "library"): MockDocument => ({
  kind,
  version: 0,
  updatedAt: null,
  payload: kind === "config"
    ? { fields: {}, sources: [], subscriptions: [], tombstones: [] }
    : { history: [], favorites: [], tombstones: [] },
});

async function fulfill(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function capturePageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function expectNoLocalStorage(page: Page) {
  const state = await page.context().storageState();
  expect(state.origins.flatMap((origin) => origin.localStorage)).toEqual([]);
}

async function expectOnlyAccountSyncStorage(page: Page, accountId: string) {
  const state = await page.context().storageState();
  const entries = state.origins.flatMap((origin) => origin.localStorage);
  expect(entries.map(({ name }) => name).sort()).toEqual([
    `uxuv-locale:${accountId}`,
    "uxuv-player-settings-account-migration-v1",
    `uxuv-sync-v1:${accountId}:config`,
    `uxuv-sync-v1:${accountId}:library`,
    `uxuv-theme:${accountId}`,
  ]);
  expect(JSON.stringify(entries)).not.toContain("admin-password");
}

function localeChoice(page: Page, value: "zh-CN" | "zh-TW" | "en") {
  const label = value === "zh-CN" ? "简体中文" : value === "zh-TW" ? "繁體中文" : "English";
  return page.locator('[data-settings-section="display"]').getByRole("button", { name: new RegExp(label) });
}

async function mockWorkerAuth(page: Page) {
  let authenticated = false;
  let accounts = [account("admin-1", "admin", "Administrator", "super_admin")];
  const documents = { config: emptyDocument("config"), library: emptyDocument("library") };
  const mutations: Array<{ method: string; path: string; body: unknown }> = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const body = request.postDataJSON?.() ?? null;

    if (path === "/api/config" && method === "GET") {
      return fulfill(route, { ...runtimeConfig, authenticated });
    }
    if (path === "/api/auth" && method === "POST") {
      mutations.push({ method, path, body });
      authenticated = true;
      return fulfill(route, { valid: true, session: adminSession });
    }
    if (path === "/api/auth/session" && method === "GET") {
      return fulfill(route, authenticated
        ? { authenticated: true, session: adminSession }
        : { authenticated: false, session: null });
    }
    if (path === "/api/auth/session" && method === "DELETE") {
      authenticated = false;
      mutations.push({ method, path, body });
      return fulfill(route, { success: true });
    }
    if (path === "/api/auth/accounts" && method === "GET") {
      return fulfill(route, { loginMode: "managed", managed: true, accounts, totalCount: accounts.length });
    }
    if (path === "/api/admin/usage" && method === "GET") return fulfill(route, unconfiguredUsage);
    if (path === "/api/app-update" && method === "GET") return fulfill(route, {
      currentVersion: "1.0.0", latestVersion: "1.0.0", status: "up-to-date", checkedRemotely: true,
      source: { changelogUrl: "https://github.com/uxudjs/UXUVideo/blob/main/CHANGELOG.md" },
    });
    if (path === "/api/douban/tags" && method === "GET") return fulfill(route, { tags: ["热门"] });
    if (path === "/api/douban/recommend" && method === "GET") return fulfill(route, homeSubjects);
    const syncKind = path === "/api/user/config" ? "config" : path === "/api/user/sync" ? "library" : null;
    if (syncKind && method === "GET") return fulfill(route, documents[syncKind]);
    if (syncKind && method === "POST") {
      const current = documents[syncKind];
      const input = body as { payload: typeof current.payload };
      documents[syncKind] = { kind: syncKind, version: current.version + 1, updatedAt: Date.now(), payload: input.payload };
      return fulfill(route, documents[syncKind]);
    }
    if (path === "/api/auth/accounts" && method === "POST") {
      const input = body as { username: string; name: string; role: string };
      const created = account("viewer-1", input.username, input.name, input.role);
      accounts = [...accounts, created];
      mutations.push({ method, path, body });
      return fulfill(route, { account: created }, 201);
    }
    const match = /^\/api\/auth\/accounts\/([^/]+)$/.exec(path);
    if (match && method === "PATCH") {
      const patch = body as { role?: string };
      accounts = accounts.map((entry) => entry.id === match[1] ? { ...entry, ...patch } : entry);
      const updated = accounts.find((entry) => entry.id === match[1]);
      mutations.push({ method, path, body });
      return fulfill(route, { account: updated });
    }
    if (match && method === "DELETE") {
      accounts = accounts.filter((entry) => entry.id !== match[1]);
      mutations.push({ method, path, body });
      return fulfill(route, { success: true });
    }
    return fulfill(route, { error: { message: "Unhandled test route" } }, 500);
  });

  return { mutations };
}

function createSyncServer() {
  return {
    documents: { config: emptyDocument("config"), library: emptyDocument("library") },
    pendingWrites: false,
    releaseWrite: undefined as (() => void) | undefined,
    unavailable: false,
    networkDown: false,
    quota: false,
    error: false,
    conflicts: 0,
    holdConflictRetry: false,
    releaseConflictRetry: undefined as (() => void) | undefined,
  };
}

async function mockSyncWorker(context: BrowserContext, server: ReturnType<typeof createSyncServer>) {
  const session = { ...adminSession, accountId: "viewer-sync", profileId: "viewer-sync", username: "viewer", name: "Viewer", role: "viewer" };
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === "/api/config") return fulfill(route, { ...runtimeConfig, authenticated: true });
    if (path === "/api/auth/session") return fulfill(route, { authenticated: true, session });
    if (path === "/api/app-update") return fulfill(route, {
      currentVersion: "1.0.0", latestVersion: "1.0.0", status: "up-to-date", checkedAt: "2026-08-11T08:00:00.000Z",
      source: { changelogUrl: "https://github.com/uxudjs/UXUVideo/blob/main/CHANGELOG.md", repositoryUrl: "https://github.com/uxudjs/UXUVideo" },
    });
    if (path === "/api/douban/tags") return fulfill(route, { tags: ["热门"] });
    if (path === "/api/douban/recommend") return fulfill(route, homeSubjects);
    if (path === "/api/detail") return fulfill(route, {
      success: true,
      data: {
        vod_id: "movie-1", vod_name: "Standard history", source: "source-a", vod_year: "2026",
        episodes: [{ name: "第一集", url: "https://media.example/one.mp4", index: 0 }],
      },
    });
    if (path === "/api/proxy") return route.fulfill({
      status: 206,
      headers: { "Content-Type": "video/mp4", "Content-Range": "bytes 0-3/4", "Accept-Ranges": "bytes" },
      body: "test",
    });
    if (path === "/api/source-import" && method === "POST") {
      const body = request.postDataJSON() as { url: string };
      const suffix = body.url.includes("two") ? "two" : "one";
      return fulfill(route, { text: JSON.stringify([{
        id: `subscription-source-${suffix}`, name: `Subscription ${suffix} source`,
        baseUrl: `https://subscription-${suffix}.example/api`,
      }]) });
    }
    const kind = path === "/api/user/config" ? "config" : path === "/api/user/sync" ? "library" : null;
    if (!kind) return fulfill(route, { error: { code: "NOT_FOUND" } }, 404);
    if (server.networkDown) return route.abort("internetdisconnected");
    const current = server.documents[kind];
    if (method === "GET") return fulfill(route, current);
    if (server.pendingWrites) {
      await new Promise<void>((resolve) => {
        server.releaseWrite = resolve;
      });
    }
    if (server.quota) return fulfill(route, { error: { code: "STORAGE_QUOTA_EXCEEDED" } }, 503);
    if (server.unavailable) return fulfill(route, { error: { code: "STORAGE_UNAVAILABLE" } }, 503);
    if (server.error) return fulfill(route, { error: { code: "DOCUMENT_TOO_LARGE" } }, 413);
    const body = request.postDataJSON() as { baseVersion: number; payload: typeof current.payload };
    if (body.baseVersion !== current.version) {
      server.conflicts += 1;
      return fulfill(route, { error: { code: "SYNC_CONFLICT", details: { current } } }, 409);
    }
    if (server.holdConflictRetry && server.conflicts > 0) {
      await new Promise<void>((resolve) => {
        server.releaseConflictRetry = resolve;
      });
    }
    server.documents[kind] = { kind, version: current.version + 1, updatedAt: Date.now(), payload: body.payload };
    return fulfill(route, server.documents[kind]);
  });
}

async function localConfig(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("uxuv-sync-v1:viewer-sync:config") ?? "null"));
}

function syncedConfig(server: ReturnType<typeof createSyncServer>): MockConfigPayload {
  return server.documents.config.payload as unknown as MockConfigPayload;
}

function syncedLibrary(server: ReturnType<typeof createSyncServer>): MockLibraryPayload {
  return server.documents.library.payload as unknown as MockLibraryPayload;
}

async function localLibrary(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("uxuv-sync-v1:viewer-sync:library") ?? "null"));
}

async function addSyncedSource(page: Page, name: string, baseUrl: string) {
  const section = page.locator('[data-settings-section="sources"]');
  await section.getByRole("button", { name: "添加源" }).click();
  const modal = page.getByRole("dialog", { name: "添加单独来源" });
  await modal.getByLabel("源名称").fill(name);
  await modal.getByLabel("接口地址").fill(baseUrl);
  await modal.getByRole("button", { name: "添加", exact: true }).click();
  await expect(section.getByText(name, { exact: true })).toBeVisible();
}

async function addSyncedSubscription(page: Page, name: string, url: string) {
  const modal = await openSourceImport(page);
  await modal.getByRole("tab", { name: "订阅", exact: true }).click();
  await modal.getByLabel("订阅名称").fill(name);
  await modal.getByLabel("订阅链接").fill(url);
  await modal.getByRole("button", { name: "预览并添加订阅" }).click();
  await modal.locator(".import-preview").getByRole("button", { name: "导入有效来源" }).click();
  await expect(modal.getByText(name, { exact: true })).toBeVisible();
  return modal;
}

async function openSourceImport(page: Page) {
  const section = page.locator('[data-settings-section="sources"]');
  await section.getByRole("button", { name: "添加源" }).click();
  const addModal = page.getByRole("dialog", { name: "添加单独来源" });
  await addModal.getByRole("button", { name: "导入来源" }).click();
  return page.getByRole("dialog", { name: "导入视频源" });
}

async function mockContentWorker(context: BrowserContext) {
  const source = {
    id: "source-a",
    updatedAt: 1,
    name: "测试源",
    baseUrl: "https://media.example",
    searchPath: "",
    detailPath: "",
    enabled: true,
  };
  const server = createSyncServer();
  server.documents.config.payload.sources = [source];
  let searchMode: "success" | "empty" | "error" = "success";
  let releaseSearch: () => void = () => {};
  let searchGate = new Promise<void>((resolve) => { releaseSearch = resolve; });
  const searches: unknown[] = [];

  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === "/api/config") return fulfill(route, { ...runtimeConfig, authenticated: true });
    if (path === "/api/auth/session") return fulfill(route, { authenticated: true, session: adminSession });
    if (path === "/api/admin/usage") return fulfill(route, unconfiguredUsage);
    if (path === "/api/app-update") return fulfill(route, {
      currentVersion: "1.0.0", latestVersion: "1.0.0", status: "up-to-date", checkedAt: "2026-08-11T08:00:00.000Z",
      source: { changelogUrl: "https://github.com/uxudjs/UXUVideo/blob/main/CHANGELOG.md", repositoryUrl: "https://github.com/uxudjs/UXUVideo" },
    });
    if (path === "/api/douban/tags") return fulfill(route, { tags: ["热门"] });
    if (path === "/api/douban/recommend") return fulfill(route, homeSubjects);
    if (path === "/api/search-parallel" && method === "POST") {
      searches.push(request.postDataJSON());
      if (searchMode === "error") return fulfill(route, { error: { message: "Search unavailable" } }, 503);
      await searchGate;
      const events = [
        { type: "start", totalSources: 1, capability: freeCapability },
        ...(searchMode === "success" ? [{
          type: "videos",
          source: "source-a",
          videos: [{
            vod_id: "movie-1",
            vod_name: "测试电影",
            vod_pic: "",
            vod_year: "2026",
            type_name: "剧情",
            source: "source-a",
            sourceName: "测试源",
          }],
        }] : []),
        { type: "progress", completedSources: 1, totalVideosFound: searchMode === "success" ? 1 : 0 },
        { type: "complete" },
      ];
      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
      });
    }
    const kind = path === "/api/user/config" ? "config" : path === "/api/user/sync" ? "library" : null;
    if (!kind) return fulfill(route, { error: { code: "NOT_FOUND" } }, 404);
    const current = server.documents[kind];
    if (method === "GET") return fulfill(route, current);
    const body = request.postDataJSON() as { baseVersion: number; payload: typeof current.payload };
    server.documents[kind] = { kind, version: current.version + 1, updatedAt: Date.now(), payload: body.payload };
    return fulfill(route, server.documents[kind]);
  });

  return {
    searches,
    release: () => releaseSearch(),
    setMode: (mode: "success" | "empty" | "error") => {
      searchMode = mode;
      searchGate = new Promise<void>((resolve) => { releaseSearch = resolve; });
      if (mode === "error") releaseSearch();
    },
  };
}

async function mockPremiumWorker(context: BrowserContext, initiallyUnlocked = false) {
  const premiumSource = {
    id: "premium-a", updatedAt: 1, name: "高级源", baseUrl: "https://premium.example",
    searchPath: "/api.php/provide/vod/", detailPath: "/api.php/provide/vod/", enabled: true, group: "premium",
  };
  const server = createSyncServer();
  server.documents.config.payload.sources = [premiumSource];
  let unlocked = initiallyUnlocked;
  let releaseSearch = () => {};
  let searchGate = new Promise<void>((resolve) => { releaseSearch = resolve; });
  const premiumPasswords: unknown[] = [];
  const probes: unknown[] = [];

  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === "/api/config") return fulfill(route, { ...runtimeConfig, authenticated: true });
    if (path === "/api/auth/session") return fulfill(route, { authenticated: true, session: { ...adminSession, role: "viewer" } });
    if (path === "/api/app-update") return fulfill(route, { currentVersion: "1.0.0", latestVersion: "1.0.0", status: "up-to-date" });
    if (path === "/api/auth" && method === "POST") {
      const body = request.postDataJSON() as { type?: string; password?: string };
      premiumPasswords.push(body);
      if (body.type !== "premium" || body.password !== "premium-password") {
        return fulfill(route, { error: { code: "INVALID_PREMIUM_CREDENTIALS", message: "Premium 密码不正确。" } }, 401);
      }
      unlocked = true;
      return fulfill(route, { valid: true });
    }
    if ((path === "/api/premium/types" || path === "/api/premium/category") && !unlocked) {
      return fulfill(route, { error: { code: "PREMIUM_REQUIRED", message: "Premium access is required." } }, 403);
    }
    if (path === "/api/premium/types") return fulfill(route, {
      tags: [{ id: "recommend", label: "今日推荐", value: "" }, { id: "drama", label: "剧情", value: "premium-a:1" }],
      capability: paidCapability,
    });
    if (path === "/api/premium/category") return fulfill(route, {
      videos: [{ vod_id: "premium-1", vod_name: "高级电影", source: "premium-a", sourceDisplayName: "高级源" }],
      capability: paidCapability,
    });
    if (path === "/api/search-parallel") {
      await searchGate;
      const events = [
        { type: "start", totalSources: 1, capability: paidCapability },
        { type: "videos", source: "premium-a", videos: [{ vod_id: "premium-search", vod_name: "高级搜索结果", source: "premium-a" }] },
        { type: "progress", completedSources: 1, totalVideosFound: 1 },
        { type: "complete" },
      ];
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") });
    }
    if (path === "/api/probe-resolution") {
      probes.push(request.postDataJSON());
      const events = [
        { type: "start", capability: paidCapability },
        { id: "premium-1", source: "premium-a", resolution: { width: 1920, height: 1080, label: "1080P" } },
        { done: true },
      ];
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") });
    }
    const kind = path === "/api/user/config" ? "config" : path === "/api/user/sync" ? "library" : null;
    if (!kind) return fulfill(route, { error: { code: "NOT_FOUND" } }, 404);
    const current = server.documents[kind];
    if (method === "GET") return fulfill(route, current);
    const body = request.postDataJSON() as { payload: typeof current.payload };
    server.documents[kind] = { kind, version: current.version + 1, updatedAt: Date.now(), payload: body.payload };
    return fulfill(route, server.documents[kind]);
  });

  return {
    premiumPasswords, probes,
    releaseSearch: () => releaseSearch(),
    resetSearch: () => { searchGate = new Promise<void>((resolve) => { releaseSearch = resolve; }); },
    expirePremium: () => { unlocked = false; },
  };
}

test("auth: direct GitHub Pages shows guidance and makes no authentication request", async ({ page, request }) => {
  const pageErrors = capturePageErrors(page);
  let apiRequests = 0;
  await page.route("https://uxudjs.github.io:4173/**", async (route) => {
    const requested = new URL(route.request().url());
    const response = await request.get(`http://127.0.0.1:4173${requested.pathname}${requested.search}`);
    await route.fulfill({ status: response.status(), headers: response.headers(), body: await response.body() });
  });
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests += 1;
  });

  await page.goto("https://uxudjs.github.io:4173/UXUV-Pages/");
  await expect(page.getByText("请从你的 UXUVideo Worker 域名访问完整应用。")).toBeVisible();
  await expect(page.getByRole("heading", { name: "访问受限" })).toHaveCount(0);
  await page.waitForTimeout(100);
  expect(apiRequests).toBe(0);
  await expectNoLocalStorage(page);
  expect(pageErrors).toEqual([]);
});

test("auth: Worker origin supports login, account CRUD, permission state, and logout", async ({ page }) => {
  const pageErrors = capturePageErrors(page);
  const worker = await mockWorkerAuth(page);
  await page.goto("./");

  await expect(page.getByRole("heading", { name: "访问受限" })).toBeVisible();
  await page.getByLabel("用户名").fill("admin");
  await page.getByLabel("密码").fill("admin-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("link", { name: "打开设置" })).toHaveText("A");
  await expect(page.getByText("Administrator", { exact: true })).toHaveCount(0);

  await page.goto("./settings/");
  await expect(page.getByRole("heading", { name: "账户管理" })).toBeVisible();
  await page.getByLabel("用户名").fill("viewer");
  await page.getByLabel("显示名称").fill("New Viewer");
  await page.getByLabel("初始密码").fill("viewer-password");
  await page.getByRole("button", { name: "创建账户" }).click();
  const viewerRow = page.locator(".account-row").filter({ hasText: "New Viewer" });
  await expect(viewerRow).toBeVisible();
  await viewerRow.getByLabel("角色").selectOption("admin");
  await expect(viewerRow.getByLabel("角色")).toHaveValue("admin");
  await viewerRow.getByRole("button", { name: "删除" }).click();
  const deleteDialog = page.getByRole("alertdialog", { name: "删除这个账户？" });
  await expect(deleteDialog.getByRole("button", { name: "取消" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(deleteDialog.getByRole("button", { name: "确认删除" })).toBeFocused();
  await deleteDialog.getByRole("button", { name: "确认删除" }).click();
  await expect(viewerRow).toHaveCount(0);

  await localeChoice(page, "zh-TW").click();
  await expect(page.getByRole("heading", { name: "帳戶管理" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "同步與離線" })).toBeVisible();
  await localeChoice(page, "en").click();
  await expect(page.getByRole("heading", { name: "Account management" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sync and offline" })).toBeVisible();
  await expect(page.locator('[data-sync-detail="synced"]')).toContainText("Local data is synced with the cloud");
  await localeChoice(page, "zh-CN").click();

  const accountsSection = page.locator('[data-settings-section="accounts"]');
  const syncSection = page.locator('[data-settings-section="sync"]');
  const displaySection = page.locator('[data-settings-section="display"]');
  const styles = await page.locator('[data-settings-section="accounts"], [data-settings-section="sync"], [data-settings-section="display"]')
    .evaluateAll((elements) => elements.map((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, border: style.borderTopColor, radius: style.borderRadius, padding: style.padding };
    }));
  expect(styles[0]).toEqual(styles[2]);
  expect(styles[1]).toEqual(styles[2]);
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(accountsSection).toBeVisible();
  await expect(syncSection).toBeVisible();
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(accountsSection).toBeVisible();
    await expect(syncSection).toBeVisible();
    await expect(displaySection).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.goto("./");
  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page.getByRole("heading", { name: "访问受限" })).toBeVisible();

  expect(worker.mutations.map(({ method, path }) => `${method} ${path}`)).toEqual([
    "POST /api/auth",
    "POST /api/auth/accounts",
    "PATCH /api/auth/accounts/viewer-1",
    "DELETE /api/auth/accounts/viewer-1",
    "DELETE /api/auth/session",
  ]);
  expect(worker.mutations[0].body).toEqual({ username: "admin", password: "admin-password" });
  await expectOnlyAccountSyncStorage(page, "admin-1");
  expect(pageErrors).toEqual([]);
});

test("auth: ordinary users cannot request or render account management", async ({ page }) => {
  const pageErrors = capturePageErrors(page);
  let accountRequests = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/accounts") accountRequests += 1;
    if (path === "/api/config") {
      return fulfill(route, { ...runtimeConfig, capabilities: { ...runtimeConfig.capabilities, premium: false } });
    }
    if (path === "/api/user/config") return fulfill(route, emptyDocument("config"));
    if (path === "/api/user/sync") return fulfill(route, emptyDocument("library"));
    return fulfill(route, {
      authenticated: true,
      session: { ...adminSession, accountId: "viewer-1", profileId: "viewer-1", username: "viewer", name: "Viewer", role: "viewer" },
    });
  });

  await page.goto("./settings/");
  await expect(page.getByText("只有 super_admin 可以查看和修改账户。")).toBeVisible();
  await expect(page.getByRole("button", { name: "创建账户" })).toHaveCount(0);
  expect(accountRequests).toBe(0);
  expect(pageErrors).toEqual([]);
});

test("auth: an expired account-management request invalidates the local session", async ({ page }) => {
  let accountRequests = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/config") return fulfill(route, { ...runtimeConfig, authenticated: true });
    if (path === "/api/auth/session") return fulfill(route, { authenticated: true, session: adminSession });
    if (path === "/api/auth/accounts") {
      accountRequests += 1;
      return fulfill(route, { error: { code: "SESSION_INVALID", message: "Session expired." } }, 401);
    }
    if (path === "/api/admin/usage") return fulfill(route, unconfiguredUsage);
    if (path === "/api/user/config") return fulfill(route, emptyDocument("config"));
    if (path === "/api/user/sync") return fulfill(route, emptyDocument("library"));
    return fulfill(route, { error: { code: "NOT_FOUND" } }, 404);
  });

  await page.goto("./settings/");
  await expect(page.getByRole("heading", { name: "访问受限" })).toBeVisible();
  expect(accountRequests).toBe(1);
});

test("auth: loading and expired-session states return safely to login", async ({ page }) => {
  const pageErrors = capturePageErrors(page);
  let releaseConfig = () => {};
  const configPending = new Promise<void>((resolve) => { releaseConfig = resolve; });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/config") {
      await configPending;
      return fulfill(route, runtimeConfig);
    }
    return fulfill(route, { authenticated: false, session: null });
  });

  await page.goto("./");
  await expect(page.getByRole("status")).toHaveText("正在确认运行配置与安全会话…");
  releaseConfig();
  await expect(page.getByRole("heading", { name: "访问受限" })).toBeVisible();
  await expectNoLocalStorage(page);
  expect(pageErrors).toEqual([]);
});

test("auth: configuration failure renders a retry state", async ({ page }) => {
  const pageErrors = capturePageErrors(page);
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return path === "/api/config"
      ? fulfill(route, { error: { message: "Unavailable" } }, 503)
      : fulfill(route, { authenticated: false, session: null });
  });

  await page.goto("./");
  await expect(page.getByRole("heading", { name: "无法启动应用" })).toBeVisible();
  await expect(page.getByRole("button", { name: "重试" })).toBeVisible();
  expect(pageErrors.filter((message) => !message.includes("status of 503"))).toEqual([]);
});

test("sync: local changes remain queued while storage is unavailable and recover explicitly", async ({ page }) => {
  const server = createSyncServer();
  await mockSyncWorker(page.context(), server);
  await page.goto("./settings/");
  await expect(page.locator('[data-sync-status="synced"]')).toContainText("本地数据已与云端同步");

  server.unavailable = true;
  await localeChoice(page, "zh-TW").click();
  await expect.poll(async () => (await localConfig(page)).dirty).toBe(true);
  await expect(page.locator('[data-sync-status="offline"]')).toContainText("本機變更已保留");
  await expect(page.locator('[data-sync-detail="offline"]')).toContainText("本機變更已保留");
  await page.clock.install();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await page.clock.fastForward(5_000);
  await expect(page.locator('[data-sync-status="offline"]')).toBeVisible();

  server.unavailable = false;
  await page.locator('[data-settings-section="sync"]').getByRole("button", { name: "重試同步" }).click();
  await expect(page.locator('[data-sync-status="synced"]')).toBeVisible();
  await page.clock.fastForward(2_999);
  await expect(page.locator('[data-sync-status="synced"]')).toBeVisible();
  await page.clock.fastForward(1);
  await expect(page.locator('[data-sync-status="synced"]')).toBeHidden();
  await expect.poll(async () => (await localConfig(page)).dirty).toBe(false);
  expect((server.documents.config.payload as unknown as { fields: { locale: { value: string } } }).fields.locale.value).toBe("zh-TW");
});

test("sync: a disconnected write stays local and the online event retries it", async ({ page }) => {
  const server = createSyncServer();
  await mockSyncWorker(page.context(), server);
  await page.goto("./settings/");
  await expect(page.locator('[data-sync-status="synced"]')).toHaveCount(1);

  server.networkDown = true;
  await localeChoice(page, "en").click();
  await expect.poll(async () => (await localConfig(page)).dirty).toBe(true);
  await expect(page.locator('[data-sync-status="offline"]')).toContainText("Local changes are preserved");

  server.networkDown = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator('[data-sync-status="synced"]')).toBeVisible();
  await expect.poll(async () => (await localConfig(page)).dirty).toBe(false);
  expect((server.documents.config.payload as unknown as { fields: { locale: { value: string } } }).fields.locale.value).toBe("en");
});

test("sync: settings exposes the pending phase while a write is in flight", async ({ page }) => {
  const server = createSyncServer();
  await mockSyncWorker(page.context(), server);
  await page.goto("./settings/");
  await expect(page.locator('[data-sync-detail="synced"]')).toBeVisible();

  server.pendingWrites = true;
  await localeChoice(page, "en").click();
  await expect(page.locator('[data-sync-detail="pending"]')).toContainText("Local changes are saved and waiting for a safe sync window.");

  server.pendingWrites = false;
  server.releaseWrite?.();
  await expect(page.locator('[data-sync-detail="synced"]')).toBeVisible();
});

test("sync: quota errors preserve local data and explain UTC reset, cleanup, and upgrade", async ({ page }) => {
  const server = createSyncServer();
  server.quota = true;
  await mockSyncWorker(page.context(), server);
  await page.goto("./settings/");
  await expect(page.locator('[data-sync-status="synced"]')).toHaveCount(1);

  await localeChoice(page, "en").click();
  const quota = page.locator('[data-sync-status="quota"]');
  await expect(quota).toContainText("UTC 00:00");
  await expect(quota).toContainText("clean D1 data, or upgrade the plan");
  await expect.poll(async () => (await localConfig(page)).dirty).toBe(true);
  await expect(page.locator('[data-sync-detail="quota"]')).toContainText("clean D1 data");
  await page.clock.install();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await page.clock.fastForward(5_000);
  await expect(quota).toBeVisible();
});

test("sync: a non-retryable server error remains visible without discarding local data", async ({ page }) => {
  const server = createSyncServer();
  server.error = true;
  await mockSyncWorker(page.context(), server);
  await page.goto("./settings/");
  await expect(page.locator('[data-sync-status="synced"]')).toHaveCount(1);

  await localeChoice(page, "zh-TW").click();
  await expect(page.locator('[data-sync-status="error"]')).toContainText("本機變更仍保留在此裝置");
  await expect(page.locator('[data-sync-detail="error"]')).toContainText("本機變更仍保留在此裝置");
  await expect.poll(async () => (await localConfig(page)).dirty).toBe(true);
  await page.clock.install();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await page.clock.fastForward(5_000);
  await expect(page.locator('[data-sync-status="error"]')).toBeVisible();
});

test("settings: a standalone video source is synced and becomes available to search", async ({ page }) => {
  const server = createSyncServer();
  await mockSyncWorker(page.context(), server);
  await page.goto("./settings/");

  await expect(page.getByRole("heading", { name: "视频源管理" })).toBeVisible();
  await page.getByRole("button", { name: "添加源" }).click();
  const modal = page.getByRole("dialog", { name: "添加单独来源" });
  await modal.getByLabel("源名称").fill("测试源");
  await modal.getByLabel("接口地址").fill("https://media.example");
  await modal.getByRole("button", { name: "添加", exact: true }).click();
  await expect(page.locator(".source-manager-row").filter({ hasText: "测试源" })).toBeVisible();
  await expect.poll(() => {
    const sources = server.documents.config.payload.sources;
    return Array.isArray(sources) ? sources.length : 0;
  }).toBe(1);

  await page.goto("./");
  await expect(page.getByText("尚未配置可用视频源，请先前往设置。")).toHaveCount(0);
  await page.getByLabel("搜索视频内容").fill("测试");
  await expect(page.getByRole("button", { name: "搜索", exact: true })).toBeEnabled();
});

test("sync: two browser contexts explain a CAS conflict and converge without reviving stale state", async ({ browser }) => {
  const server = createSyncServer();
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  await mockSyncWorker(firstContext, server);
  await mockSyncWorker(secondContext, server);
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  await Promise.all([first.goto("./settings/"), second.goto("./settings/")]);
  await Promise.all([
    expect(first.locator('[data-sync-status="synced"]')).toHaveCount(1),
    expect(second.locator('[data-sync-status="synced"]')).toHaveCount(1),
  ]);

  await localeChoice(first, "zh-TW").click();
  await expect.poll(() => server.documents.config.version).toBe(1);
  await expect(first.locator('[data-sync-status="synced"]')).toHaveCount(1);
  server.holdConflictRetry = true;
  await localeChoice(second, "en").click();
  await expect(second.locator('[data-sync-status="conflict"]')).toContainText("local merge is retrying");
  await expect(second.locator('[data-sync-detail="conflict"]')).toContainText("local merge is retrying");
  await second.clock.install();
  await second.clock.pauseAt(await second.evaluate(() => Date.now() + 100));
  await second.clock.fastForward(5_000);
  await expect(second.locator('[data-sync-status="conflict"]')).toBeVisible();
  server.holdConflictRetry = false;
  server.releaseConflictRetry?.();
  await expect.poll(() => server.documents.config.version).toBe(2);
  await expect(second.locator('[data-sync-status="synced"]')).toBeVisible();
  expect(server.conflicts).toBe(1);

  await first.reload();
  await expect(first.locator('[data-sync-status="synced"]')).toHaveCount(1);
  await expect(localeChoice(first, "en")).toHaveAttribute("aria-pressed", "true");
  await firstContext.close();
  await secondContext.close();
});

test("sync: standard sources survive offline and quota failures, then converge without crossing premium data", async ({ browser }) => {
  const server = createSyncServer();
  const initial = syncedConfig(server);
  initial.fields.futureSetting = { value: { enabled: true }, updatedAt: 1 };
  initial.sources.push({
    id: "premium-seed", updatedAt: 1, name: "Premium seed", baseUrl: "https://premium.example/api",
    enabled: true, group: "premium", kind: "personal", priority: 1,
  });
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  await mockSyncWorker(firstContext, server);
  await mockSyncWorker(secondContext, server);
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  await Promise.all([first.goto("./settings/"), second.goto("./settings/")]);
  await Promise.all([
    expect(first.locator('[data-sync-status="synced"]')).toHaveCount(1),
    expect(second.locator('[data-sync-status="synced"]')).toHaveCount(1),
  ]);
  await expect(first.locator('[data-settings-section="sources"]').getByText("Premium seed", { exact: true })).toHaveCount(0);

  server.unavailable = true;
  await addSyncedSource(first, "Standard one", "https://one.example/api");
  await expect(first.locator('[data-sync-status="offline"]')).toBeVisible();
  await expect.poll(async () => (await localConfig(first)).dirty).toBe(true);

  server.unavailable = false;
  await first.locator('[data-settings-section="sync"]').getByRole("button", { name: "重试同步" }).click();
  await expect.poll(() => server.documents.config.version).toBe(1);
  await expect(first.locator('[data-sync-status="synced"]')).toBeVisible();

  server.quota = true;
  await addSyncedSource(second, "Standard two", "https://two.example/api");
  await expect(second.locator('[data-sync-status="quota"]')).toBeVisible();
  await expect.poll(async () => (await localConfig(second)).dirty).toBe(true);

  server.quota = false;
  await second.locator('[data-settings-section="sync"]').getByRole("button", { name: "重试同步" }).click();
  await expect(second.locator('[data-sync-status="conflict"]')).toContainText("已在本地合并");
  await expect.poll(() => server.documents.config.version).toBe(2);
  await expect(second.locator('[data-sync-status="synced"]')).toBeVisible();

  const final = syncedConfig(server);
  expect(server.conflicts).toBe(1);
  expect(final.fields.futureSetting.value).toEqual({ enabled: true });
  expect(final.sources).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "premium-seed", group: "premium" }),
    expect.objectContaining({ id: "standard-one", group: "normal" }),
    expect.objectContaining({ id: "standard-two", group: "normal" }),
  ]));
  await firstContext.close();
  await secondContext.close();
});

test("sync: subscriptions retain tombstones and mode isolation across offline, quota, and CAS recovery", async ({ browser }) => {
  const server = createSyncServer();
  const initial = syncedConfig(server);
  initial.fields.futureSetting = { value: "preserved", updatedAt: 1 };
  initial.sources.push({
    id: "premium-seed", updatedAt: 1, name: "Premium seed", baseUrl: "https://premium.example/api",
    enabled: true, group: "premium", kind: "personal", priority: 1,
  });
  initial.subscriptions.push({
    id: "premium-sub", updatedAt: 1, name: "Premium subscription", url: "https://premium.example/sub.json",
    lastUpdated: 1, sourceIds: ["premium-seed"], mode: "premium",
  });
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  await mockSyncWorker(firstContext, server);
  await mockSyncWorker(secondContext, server);
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  await Promise.all([first.goto("./settings/"), second.goto("./settings/")]);
  await Promise.all([
    expect(first.locator('[data-sync-status="synced"]')).toHaveCount(1),
    expect(second.locator('[data-sync-status="synced"]')).toHaveCount(1),
  ]);

  server.unavailable = true;
  const firstModal = await addSyncedSubscription(first, "Subscription one", "https://safe.example/one.json");
  await first.keyboard.press("Escape");
  await expect(firstModal).toBeHidden();
  await expect(first.locator('[data-sync-status="offline"]')).toBeVisible();
  await expect.poll(async () => (await localConfig(first)).dirty).toBe(true);

  server.unavailable = false;
  await first.locator('[data-settings-section="sync"]').getByRole("button", { name: "重试同步" }).click();
  await expect.poll(() => server.documents.config.version).toBe(1);
  await expect(first.locator('[data-sync-status="synced"]')).toBeVisible();

  server.quota = true;
  const secondModal = await addSyncedSubscription(second, "Subscription two", "https://safe.example/two.json");
  await second.keyboard.press("Escape");
  await expect(secondModal).toBeHidden();
  await expect(second.locator('[data-sync-status="quota"]')).toBeVisible();

  server.quota = false;
  await second.locator('[data-settings-section="sync"]').getByRole("button", { name: "重试同步" }).click();
  await expect(second.locator('[data-sync-status="conflict"]')).toBeVisible();
  await expect.poll(() => server.documents.config.version).toBe(2);
  await expect(second.locator('[data-sync-status="synced"]')).toBeVisible();

  server.quota = true;
  const deleteModal = await openSourceImport(first);
  await deleteModal.getByRole("tab", { name: "订阅", exact: true }).click();
  await deleteModal.getByRole("button", { name: "删除 Subscription one" }).click();
  const confirmation = first.getByRole("alertdialog", { name: "删除此订阅？" });
  await confirmation.getByRole("button", { name: "删除", exact: true }).click();
  await first.keyboard.press("Escape");
  await expect(deleteModal).toBeHidden();
  await expect(first.locator('[data-sync-status="quota"]')).toBeVisible();

  server.quota = false;
  await first.locator('[data-settings-section="sync"]').getByRole("button", { name: "重试同步" }).click();
  await expect(first.locator('[data-sync-status="conflict"]')).toBeVisible();
  await expect.poll(() => server.documents.config.version).toBe(3);
  await expect(first.locator('[data-sync-status="synced"]')).toBeVisible();

  const final = syncedConfig(server);
  expect(server.conflicts).toBe(2);
  expect(final.fields.futureSetting.value).toBe("preserved");
  expect(final.sources).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "premium-seed", group: "premium" }),
    expect.objectContaining({ id: "subscription-source-one", group: "normal" }),
    expect.objectContaining({ id: "subscription-source-two", group: "normal" }),
  ]));
  expect(final.subscriptions).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "premium-sub", mode: "premium" }),
    expect.objectContaining({ name: "Subscription two", mode: "standard" }),
  ]));
  expect(final.subscriptions).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "Subscription one" }),
  ]));
  expect(final.tombstones).toEqual(expect.arrayContaining([
    expect.objectContaining({ collection: "subscriptions" }),
  ]));
  await firstContext.close();
  await secondContext.close();
});

test("sync: standard and Premium favorites stay isolated through offline, quota, and CAS recovery", async ({ browser }) => {
  const server = createSyncServer();
  syncedLibrary(server).favorites.push(
    {
      id: "standard:source-a:movie-1", updatedAt: 1, videoId: "movie-1", title: "Standard favorite",
      source: "source-a", addedAt: 1, mode: "standard",
    },
    {
      id: "premium:premium-a:premium-1", updatedAt: 1, videoId: "premium-1", title: "Premium favorite",
      source: "premium-a", addedAt: 1, mode: "premium",
    },
  );
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  await mockSyncWorker(firstContext, server);
  await mockSyncWorker(secondContext, server);
  const standard = await firstContext.newPage();
  const premium = await secondContext.newPage();
  await Promise.all([standard.goto("./favorites/"), premium.goto("./premium/favorites/")]);
  await Promise.all([
    expect(standard.locator('[data-sync-status="synced"]')).toHaveCount(1),
    expect(premium.locator('[data-sync-status="synced"]')).toHaveCount(1),
  ]);
  await expect(standard.getByRole("heading", { name: "Standard favorite" })).toBeVisible();
  await expect(standard.getByRole("heading", { name: "Premium favorite" })).toHaveCount(0);
  await expect(premium.getByRole("heading", { name: "Premium favorite" })).toBeVisible();
  await expect(premium.getByRole("heading", { name: "Standard favorite" })).toHaveCount(0);

  server.unavailable = true;
  await standard.getByRole("button", { name: "取消收藏 Standard favorite" }).click();
  await expect(standard.locator('[data-sync-status="offline"]')).toBeVisible();
  await expect.poll(async () => (await localLibrary(standard)).dirty).toBe(true);

  server.unavailable = false;
  await standard.getByRole("button", { name: "重试同步" }).click();
  await expect.poll(() => server.documents.library.version).toBe(1);
  await expect(standard.locator('[data-sync-status="synced"]')).toBeVisible();
  expect(syncedLibrary(server).favorites).toEqual([
    expect.objectContaining({ id: "premium:premium-a:premium-1", mode: "premium" }),
  ]);

  server.quota = true;
  await premium.getByRole("button", { name: "取消收藏 Premium favorite" }).click();
  await expect(premium.locator('[data-sync-status="quota"]')).toBeVisible();
  await expect.poll(async () => (await localLibrary(premium)).dirty).toBe(true);

  server.quota = false;
  await premium.getByRole("button", { name: "重试同步" }).click();
  await expect(premium.locator('[data-sync-status="conflict"]')).toBeVisible();
  await expect.poll(() => server.documents.library.version).toBe(2);
  await expect(premium.locator('[data-sync-status="synced"]')).toBeVisible();

  const final = syncedLibrary(server);
  expect(server.conflicts).toBe(1);
  expect(final.favorites).toEqual([]);
  expect(final.tombstones).toEqual(expect.arrayContaining([
    expect.objectContaining({ collection: "favorites", id: "standard:source-a:movie-1" }),
    expect.objectContaining({ collection: "favorites", id: "premium:premium-a:premium-1" }),
  ]));
  await firstContext.close();
  await secondContext.close();
});

test("sync: a stale offline progress write cannot revive remotely deleted history", async ({ browser }) => {
  const server = createSyncServer();
  syncedConfig(server).sources.push({
    id: "source-a", updatedAt: 1, name: "Source A", baseUrl: "https://catalog.example",
    searchPath: "/api.php/provide/vod/", detailPath: "/api.php/provide/vod/", enabled: true, group: "normal",
  });
  syncedLibrary(server).history.push(
    {
      id: "standard:source-a:movie-1", updatedAt: 1, videoId: "movie-1", title: "Standard history",
      source: "source-a", episodeIndex: 0, playbackPosition: 10, duration: 100, mode: "standard",
    },
    {
      id: "premium:premium-a:premium-1", updatedAt: 1, videoId: "premium-1", title: "Premium history",
      source: "premium-a", episodeIndex: 0, playbackPosition: 20, duration: 100, mode: "premium",
    },
  );
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  await mockSyncWorker(firstContext, server);
  await mockSyncWorker(secondContext, server);
  const first = await firstContext.newPage();
  const stale = await secondContext.newPage();
  await stale.clock.install();
  await Promise.all([
    first.goto("./"),
    stale.goto("./player/?id=movie-1&source=source-a&title=Standard%20history"),
  ]);
  await Promise.all([
    expect(first.locator('[data-sync-status="synced"]')).toHaveCount(1),
    expect(stale.locator('[data-sync-status="synced"]')).toHaveCount(1),
  ]);
  await expect(stale.getByRole("heading", { name: "Standard history" })).toBeVisible();

  server.unavailable = true;
  await first.getByRole("button", { name: "打开观看历史" }).click();
  await first.getByRole("button", { name: "删除记录 Standard history" }).click();
  await first.getByRole("alertdialog", { name: "删除这条历史记录？" })
    .getByRole("button", { name: "确认删除" }).click();
  await expect(first.locator('[data-sync-status="offline"]')).toBeVisible();
  await first.getByRole("dialog", { name: "观看历史" }).getByRole("button", { name: "关闭观看历史" }).click();

  server.unavailable = false;
  await first.getByRole("button", { name: "重试同步" }).click();
  await expect.poll(() => server.documents.library.version).toBe(1);
  await expect(first.locator('[data-sync-status="synced"]')).toBeVisible();

  server.unavailable = true;
  const video = stale.getByLabel("视频播放器");
  await video.evaluate((element) => {
    Object.defineProperty(element, "duration", { configurable: true, value: 100 });
    Object.defineProperty(element, "currentTime", { configurable: true, writable: true, value: 40 });
    element.dispatchEvent(new Event("timeupdate"));
  });
  await expect.poll(async () => {
    const local = await localLibrary(stale);
    return local.payload.history.find((record: { id: string }) => record.id === "standard:source-a:movie-1")?.playbackPosition;
  }).toBe(40);
  await expect(stale.locator('[data-sync-status="pending"]')).toBeVisible();
  await stale.clock.fastForward(60_000);
  await expect(stale.locator('[data-sync-status="offline"]')).toBeVisible();

  server.unavailable = false;
  await stale.getByRole("button", { name: "重试同步" }).click();
  await expect(stale.locator('[data-sync-status="conflict"]')).toBeVisible();
  await stale.clock.fastForward(400);
  await expect.poll(() => server.documents.library.version).toBe(2);
  await expect(stale.locator('[data-sync-status="synced"]')).toBeVisible();

  const final = syncedLibrary(server);
  expect(server.conflicts).toBe(1);
  expect(final.history).toEqual([
    expect.objectContaining({ id: "premium:premium-a:premium-1", mode: "premium" }),
  ]);
  expect(final.tombstones).toEqual(expect.arrayContaining([
    expect.objectContaining({ collection: "history", id: "standard:source-a:movie-1" }),
  ]));
  await firstContext.close();
  await secondContext.close();
});

test("content: search streams results, navigates to detail, and persists favorites", async ({ page }) => {
  const pageErrors = capturePageErrors(page);
  const worker = await mockContentWorker(page.context());
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "示例电影" })).toBeVisible();

  await page.getByLabel("搜索视频内容").fill("测试");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(page.locator(".kvideo-search-progress[role=status]")).toContainText("正在搜索");
  worker.release();
  await expect(page.getByRole("heading", { name: "测试电影" })).toBeVisible();
  await expect(page.getByText("服务端 Free：最多 12 个源、500 条结果。")).toBeVisible();
  expect(worker.searches).toEqual([{ query: "测试", sources: [expect.objectContaining({ id: "source-a" })], page: 1 }]);

  const detail = page.getByRole("link", { name: "查看 测试电影" });
  await expect(detail).toHaveAttribute("href", /\/player\?.*id=movie-1.*source=source-a/);
  await page.getByRole("button", { name: "收藏 测试电影" }).click();
  await expect(page.getByRole("button", { name: "取消收藏 测试电影" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "已收藏" })).toBeVisible();
  await page.goto("./favorites/");
  await expect(page.getByRole("heading", { name: "我的收藏" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "测试电影" })).toBeVisible();
  await page.getByRole("button", { name: "取消收藏 测试电影" }).click();
  await expect(page.getByText("暂无收藏", { exact: true })).toBeVisible();

  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  expect(pageErrors).toEqual([]);
});

test("content: search renders deterministic empty and error states", async ({ page }) => {
  const worker = await mockContentWorker(page.context());
  worker.setMode("empty");
  await page.goto("./");
  await page.getByLabel("搜索视频内容").fill("不存在");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  worker.release();
  await expect(page.locator(".content-message[role=status]")).toHaveText("没有找到匹配结果，请尝试其他关键词。");

  worker.setMode("error");
  await page.getByLabel("搜索视频内容").fill("错误");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(page.locator(".content-message[role=alert]")).toContainText("Search unavailable");
});

test("premium: server authorization unlocks content, favorites, and synced source settings", async ({ page }) => {
  const pageErrors = capturePageErrors(page);
  const worker = await mockPremiumWorker(page.context());
  await page.goto("./premium/");
  await expect(page.getByRole("heading", { name: "解锁 Premium" })).toBeVisible();
  await page.getByLabel("Premium 密码").fill("premium-password");
  await page.getByRole("button", { name: "解锁" }).click();
  await expect(page.getByRole("heading", { name: "Premium 内容" })).toBeVisible();
  await expect(page.getByText("服务端 Paid · 最多 32 个源 · 2000 条")).toBeVisible();
  await expect(page.getByRole("heading", { name: "高级电影" })).toBeVisible();
  expect(worker.premiumPasswords).toEqual([{ type: "premium", password: "premium-password" }]);

  await page.getByRole("button", { name: "收藏 高级电影" }).click();
  await expect(page.getByRole("status").filter({ hasText: "已收藏" })).toBeVisible();
  await page.goto("./premium/favorites/");
  await expect(page.getByRole("heading", { name: "Premium 收藏" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "高级电影" })).toBeVisible();

  await page.goto("./premium/settings/");
  await expect(page.getByRole("heading", { name: "高级模式设置" })).toBeVisible();
  const premiumSources = page.locator('[data-settings-section="premium-sources"]');
  await expect(premiumSources.getByText("高级源", { exact: true })).toBeVisible();
  await premiumSources.getByRole("button", { name: "添加源" }).click();
  const sourceDialog = page.getByRole("dialog", { name: "添加 Premium 视频源" });
  await sourceDialog.getByLabel("源名称").fill("备用高级源");
  await sourceDialog.getByLabel("接口地址").fill("https://backup.example");
  await sourceDialog.getByRole("button", { name: "添加", exact: true }).click();
  await expect(premiumSources.getByText("备用高级源", { exact: true })).toBeVisible();
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  expect(pageErrors.filter((message) => !message.includes("status of 403"))).toEqual([]);
});

test("premium: search cancellation, resolution probing, and expired authorization stay visible", async ({ page }) => {
  const pageErrors = capturePageErrors(page);
  const worker = await mockPremiumWorker(page.context(), true);
  await page.goto("./premium/");
  await expect(page.getByRole("heading", { name: "高级电影" })).toBeVisible();

  worker.resetSearch();
  await page.getByLabel("搜索 Premium 内容").fill("测试");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(page.getByRole("button", { name: "取消" })).toBeVisible();
  await page.getByRole("button", { name: "取消" }).click();
  worker.releaseSearch();
  await expect(page.getByRole("button", { name: "取消" })).toHaveCount(0);

  await page.getByRole("button", { name: "探测清晰度 高级电影" }).click();
  await expect(page.getByRole("button", { name: "探测清晰度 高级电影" })).toHaveText("1080P");
  expect(worker.probes).toEqual([{ videos: [{ id: "premium-1", source: "premium-a" }], sourceConfigs: [expect.objectContaining({ id: "premium-a" })] }]);

  worker.expirePremium();
  await page.getByRole("button", { name: "剧情" }).click();
  await expect(page.getByRole("heading", { name: "解锁 Premium" })).toBeVisible();
  await expect(page.getByText("Premium 授权已失效，请重新解锁。")).toBeVisible();
  expect(pageErrors.filter((message) => !message.includes("status of 403"))).toEqual([]);
});
