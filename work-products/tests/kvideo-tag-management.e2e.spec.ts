import { expect, test, type BrowserContext, type Route } from "@playwright/test";
import axe from "axe-core";

const session = {
  accountId: "viewer-tags",
  profileId: "viewer-tags",
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

const history = [
  { id: "history-a", updatedAt: 2, videoId: "watched-a", title: "看过甲", source: "fixture" },
  { id: "history-b", updatedAt: 1, videoId: "watched-b", title: "看过乙", source: "fixture" },
];

const syncDocument = (kind: "config" | "library") => ({
  kind,
  version: 0,
  updatedAt: null,
  payload: kind === "config"
    ? { fields: {}, sources: [{ id: "source", updatedAt: 1, name: "Fixture", baseUrl: "https://media.example", enabled: true }], subscriptions: [], tombstones: [] }
    : { history, favorites: [], tombstones: [] },
});

const subject = (id: string, title = id) => ({ id, title, cover: "placeholder-poster.svg", rate: "8.8", url: "" });

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockT09Worker(context: BrowserContext, delaySecondPage = false) {
  const recommendationRequests: string[] = [];
  let releaseSecondPage = () => {};
  const secondPageGate = delaySecondPage
    ? new Promise<void>((resolve) => { releaseSecondPage = resolve; })
    : Promise.resolve();

  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/config") return json(route, runtimeConfig);
    if (url.pathname === "/api/auth/session") return json(route, { authenticated: true, session });
    if (url.pathname === "/api/user/config") return json(route, syncDocument("config"));
    if (url.pathname === "/api/user/sync") return json(route, syncDocument("library"));
    if (url.pathname === "/api/douban/tags") {
      return json(route, { tags: url.searchParams.get("type") === "tv" ? ["热门", "纪录片"] : ["热门", "喜剧", "动作"] });
    }
    if (url.pathname === "/api/douban/recommend") {
      recommendationRequests.push(route.request().url());
      const type = url.searchParams.get("type");
      const tag = url.searchParams.get("tag");
      const start = Number(url.searchParams.get("page_start"));
      if (tag === "看过甲") return json(route, { subjects: start === 0
        ? [subject("watched-a", "看过甲"), subject("shared", "共同推荐"), subject("rec-a", "推荐甲"), ...Array.from({ length: 5 }, (_, index) => subject(`rec-a-${index}`, `甲类推荐 ${index}`))]
        : [subject("shared", "共同推荐"), subject("rec-more-a", "推荐更多甲")] });
      if (tag === "看过乙") return json(route, { subjects: start === 0
        ? [subject("shared", "共同推荐"), subject("rec-b", "推荐乙"), ...Array.from({ length: 6 }, (_, index) => subject(`rec-b-${index}`, `乙类推荐 ${index}`))]
        : [subject("rec-more-a", "推荐更多甲"), subject("rec-more-b", "推荐更多乙")] });
      if (type === "tv") return json(route, { subjects: Array.from({ length: 20 }, (_, index) => subject(`tv-${start + index}`, `电视剧 ${start + index}`)) });
      if (start === 20) {
        await secondPageGate;
        const subjects = delaySecondPage
          ? [subject("stale-movie", "过期电影")]
          : [subject("popular-19", "热门 19"), subject("popular-20", "热门 20"), subject("popular-21", "热门 21")];
        try { return await json(route, { subjects }); } catch { return; }
      }
      return json(route, { subjects: Array.from({ length: 20 }, (_, index) => subject(`popular-${index}`, `热门 ${index}`)) });
    }
    if (url.pathname === "/api/search-parallel") {
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: "data: {\"type\":\"complete\"}\n\n" });
    }
    return json(route, { error: { code: "NOT_FOUND" } }, 404);
  });

  return { recommendationRequests, releaseSecondPage };
}

