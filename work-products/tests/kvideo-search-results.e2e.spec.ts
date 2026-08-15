import { expect, test, type BrowserContext, type Route } from "@playwright/test";
import axe from "axe-core";

const session = {
  accountId: "viewer-results",
  profileId: "viewer-results",
  username: "viewer",
  name: "Viewer",
  role: "viewer",
  customPermissions: [],
  mode: "managed",
};
const runtimeConfig = {
  release: { worker: "1.0.0", pages: "0.1.2", apiContract: 1 },
  site: { name: "UXUVideo", title: "UXUVideo", description: "Private video", iconUrl: "/icon.png" },
  capabilities: { premium: true, iptv: true, danmaku: false },
  adKeywords: [],
  thirdPartyScripts: { videoTogether: { enabled: false, scriptUrl: null, settingUrl: null } },
  authenticated: true,
};
const sources = [
  { id: "source-a", updatedAt: 1, name: "来源甲", baseUrl: "https://a.example", enabled: true },
  { id: "source-b", updatedAt: 1, name: "来源乙", baseUrl: "https://b.example", enabled: true },
];
const freeCapability = {
  profile: "free", limits: { sources: 12, searchConcurrency: 5, maxPages: 3, videos: 500,
    probeVideos: 6, probeConcurrency: 3, probeVariants: 2 },
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockWorker(context: BrowserContext) {
  const pingRequests: unknown[] = [];
  const probeRequests: unknown[] = [];
  await context.addInitScript((capability) => {
    const nativeFetch = window.fetch.bind(window);
    let release = () => {};
    Object.defineProperty(window, "__releaseT11Search", { configurable: true, value: () => release() });
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
      if (url.pathname !== "/api/search-parallel") return nativeFetch(input, init);
      const encoder = new TextEncoder();
      const event = (value: unknown) => encoder.encode(`data: ${JSON.stringify(value)}\n\n`);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(event({ type: "start", totalSources: 2, capability }));
          controller.enqueue(event({ type: "videos", source: "source-a", videos: [{
            vod_id: "a-1", vod_name: "同名电影", vod_pic: "/placeholder-poster.svg", vod_remarks: "更新至 12 集",
            vod_year: "2026", type_name: "剧情", vod_lang: "国语", sourceDisplayName: "来源甲",
          }] }));
          release = () => {
            controller.enqueue(event({ type: "videos", source: "source-b", videos: [
              { vod_id: "b-2", vod_name: " 同名电影 ", vod_pic: "/placeholder-poster.svg", vod_year: "2025", type_name: "剧情", vod_lang: "粤语", sourceDisplayName: "来源乙" },
              { vod_id: "b-3", vod_name: "另一部电影", vod_pic: "/placeholder-poster.svg", vod_year: "2024", type_name: "纪录片", vod_lang: "英语", sourceDisplayName: "来源乙" },
            ] }));
            controller.enqueue(event({ type: "videos", source: "source-a", videos: [{ vod_id: "a-1", vod_name: "同名电影", sourceDisplayName: "来源甲" }] }));
            controller.enqueue(event({ type: "progress", completedSources: 2, totalVideosFound: 3 }));
            controller.enqueue(event({ type: "complete" }));
            controller.close();
          };
          Object.defineProperty(window, "__releaseT11Search", { configurable: true, value: () => release() });
        },
      });
      return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    };
  }, freeCapability);
  await context.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/config") return json(route, runtimeConfig);
    if (path === "/api/auth/session") return json(route, { authenticated: true, session });
    if (path === "/api/user/config") return json(route, { kind: "config", version: 0, updatedAt: null, payload: { fields: {}, sources, subscriptions: [], tombstones: [] } });
    if (path === "/api/user/sync") return json(route, { kind: "library", version: 0, updatedAt: null, payload: { history: [], favorites: [], tombstones: [] } });
    if (path === "/api/douban/tags") return json(route, { tags: ["热门"] });
    if (path === "/api/douban/recommend") return json(route, { subjects: [] });
    if (path === "/api/ping") {
      const body = route.request().postDataJSON() as { url?: string };
      pingRequests.push(body);
      return json(route, { success: true, latency: body.url?.includes("b.example") ? 40 : 180 });
    }
    if (path === "/api/probe-resolution") {
      const body = route.request().postDataJSON() as { videos?: { id?: string; source?: string }[] };
      probeRequests.push(body);
      const video = body.videos?.[0];
      if (video?.id === "b-3") return json(route, { error: { code: "PROBE_FAILED", message: "探测失败" } }, 502);
      const events = [
        { type: "start", capability: freeCapability },
        { id: video?.id, source: video?.source, resolution: { width: 1920, height: 1080, label: "1080P" } },
        { done: true },
      ];
      return route.fulfill({ status: 200, contentType: "text/event-stream",
        body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") });
    }
    return json(route, { error: { code: "NOT_FOUND" } }, 404);
  });
  return { pingRequests, probeRequests };
}

