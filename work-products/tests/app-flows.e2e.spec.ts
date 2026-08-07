import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";

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
  capabilities: { premium: true, iptv: true, danmaku: false },
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
    missing: ["CF_ANALYTICS_API_TOKEN", "CF_ACCOUNT_ID", "CF_WORKER_SCRIPT_NAME", "CF_D1_DATABASE_ID"],
    message: "Cloudflare usage analytics is not configured.",
  },
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
    `uxuv-sync-v1:${accountId}:config`,
    `uxuv-sync-v1:${accountId}:library`,
  ]);
  expect(JSON.stringify(entries)).not.toContain("admin-password");
}

async function mockWorkerAuth(page: Page) {
  let authenticated = false;
  let accounts = [account("admin-1", "admin", "Administrator", "super_admin")];
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
    if (path === "/api/user/config" && method === "GET") return fulfill(route, emptyDocument("config"));
    if (path === "/api/user/sync" && method === "GET") return fulfill(route, emptyDocument("library"));
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
    unavailable: false,
    quota: false,
    conflicts: 0,
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
    const kind = path === "/api/user/config" ? "config" : path === "/api/user/sync" ? "library" : null;
    if (!kind) return fulfill(route, { error: { code: "NOT_FOUND" } }, 404);
    const current = server.documents[kind];
    if (method === "GET") return fulfill(route, current);
    if (server.quota) return fulfill(route, { error: { code: "STORAGE_QUOTA_EXCEEDED" } }, 503);
    if (server.unavailable) return fulfill(route, { error: { code: "STORAGE_UNAVAILABLE" } }, 503);
    const body = request.postDataJSON() as { baseVersion: number; payload: typeof current.payload };
    if (body.baseVersion !== current.version) {
      server.conflicts += 1;
      return fulfill(route, { error: { code: "SYNC_CONFLICT", details: { current } } }, 409);
    }
    server.documents[kind] = { kind, version: current.version + 1, updatedAt: Date.now(), payload: body.payload };
    return fulfill(route, server.documents[kind]);
  });
}

async function localConfig(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("uxuv-sync-v1:viewer-sync:config") ?? "null"));
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

test("auth: direct GitHub Pages shows guidance and makes no authentication request", async ({ page }) => {
  const pageErrors = capturePageErrors(page);
  let apiRequests = 0;
  await page.route("https://uxudjs.github.io:4173/**", async (route) => {
    const requested = new URL(route.request().url());
    const response = await route.fetch({
      url: `http://127.0.0.1:4173${requested.pathname}${requested.search}`,
    });
    await route.fulfill({ response });
  });
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests += 1;
  });

  await page.goto("https://uxudjs.github.io:4173/UXUV-Pages/0.1.2/");
  await expect(page.getByText("请从你的 UXUVideo Worker 域名访问完整应用。")).toBeVisible();
  await expect(page.getByRole("heading", { name: "登录" })).toHaveCount(0);
  await page.waitForTimeout(100);
  expect(apiRequests).toBe(0);
  await expectNoLocalStorage(page);
  expect(pageErrors).toEqual([]);
});

test("auth: Worker origin supports login, account CRUD, permission state, and logout", async ({ page }) => {
  const pageErrors = capturePageErrors(page);
  const worker = await mockWorkerAuth(page);
  await page.goto("./");

  await expect(page.getByRole("heading", { name: "登录" })).toBeVisible();
  await page.getByLabel("用户名").fill("admin");
  await page.getByLabel("密码").fill("admin-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByText("Administrator")).toBeVisible();

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
  page.once("dialog", (dialog) => dialog.accept());
  await viewerRow.getByRole("button", { name: "删除" }).click();
  await expect(viewerRow).toHaveCount(0);
  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page.getByRole("heading", { name: "登录" })).toBeVisible();

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
  await expect(page.getByRole("heading", { name: "登录" })).toBeVisible();
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
  await expect(page.locator('[data-sync-status="synced"]')).toBeVisible();

  server.unavailable = true;
  await page.getByLabel("界面语言").selectOption("zh-TW");
  await expect.poll(async () => (await localConfig(page)).dirty).toBe(true);
  await expect(page.locator('[data-sync-status="offline"]')).toContainText("本地更改已保留");

  server.unavailable = false;
  await page.getByRole("button", { name: "重试同步" }).click();
  await expect(page.locator('[data-sync-status="synced"]')).toBeVisible();
  await expect.poll(async () => (await localConfig(page)).dirty).toBe(false);
  expect((server.documents.config.payload as unknown as { fields: { locale: { value: string } } }).fields.locale.value).toBe("zh-TW");
});

