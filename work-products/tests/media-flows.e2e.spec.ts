import { expect, test, type BrowserContext, type Route } from "@playwright/test";

const runtimeConfig = {
  release: { worker: "1.0.0", pages: "0.1.2", apiContract: 1 },
  site: { name: "UXUVideo", title: "UXUVideo", description: "Private video", iconUrl: "/icon.png" },
  capabilities: { premium: true, iptv: true, danmaku: false },
  adKeywords: [],
  thirdPartyScripts: { videoTogether: { enabled: false, scriptUrl: null, settingUrl: null } },
  authenticated: true,
};

const session = (permissions: string[] = [], role = "viewer") => ({
  accountId: `account-${role}`,
  profileId: `account-${role}`,
  username: role,
  name: role === "super_admin" ? "Administrator" : "Viewer",
  role,
  customPermissions: permissions,
  mode: "managed",
});

interface MockDocument {
  kind: "config" | "library";
  version: number;
  updatedAt: number | null;
  payload: Record<string, unknown> & { tombstones: unknown[] };
}

const remoteDocument = (kind: "config" | "library", sources: unknown[] = []): MockDocument => ({
  kind,
  version: 0,
  updatedAt: null,
  payload: kind === "config"
    ? { fields: {}, sources, subscriptions: [], tombstones: [] }
    : { history: [], favorites: [], tombstones: [] },
});

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockMediaWorker(
  context: BrowserContext,
  options: { permissions?: string[]; role?: string; iptvSources?: string } = {},
) {
  const currentSession = session(options.permissions, options.role);
  const source = {
    id: "source-a", updatedAt: 1, name: "测试源", baseUrl: "https://catalog.example",
    searchPath: "/api.php/provide/vod/", detailPath: "/api.php/provide/vod/", enabled: true,
  };
  const configDocument = remoteDocument("config", [source]);
  let libraryDocument = remoteDocument("library");
  const requestOrigins: string[] = [];
  let iptvRequests = 0;

  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    requestOrigins.push(url.origin);
    if (url.pathname === "/api/config") return json(route, {
      ...runtimeConfig,
      sources: { subscriptionSources: "", iptvSources: options.iptvSources || "", mergeSources: false, danmakuApiUrl: "" },
    });
    if (url.pathname === "/api/auth/session") return json(route, { authenticated: true, session: currentSession });
    if (url.pathname === "/api/user/config") return json(route, configDocument);
    if (url.pathname === "/api/user/sync" && request.method() === "GET") return json(route, libraryDocument);
    if (url.pathname === "/api/user/sync" && request.method() === "POST") {
      const body = request.postDataJSON() as { payload: typeof libraryDocument.payload };
      libraryDocument = { ...libraryDocument, version: libraryDocument.version + 1, updatedAt: Date.now(), payload: body.payload };
      return json(route, libraryDocument);
    }
    if (url.pathname === "/api/detail") return json(route, {
      success: true,
      data: {
        vod_id: "movie-1", vod_name: "测试影片", source: "source-a", vod_year: "2026", vod_actor: "演员甲", vod_area: "中国",
        episodes: [
          { name: "第一集", url: "https://media.example/one.mp4", index: 0 },
          { name: "第二集", url: "https://media.example/two.mp4", index: 1 },
        ],
      },
    });
    if (url.pathname === "/api/iptv") {
      iptvRequests += 1;
      return route.fulfill({ status: 200, contentType: "application/vnd.apple.mpegurl", body: [
        "#EXTM3U",
        "#EXTINF:-1 group-title=\"新闻\",新闻一台",
        "https://media.example/news.mp4",
        "#EXTINF:-1 group-title=\"体育\",过期频道",
        "https://media.example/expired.m3u8",
      ].join("\n") });
    }
    if (url.pathname === "/api/iptv/stream" && url.searchParams.get("url")?.includes("expired")) {
      return json(route, { error: { code: "MEDIA_TOKEN_INVALID", message: "Media token invalid." } }, 401);
    }
    if (url.pathname === "/api/proxy" || url.pathname === "/api/iptv/stream") {
      return route.fulfill({ status: 206, headers: { "Content-Type": "video/mp4", "Content-Range": "bytes 0-3/4", "Accept-Ranges": "bytes" }, body: "test" });
    }
    return json(route, { error: { code: "NOT_FOUND" } }, 404);
  });

  return { requestOrigins, getIptvRequests: () => iptvRequests };
}

test("player loads detail, switches episodes, and keeps media requests same-origin", async ({ page }) => {
  const worker = await mockMediaWorker(page.context());
  await page.goto("./player/?id=movie-1&source=source-a&title=测试影片");
  await expect(page.getByRole("heading", { name: "测试影片" })).toBeVisible();
  const video = page.getByLabel("视频播放器");
  await expect(video).toHaveAttribute("data-media-source", /\/api\/proxy\?.*one\.mp4/);
  await page.getByRole("radio", { name: "第二集" }).click();
  await expect(video).toHaveAttribute("data-media-source", /\/api\/proxy\?.*two\.mp4/);
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  expect(worker.requestOrigins.every((origin) => origin === "http://127.0.0.1:4173")).toBe(true);
});

test("IPTV enforces permission, loads channels, switches streams, and exposes token expiry", async ({ browser }) => {
  const deniedContext = await browser.newContext({ locale: "zh-CN" });
  const deniedWorker = await mockMediaWorker(deniedContext);
  const deniedPage = await deniedContext.newPage();
  await deniedPage.goto("http://127.0.0.1:4173/UXUV-Pages/iptv/");
  await expect(deniedPage.getByRole("heading", { name: "无权访问 IPTV" })).toBeVisible();
  expect(deniedWorker.getIptvRequests()).toBe(0);
  await deniedContext.close();

  const allowedContext = await browser.newContext({ locale: "zh-CN" });
  const worker = await mockMediaWorker(allowedContext, {
    role: "super_admin",
    iptvSources: JSON.stringify([{ name: "内置直播", url: "https://iptv.example/list.m3u" }]),
  });
  const page = await allowedContext.newPage();
  await page.goto("http://127.0.0.1:4173/UXUV-Pages/iptv/");
  await expect(page.getByRole("button", { name: /新闻一台/ })).toBeVisible();
  await page.getByRole("button", { name: /新闻一台/ }).click();
  const video = page.getByLabel("视频播放器");
  await expect(video).toHaveAttribute("data-media-source", /\/api\/iptv\/stream\?.*news\.mp4/);
  await page.getByRole("button", { name: /过期频道/ }).click();
  await expect(page.locator(".media-error[role=alert]")).toContainText("直播授权已过期");
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  expect(worker.requestOrigins.every((origin) => origin === "http://127.0.0.1:4173")).toBe(true);
  await allowedContext.close();
});
