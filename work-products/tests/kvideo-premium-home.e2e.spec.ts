import { expect, test, type BrowserContext, type Route } from "@playwright/test";

const capability = { profile: "paid", limits: { sources: 32, searchConcurrency: 8, maxPages: 3,
  videos: 2000, probeVideos: 100, probeConcurrency: 4, probeVariants: 4 } };
const runtime = { release: { worker: "1.0.0", pages: "0.1.2", apiContract: 1 },
  site: { name: "UXUVideo", title: "UXUVideo", description: "Private", iconUrl: "/icon.png" },
  capabilities: { premium: true, danmaku: false }, adKeywords: [],
  thirdPartyScripts: { videoTogether: { enabled: false, scriptUrl: null, settingUrl: null } }, authenticated: true };
const standardSource = { id: "standard", updatedAt: 1, name: "Standard source", baseUrl: "https://standard.example", enabled: true, group: "normal", priority: 1 };
const premiumA = { id: "premium-a", updatedAt: 1, name: "Premium A", baseUrl: "https://premium-a.example", enabled: true, group: "premium", priority: 1 };
const premiumB = { id: "premium-b", updatedAt: 1, name: "Premium B", baseUrl: "https://premium-b.example", enabled: true, group: "premium", priority: 2 };

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockPremiumWorker(context: BrowserContext) {
  let authorized = true;
  const evidence = { categoryBodies: [] as Array<{ page: number; sources: Array<{ id: string }> }>,
    searchBodies: [] as Array<{ query: string; sources: Array<{ id: string }> }>, unlocks: 0 };
  const config = { kind: "config", version: 1, updatedAt: 1, payload: { fields: {}, sources: [standardSource, premiumA, premiumB], subscriptions: [], tombstones: [] } };
  const library = { kind: "library", version: 1, updatedAt: 1, payload: { history: [
    { id: "standard-history", videoId: "s", title: "Standard secret", source: "standard", mode: "standard", updatedAt: 100, episodeIndex: 0, currentTime: 1, duration: 10 },
    { id: "premium-history", videoId: "p", title: "Premium Alpha", source: "premium-a", mode: "premium", updatedAt: 90, episodeIndex: 0, currentTime: 1, duration: 10 },
  ], favorites: [], tombstones: [] } };
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/config") return json(route, runtime);
    if (path === "/api/auth/session") return json(route, { authenticated: true, session: { accountId: "premium-home", profileId: "premium-home",
      username: "viewer", name: "Viewer", role: "viewer", customPermissions: [], mode: "managed" } });
    if (path === "/api/user/config") return json(route, config);
    if (path === "/api/user/sync") return json(route, library);
    if (path === "/api/auth" && request.method() === "POST") { evidence.unlocks += 1; authorized = true; return json(route, { valid: true }); }
    if (path === "/api/premium/types") return authorized ? json(route, { tags: [
      { id: "recommend", label: "今日推荐", value: "" },
      { id: "action", label: "欧美动作电影专区", value: "premium-a:1,premium-b:8" },
    ], capability }) : json(route, { error: { code: "PREMIUM_REQUIRED" } }, 403);
    if (path === "/api/premium/category") {
      if (!authorized) return json(route, { error: { code: "PREMIUM_REQUIRED" } }, 403);
      const body = request.postDataJSON() as { page: number; sources: Array<{ id: string }> };
      evidence.categoryBodies.push(body);
      const count = body.page === 1 ? 20 : 2;
      const videos = Array.from({ length: count }, (_, index) => ({ vod_id: `${body.page}-${index}`,
        vod_name: `Premium ${body.page}-${index}`, vod_pic: "", vod_remarks: `P${body.page}`,
        type_name: "Action", source: index % 2 ? "premium-b" : "premium-a", sourceName: index % 2 ? "Premium B" : "Premium A" }));
      return json(route, { videos, capability });
    }
    if (path === "/api/search-parallel") {
      const body = request.postDataJSON() as { query: string; sources: Array<{ id: string }> };
      evidence.searchBodies.push(body);
      const events = [
        { type: "start", totalSources: body.sources.length, capability },
        { type: "videos", source: "premium-a", videos: [{ vod_id: "search-1", vod_name: `Search ${body.query}`, source: "premium-a", sourceName: "Premium A" }] },
        { type: "progress", completedSources: body.sources.length, totalSources: body.sources.length, totalVideosFound: 1 },
        { type: "complete", totalVideosFound: 1, totalSources: body.sources.length, maxPageCount: 3 },
      ];
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") });
    }
    return json(route, { error: { code: "NOT_FOUND" } }, 404);
  });
  return { evidence, expire: () => { authorized = false; } };
}