test("sync: quota errors preserve local data and explain UTC reset, cleanup, and upgrade", async ({ page }) => {
  const server = createSyncServer();
  server.quota = true;
  await mockSyncWorker(page.context(), server);
  await page.goto("./settings/");
  await expect(page.locator('[data-sync-status="synced"]')).toBeVisible();

  await page.getByLabel("界面语言").selectOption("en");
  const quota = page.locator('[data-sync-status="quota"]');
  await expect(quota).toContainText("UTC 00:00");
  await expect(quota).toContainText("清理 D1 数据、升级套餐");
  await expect.poll(async () => (await localConfig(page)).dirty).toBe(true);
});

test("settings: a personal video source is synced and becomes available to search", async ({ page }) => {
  const server = createSyncServer();
  await mockSyncWorker(page.context(), server);
  await page.goto("./settings/");

  await expect(page.getByRole("heading", { name: "视频源" })).toBeVisible();
  await page.getByLabel("来源名称").fill("测试源");
  await page.getByLabel("基础 URL").fill("https://media.example");
  await page.getByRole("button", { name: "添加视频源" }).click();
  await expect(page.locator(".source-row").filter({ hasText: "测试源" })).toBeVisible();
  await expect.poll(() => {
    const sources = server.documents.config.payload.sources;
    return Array.isArray(sources) ? sources.length : 0;
  }).toBe(1);

  await page.goto("./");
  await expect(page.getByText("尚未配置可用视频源，请先前往设置。")).toHaveCount(0);
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
    expect(first.locator('[data-sync-status="synced"]')).toBeVisible(),
    expect(second.locator('[data-sync-status="synced"]')).toBeVisible(),
  ]);

  await first.getByLabel("界面语言").selectOption("zh-TW");
  await expect.poll(() => server.documents.config.version).toBe(1);
  await expect(first.locator('[data-sync-status="synced"]')).toBeVisible();
  await second.getByLabel("界面语言").selectOption("en");
  await expect(second.locator('[data-sync-status="conflict"]')).toContainText("已在本地合并");
  await expect.poll(() => server.documents.config.version).toBe(2);
  await expect(second.locator('[data-sync-status="synced"]')).toBeVisible();
  expect(server.conflicts).toBe(1);

  await first.reload();
  await expect(first.locator('[data-sync-status="synced"]')).toBeVisible();
  await expect(first.getByLabel("界面语言")).toHaveValue("en");
  await firstContext.close();
  await secondContext.close();
});

test("content: search streams results, navigates to detail, and persists favorites", async ({ page }) => {
  const pageErrors = capturePageErrors(page);
  const worker = await mockContentWorker(page.context());
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "找到下一部想看的影片" })).toBeVisible();

  await page.getByLabel("搜索影视内容").fill("测试");
  await page.getByRole("button", { name: "搜索" }).click();
  await expect(page.locator(".content-message[role=status]")).toContainText("正在搜索");
  worker.release();
  await expect(page.getByRole("heading", { name: "测试电影" })).toBeVisible();
  await expect(page.getByText("服务端 Free：最多 12 个源、500 条结果。")).toBeVisible();
  expect(worker.searches).toEqual([{ query: "测试", sources: [expect.objectContaining({ id: "source-a" })], page: 1 }]);

  const detail = page.getByRole("link", { name: "查看 测试电影" });
  await expect(detail).toHaveAttribute("href", /\/player\?.*id=movie-1.*source=source-a/);
  await page.getByRole("button", { name: "收藏 测试电影" }).click();
  await expect(page.getByRole("button", { name: "取消收藏 测试电影" })).toBeVisible();
  await page.goto("./favorites/");
  await expect(page.getByRole("heading", { name: "我的收藏" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "测试电影" })).toBeVisible();
  await page.getByRole("button", { name: "取消收藏 测试电影" }).click();
  await expect(page.getByRole("heading", { name: "还没有收藏" })).toBeVisible();

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
  await page.getByLabel("搜索影视内容").fill("不存在");
  await page.getByRole("button", { name: "搜索" }).click();
  worker.release();
  await expect(page.locator(".content-message[role=status]")).toHaveText("没有找到匹配结果，请尝试其他关键词。");

  worker.setMode("error");
  await page.getByLabel("搜索影视内容").fill("错误");
  await page.getByRole("button", { name: "搜索" }).click();
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
  await page.goto("./premium/favorites/");
  await expect(page.getByRole("heading", { name: "Premium 收藏" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "高级电影" })).toBeVisible();

  await page.goto("./premium/settings/");
  await expect(page.getByRole("heading", { name: "Premium 来源" })).toBeVisible();
  await expect(page.getByText("高级源")).toBeVisible();
  await page.getByLabel("名称").fill("备用高级源");
  await page.getByLabel("基础 URL").fill("https://backup.example");
  await page.getByRole("button", { name: "添加 Premium 来源" }).click();
  await expect(page.getByText("备用高级源")).toBeVisible();
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
  await page.getByRole("button", { name: "搜索" }).click();
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