async function search(page: import("@playwright/test").Page) {
  await page.getByLabel("搜索视频内容").fill("电影");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
}

test.describe("KVideo T11 streamed result cards", () => {
  test.use({ locale: "zh-CN", timezoneId: "Asia/Taipei", colorScheme: "dark" });

  test("renders stable incremental cards and fixed source, type, and language metadata", async ({ page }) => {
    await mockWorker(page.context());
    await page.addInitScript(() => {
      localStorage.setItem("uxuv-search-display:v1:other-account:standard", "grouped");
      localStorage.setItem("uxuv-search-display:v1:viewer-results:standard", "normal");
    });
    await page.goto("./");
    await search(page);

    await expect(page.locator('[data-result-id="source-a:a-1"]')).toBeVisible();
    await expect(page.locator('[data-result-kind="video"]')).toHaveCount(1);
    await expect(page.getByText("来源甲", { exact: true })).toBeVisible();
    await page.locator('[data-result-id="source-a:a-1"]').hover();
    await expect(page.locator('[data-result-id="source-a:a-1"] .kvideo-result-type').getByText("剧情", { exact: true })).toBeVisible();
    await expect(page.locator(".kvideo-result-meta").getByText("国语", { exact: true })).toBeVisible();

    await page.evaluate(() => (window as unknown as { __releaseT11Search: () => void }).__releaseT11Search());
    await expect(page.locator('[data-result-kind="video"]')).toHaveCount(3);
    await expect(page.locator("[data-result-id]").evaluateAll((items) => items.map((item) => item.getAttribute("data-result-id"))))
      .resolves.toEqual(["source-a:a-1", "source-b:b-2", "source-b:b-3"]);
    await expect(page.getByRole("heading", { name: "同名电影" })).toHaveCount(2);
    await page.addStyleTag({ content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}" });

    const referenceGeometry = {
      320: { gridHeight: 568, card: [0, 0, 138, 278], poster: [17, 17, 104, 156], copy: [17, 173, 104, 88], title: [29, 185, 80, 40] },
      768: { gridHeight: 315, card: [0, 0, 168, 315], poster: [25, 25, 118, 177], copy: [25, 202, 118, 88], title: [37, 214, 94, 40] },
      1024: { gridHeight: 322, card: [0, 0, 173, 322], poster: [25, 25, 123, 184], copy: [25, 209, 123, 88], title: [37, 221, 99, 40] },
      1440: { gridHeight: 337, card: [0, 0, 183, 337], poster: [25, 25, 133, 199], copy: [25, 224, 133, 88], title: [37, 236, 109, 40] },
    } as const;
    for (const width of [320, 768, 1024, 1440] as const) {
      await page.setViewportSize({ width, height: width === 320 ? 1000 : 900 });
      await page.mouse.move(width - 1, 0);
      const grid = page.locator(".kvideo-result-grid");
      const geometry = await grid.evaluate((element) => {
        const root = element.getBoundingClientRect();
        const box = (candidate: Element | null) => {
          if (!candidate) return null;
          const rectangle = candidate.getBoundingClientRect();
          return [Math.round(rectangle.x - root.x), Math.round(rectangle.y - root.y), Math.round(rectangle.width), Math.round(rectangle.height)];
        };
        const card = element.firstElementChild;
        return { raw: { gridHeight: root.height, cardHeight: card?.getBoundingClientRect().height ?? 0 },
          card: box(card), poster: box(card?.querySelector(".kvideo-result-poster") ?? null),
          copy: box(card?.querySelector(".kvideo-result-copy") ?? null), title: box(card?.querySelector("h3") ?? null),
          state: card ? { hover: card.matches(":hover"), focus: card.matches(":focus-within"), transform: getComputedStyle(card).transform } : null };
      });
      const { gridHeight, ...expectedBoxes } = referenceGeometry[width];
      expect(geometry.state).toEqual({ hover: false, focus: false, transform: "none" });
      expect({ card: geometry.card, poster: geometry.poster, copy: geometry.copy, title: geometry.title }).toEqual(expectedBoxes);
      expect(Math.round(geometry.raw.gridHeight)).toBe(gridHeight);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }

    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () => {
      const api = (window as unknown as { axe: typeof import("axe-core") }).axe;
      const result = await api.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
      return result.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
    });
    expect(violations).toEqual([]);
  });

  test("groups trimmed case-insensitive titles and keeps the mode account-scoped", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("uxuv-search-display:v1:viewer-results:standard", "grouped"));
    await mockWorker(page.context());
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("./");
    await search(page);
    await page.evaluate(() => (window as unknown as { __releaseT11Search: () => void }).__releaseT11Search());

    await expect(page.locator('[data-result-kind="group"]')).toHaveCount(2);
    const group = page.locator('[data-result-kind="group"]').filter({ hasText: "同名电影" });
    await expect(group).toContainText("2 源");
    await expect(page.locator(".kvideo-result-grid")).toHaveScreenshot("slices/search-results-grouped-1024.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.005,
    });
    await page.setViewportSize({ width: 320, height: 1000 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    const target = group.getByRole("link", { name: /同名电影/ });
    await target.click();
    await expect(page).toHaveURL(/\/player\?.*id=a-1.*source=source-a/);
  });

  test("filters, stably sorts, pings, blocks categories, and probes without dropping failures", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("uxuv-search-display:v1:viewer-results:standard", "normal"));
    const worker = await mockWorker(page.context());
    await page.goto("./");
    await search(page);
    await page.evaluate(() => (window as unknown as { __releaseT11Search: () => void }).__releaseT11Search());
    await expect(page.locator('[data-result-kind="video"]')).toHaveCount(3);
    await expect(page.getByText(/每次最多探测 6 条/)).toBeVisible();

    await page.getByRole("button", { name: /来源乙2/ }).click();
    await expect(page.locator('[data-result-kind="video"]')).toHaveCount(2);
    await page.getByRole("button", { name: /剧情2/ }).click();
    await expect(page.locator('[data-result-kind="video"]')).toHaveCount(1);
    await page.getByRole("button", { name: /清除筛选/ }).click();

    await page.getByRole("combobox", { name: "排序", exact: true }).selectOption("date-asc");
    await expect(page.locator("[data-result-id]").evaluateAll((items) => items.map((item) => item.getAttribute("data-result-id"))))
      .resolves.toEqual(["source-b:b-3", "source-b:b-2", "source-a:a-1"]);

    await page.getByLabel("实时延迟").check();
    await expect.poll(() => worker.pingRequests.length).toBe(2);
    await page.getByRole("combobox", { name: "排序", exact: true }).selectOption("latency-asc");
    await expect(page.locator("[data-result-id]").evaluateAll((items) => items.map((item) => item.getAttribute("data-result-id"))))
      .resolves.toEqual(["source-b:b-2", "source-b:b-3", "source-a:a-1"]);
    await expect(page.locator('[data-result-id="source-b:b-2"]')).toContainText("40 ms");

    const failedCard = page.locator('[data-result-id="source-b:b-3"]');
    await failedCard.hover();
    await failedCard.getByRole("button", { name: "探测清晰度 另一部电影" }).click();
    await expect(failedCard.getByRole("alert")).toContainText("探测失败");
    await expect(failedCard).toBeVisible();
    const successCard = page.locator('[data-result-id="source-a:a-1"]');
    await successCard.hover();
    await successCard.getByRole("button", { name: "探测清晰度 同名电影" }).click();
    await expect(successCard.getByRole("button", { name: "探测清晰度 同名电影" })).toHaveText("1080P");
    expect(worker.probeRequests).toHaveLength(2);

    await page.getByPlaceholder("例如：伦理").fill("纪录");
    await page.getByRole("button", { name: "屏蔽类别", exact: true }).click();
    await expect(page.locator('[data-result-id="source-b:b-3"]')).toHaveCount(0);
    await page.reload();
    expect(await page.evaluate(() => localStorage.getItem("uxuv-search-policy:v1:viewer-results:standard"))).toContain("纪录");
  });
});