test.describe("KVideo T09 tags, recommendations, and pagination", () => {
  test.use({ locale: "zh-CN", timezoneId: "Asia/Taipei", colorScheme: "dark" });

  test("adds, deletes, restores, keyboard-sorts, and isolates persisted tags", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("uxuv-home-tags:v1:viewer-tags:premium:movie", JSON.stringify(["Premium仅"]));
    });
    const worker = await mockT09Worker(page.context());
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("./");

    const managerBox = await page.getByRole("button", { name: "管理标签" }).boundingBox();
    const recommendationTagBox = await page.getByRole("button", { name: "为你推荐", exact: true }).boundingBox();
    expect(managerBox && { x: Math.round(managerBox.x), y: Math.round(managerBox.y), height: Math.round(managerBox.height) })
      .toEqual({ x: 32, y: 314, height: 20 });
    expect(recommendationTagBox && { x: Math.round(recommendationTagBox.x), y: Math.round(recommendationTagBox.y), height: Math.round(recommendationTagBox.height) })
      .toEqual({ x: 36, y: 366, height: 40 });
    await page.setViewportSize({ width: 320, height: 1000 });
    const mobileManagerBox = await page.getByRole("button", { name: "管理标签" }).boundingBox();
    const mobileRecommendationTagBox = await page.getByRole("button", { name: "为你推荐", exact: true }).boundingBox();
    expect(mobileManagerBox && { x: Math.round(mobileManagerBox.x), y: Math.round(mobileManagerBox.y), height: Math.round(mobileManagerBox.height) })
      .toEqual({ x: 16, y: 284, height: 20 });
    expect(mobileRecommendationTagBox && { x: Math.round(mobileRecommendationTagBox.x), y: Math.round(mobileRecommendationTagBox.y), height: Math.round(mobileRecommendationTagBox.height) })
      .toEqual({ x: 20, y: 336, height: 40 });
    await page.getByRole("button", { name: "为你推荐", exact: true }).click();
    await expect(page.getByRole("button", { name: "电影", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "搜索 推荐甲" })).toBeVisible();
    await expect(page.getByRole("link", { name: "搜索 推荐乙" })).toBeVisible();
    await expect(page.getByRole("link", { name: "搜索 看过甲" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "搜索 共同推荐" })).toHaveCount(1);
    await page.locator("[data-infinite-sentinel]").scrollIntoViewIfNeeded();
    await expect.poll(() => worker.recommendationRequests.some((request) => {
      const url = new URL(request);
      return url.searchParams.get("tag") === "看过甲" && url.searchParams.get("page_start") === "8";
    })).toBe(true);
    await expect(page.getByRole("link", { name: "搜索 推荐更多甲" })).toBeVisible();
    await page.getByRole("button", { name: "热门", exact: true }).click();
    await expect(page.getByRole("button", { name: "电影", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Premium仅", exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "管理标签" }).click();
    await expect(page.locator(".kvideo-popular-feed")).toHaveCount(0);
    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () => {
      const api = (window as unknown as { axe: typeof import("axe-core") }).axe;
      const result = await api.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
      return result.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
    });
    expect(violations).toEqual([]);
    await page.getByLabel("新标签").fill("科幻");
    await page.getByRole("button", { name: "添加", exact: true }).click();
    await expect(page.getByRole("button", { name: "删除 科幻" })).toBeVisible();
    await page.getByRole("button", { name: "删除 科幻" }).click();
    await expect(page.getByRole("button", { name: "删除 科幻" })).toHaveCount(0);

    await page.getByLabel("新标签").fill("科幻");
    await page.getByRole("button", { name: "添加", exact: true }).click();
    await page.getByRole("button", { name: "排序 科幻" }).focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Space");
    await page.getByRole("button", { name: "完成", exact: true }).click();

    const standardKey = await page.evaluate(() => Object.keys(localStorage).find((key) => key.includes("uxuv-home-tags:v1:viewer-tags:standard:movie")));
    expect(standardKey).toBeTruthy();
    await page.reload();
    await expect(page.getByRole("button", { name: "科幻", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "电视剧", exact: true }).click();
    await expect(page.getByRole("button", { name: "纪录片", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "科幻", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "电影", exact: true }).click();
    await expect(page.getByRole("button", { name: "科幻", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "管理标签" }).click();
    await page.getByRole("button", { name: "恢复默认标签" }).click();
    await expect(page.getByRole("button", { name: "管理标签" })).toBeVisible();
    await expect(page.getByRole("button", { name: "科幻", exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("uxuv-home-tags:v1:viewer-tags:premium:movie"))).toBe('["Premium仅"]');
  });

  test("appends unique popular titles and stops at a short page", async ({ page }) => {
    const worker = await mockT09Worker(page.context());
    await page.goto("./");
    const popularCards = page.locator(".kvideo-popular-feed .kvideo-movie-link");
    await expect(popularCards).toHaveCount(20);
    await page.locator("[data-infinite-sentinel]").scrollIntoViewIfNeeded();
    await expect.poll(() => worker.recommendationRequests.some((request) => new URL(request).searchParams.get("page_start") === "20")).toBe(true);
    await expect(popularCards).toHaveCount(22);
    await expect(page.locator("[data-infinite-sentinel]")).toHaveCount(0);
  });

  test("does not append a cancelled stale page after switching content type", async ({ page }) => {
    const worker = await mockT09Worker(page.context(), true);
    await page.goto("./");
    await expect(page.locator(".kvideo-popular-feed .kvideo-movie-link")).toHaveCount(20);
    await page.locator("[data-infinite-sentinel]").scrollIntoViewIfNeeded();
    await expect.poll(() => worker.recommendationRequests.some((request) => new URL(request).searchParams.get("page_start") === "20")).toBe(true);

    await page.getByRole("button", { name: "电视剧", exact: true }).click();
    await expect(page.getByRole("link", { name: "搜索 电视剧 0" })).toBeVisible();
    worker.releaseSecondPage();
    await expect(page.getByRole("link", { name: "搜索 过期电影" })).toHaveCount(0);
  });
});
