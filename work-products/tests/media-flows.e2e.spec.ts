import { expect, test, type BrowserContext, type Route } from "@playwright/test";

const runtimeConfig = {
  release: { worker: "2.0.0", pages: "0.3.0", apiContract: 2 },
  site: { name: "UXUVideo", title: "UXUVideo", description: "Private video", iconUrl: "/icon.png" },
  capabilities: { premium: true, danmaku: false },
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
  options: { permissions?: string[]; role?: string; videoTarget?: string; proxyStatus?: number } = {},
) {
  const currentSession = session(options.permissions, options.role);
  const source = {
    id: "source-a", updatedAt: 1, name: "测试源", baseUrl: "https://catalog.example",
    searchPath: "/api.php/provide/vod/", detailPath: "/api.php/provide/vod/", enabled: true,
  };
  const configDocument = remoteDocument("config", [source]);
  let libraryDocument = remoteDocument("library");
  const requestOrigins: string[] = [];

  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    requestOrigins.push(url.origin);
    if (url.pathname === "/api/config") return json(route, runtimeConfig);
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
          { name: "第一集", url: options.videoTarget || "https://media.example/one.mp4", index: 0 },
          { name: "第二集", url: "https://media.example/two.mp4", index: 1 },
        ],
      },
    });
    if (url.pathname === "/api/proxy") {
      if (options.proxyStatus) {
        return route.fulfill({ status: options.proxyStatus, contentType: "text/plain", body: "upstream rejected Worker egress" });
      }
      return route.fulfill({ status: 206, headers: { "Content-Type": "video/mp4", "Content-Range": "bytes 0-3/4", "Accept-Ranges": "bytes" }, body: "test" });
    }
    return json(route, { error: { code: "NOT_FOUND" } }, 404);
  });

  return { requestOrigins };
}

test("player loads detail, falls back from the Worker media route, and switches episodes", async ({ page }) => {
  const worker = await mockMediaWorker(page.context());
  await page.goto("./player/?id=movie-1&source=source-a&title=测试影片");
  await expect(page.getByRole("heading", { name: "测试影片" })).toBeVisible();
  const video = page.getByLabel("视频播放器");
  await expect(video).toHaveAttribute("data-media-source", "https://media.example/one.mp4");
  await page.getByRole("radio", { name: "第二集" }).click();
  await expect(video).toHaveAttribute("data-media-source", "https://media.example/two.mp4");
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  expect(worker.requestOrigins.every((origin) => origin === "http://127.0.0.1:4173")).toBe(true);
});

test("smart retry rebuilds HLS on the direct URL after the Worker media route fails", async ({ page }) => {
  const target = "https://media.example/direct-fallback.m3u8";
  let directManifestRequests = 0;
  await page.context().route("https://media.example/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith(".m3u8")) {
      directManifestRequests += 1;
      return route.fulfill({ status: 200, headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/vnd.apple.mpegurl",
      }, body: "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:2\n#EXTINF:2,\nsegment.ts\n#EXT-X-ENDLIST\n" });
    }
    return route.fulfill({ status: 200, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "video/mp2t" }, body: "test" });
  });
  await mockMediaWorker(page.context(), { videoTarget: target, proxyStatus: 403 });

  await page.goto("./player/?id=movie-1&source=source-a&title=测试影片");
  const video = page.getByLabel("视频播放器");
  await expect.poll(() => directManifestRequests, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(video).toHaveAttribute("data-media-source", target);
  await expect(page.locator(".media-player")).toHaveAttribute("data-proxy-mode", "retry");
});