test.describe("KVideo T29 Premium home", () => {
  test.use({ locale: "zh-CN", timezoneId: "Asia/Taipei", colorScheme: "dark", viewport: { width: 1440, height: 900 } });

  test("isolates sources and history, pages interleaved content, searches, restores authorization, and keeps TV focus", async ({ page }, testInfo) => {
    const worker = await mockPremiumWorker(page.context());
    await page.goto("./premium/");
    await expect(page.getByRole("heading", { name: "Premium 内容" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Premium Alpha" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Standard secret" })).toHaveCount(0);
    await expect(page.locator('[data-premium-stage="content"] .video-card')).toHaveCount(20);
    await expect(page.locator(".premium-tags")).toHaveAttribute("data-material", "regular");
    await expect(page.locator('[data-premium-stage="content"] .video-card').first()).not.toHaveAttribute("data-material", /.+/);
    expect(worker.evidence.categoryBodies[0].sources.map(({ id }) => id)).toEqual(["premium-a", "premium-b"]);
    await expect(page.locator(".source-badge").nth(0)).toHaveText("Premium A");
    await expect(page.locator(".source-badge").nth(1)).toHaveText("Premium B");
    await page.getByRole("button", { name: "加载更多" }).click();
    await expect(page.locator('[data-premium-stage="content"] .video-card')).toHaveCount(22);
    expect(worker.evidence.categoryBodies.at(-1)?.page).toBe(2);

    const category = page.getByRole("button", { name: "欧美动作电影专区" });
    await category.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator(":focus")).toBeVisible();
    expect(await page.locator(":focus").evaluate((element) => Boolean(element.closest('[data-premium-stage="content"]')))).toBe(true);

    await page.getByRole("button", { name: "Premium Alpha" }).click();
    await expect(page.getByRole("heading", { name: "搜索结果" })).toBeVisible();
    expect(worker.evidence.searchBodies[0].query).toBe("Premium Alpha");
    expect(worker.evidence.searchBodies[0].sources.map(({ id }) => id)).toEqual(["premium-a", "premium-b"]);

    await page.evaluate(() => scrollTo(0, 0));
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`premium-home-${width}.png`), animations: "disabled" });
    }

    await page.setViewportSize({ width: 640, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });

    worker.expire();
    await page.getByRole("button", { name: "返回分类" }).click();
    await expect(page.getByRole("heading", { name: "解锁 Premium" })).toBeVisible();
    await expect(page.locator(".auth-panel")).toHaveAttribute("data-material", "regular");
    await page.getByLabel("Premium 密码").fill("premium-password");
    await page.getByRole("button", { name: "解锁", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Premium 内容" })).toBeVisible();
    expect(worker.evidence.unlocks).toBe(1);
  });

  test("localizes loading-safe Premium home controls in all three languages", async ({ browser }) => {
    for (const scenario of [
      { locale: "zh-CN", heading: "Premium 内容", search: "搜索 Premium 内容" },
      { locale: "zh-TW", heading: "Premium 內容", search: "搜尋 Premium 內容" },
      { locale: "en-US", heading: "Premium content", search: "Search Premium content" },
    ]) {
      const context = await browser.newContext({ locale: scenario.locale });
      await mockPremiumWorker(context);
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:4173/premium/");
      await expect(page.getByRole("heading", { name: scenario.heading })).toBeVisible();
      await expect(page.getByLabel(scenario.search)).toBeVisible();
      await context.close();
    }
  });
});
