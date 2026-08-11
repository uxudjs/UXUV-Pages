import { expect, test, type BrowserContext, type Route } from "@playwright/test";
import axe from "axe-core";

type HomeMode = "success" | "empty" | "error";

const session = {
  accountId: "viewer-home",
  profileId: "viewer-home",
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

const source = {
  id: "source-home",
  updatedAt: 1,
  name: "Fixture source",
  baseUrl: "https://media.example",
  enabled: true,
};

const syncDocument = (kind: "config" | "library") => ({
  kind,
  version: 0,
  updatedAt: null,
  payload: kind === "config"
    ? { fields: {}, sources: [source], subscriptions: [], tombstones: [] }
    : { history: [], favorites: [], tombstones: [] },
});

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockHomeWorker(
  context: BrowserContext,
  initialMode: HomeMode = "success",
  deferred = false,
  searchResultTitle?: string,
) {
  let mode = initialMode;
  let releaseRequest = () => {};
  let pending = deferred ? new Promise<void>((resolve) => { releaseRequest = resolve; }) : Promise.resolve();
  const homeRequests: string[] = [];
  const tagRequests: string[] = [];
  const searchRequests: unknown[] = [];

  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/config") return json(route, runtimeConfig);
    if (url.pathname === "/api/auth/session") return json(route, { authenticated: true, session });
    if (url.pathname === "/api/user/config") return json(route, syncDocument("config"));
    if (url.pathname === "/api/user/sync") return json(route, syncDocument("library"));
    if (url.pathname === "/api/douban/tags") {
      tagRequests.push(request.url());
      return json(route, { tags: url.searchParams.get("type") === "tv" ? ["热门", "纪录片", "高级"] : ["热门", "喜剧", "高级"] });
    }
    if (url.pathname === "/api/douban/recommend") {
      homeRequests.push(request.url());
      await pending;
      if (mode === "error") return json(route, { error: { message: "Upstream unavailable" } }, 503);
      const selectedTag = url.searchParams.get("tag");
      const selectedType = url.searchParams.get("type");
      const subjects = selectedTag === "纪录片"
        ? [{ id: "tv-documentary", title: "纪录片精选", cover: "placeholder-poster.svg", rate: "9.1", url: "" }]
        : selectedType === "tv"
          ? [{ id: "tv-1", title: "示例电视剧", cover: "placeholder-poster.svg", rate: "8.6", url: "" }]
          : [
              { id: "movie-1", title: "示例电影", cover: "/missing-poster.jpg", rate: "8.8", url: "" },
              { id: "movie-2", title: "示例剧集", cover: "placeholder-poster.svg", rate: "8.2", url: "" },
              { id: "movie-3", title: "示例纪录片", cover: "placeholder-poster.svg", rate: "9.0", url: "" },
            ];
      return json(route, { subjects: mode === "empty" ? [] : subjects });
    }
    if (url.pathname === "/api/search-parallel") {
      const searchRequest = request.postDataJSON() as { query: string };
      searchRequests.push(searchRequest);
      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: [
          { type: "start", totalSources: 1 },
          { type: "videos", source: source.id, videos: [{ vod_id: "video-1", vod_name: searchResultTitle ?? searchRequest.query }] },
          { type: "complete", totalVideosFound: 1 },
        ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
      });
    }
    return json(route, { error: { code: "NOT_FOUND" } }, 404);
  });

  return {
    homeRequests,
    tagRequests,
    searchRequests,
    release: () => {
      releaseRequest();
      pending = Promise.resolve();
    },
    setMode: (nextMode: HomeMode) => { mode = nextMode; },
  };
}

test.describe("reviewed KVideo basic home", () => {
  test.use({ locale: "zh-CN", timezoneId: "Asia/Taipei", colorScheme: "dark" });

  test("uses the same-origin feed and keeps the approved grid usable at four breakpoints", async ({ page }) => {
    const worker = await mockHomeWorker(page.context(), "success", true);
    await page.setViewportSize({ width: 320, height: 1000 });
    await page.goto("./");
    await expect(page.locator(".kvideo-home-state[role=status]")).toContainText("正在加载热门内容");
    worker.release();
    await expect(page.getByRole("button", { name: "播放 示例电影" })).toBeVisible();
    await expect(page.getByRole("button", { name: "播放 示例电影" }).locator("img"))
      .toHaveAttribute("src", /placeholder-poster\.svg$/);

    const request = new URL(worker.homeRequests[0]);
    expect(request.origin).toBe(new URL(page.url()).origin);
    expect(request.pathname).toBe("/api/douban/recommend");
    expect(request.searchParams.get("type")).toBe("movie");
    expect(request.searchParams.get("tag")).toBe("热门");

    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: width === 320 ? 1000 : 900 });
      const grid = page.locator(".kvideo-movie-grid");
      await expect(grid.locator(":scope > *")).toHaveCount(3);
      await expect(grid).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }

    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () => {
      const api = (window as unknown as { axe: typeof import("axe-core") }).axe;
      const result = await api.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
      return result.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
    });
    expect(violations).toEqual([]);

    const input = page.getByLabel("搜索视频内容");
    await input.fill("电影");
    await input.focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "清除搜索" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "搜索", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "电影", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "电视剧", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "管理标签", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "热门", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "喜剧", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "高级", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "播放 示例电影" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect.poll(() => worker.searchRequests.length).toBe(1);
    expect(worker.searchRequests[0]).toMatchObject({ query: "示例电影" });
    await expect(page).toHaveURL(/\/player\?id=video-1&source=source-home&title=/);
  });

  test("keeps empty, failure, and retry states deterministic", async ({ page }) => {
    const worker = await mockHomeWorker(page.context(), "empty");
    await page.goto("./");
    await expect(page.locator(".kvideo-home-state[role=status]")).toHaveText("暂无内容");

    worker.setMode("error");
    await page.reload();
    await expect(page.locator(".kvideo-home-state[role=alert]")).toContainText("无法加载热门内容");
    await expect(page.getByRole("button", { name: "重试" })).toBeFocused();

    worker.setMode("success");
    await page.getByRole("button", { name: "重试" }).click();
    await expect(page.getByRole("button", { name: "播放 示例电影" })).toBeVisible();
  });

  test("keeps unrelated search results visible instead of opening the wrong home movie", async ({ page }) => {
    const worker = await mockHomeWorker(page.context(), "success", false, "不相关影片");
    await page.goto("./");

    await page.getByRole("button", { name: "播放 示例电影" }).click();

    await expect.poll(() => worker.searchRequests.length).toBe(1);
    await expect(page).not.toHaveURL(/\/player\?/);
    await expect(page.getByText("不相关影片", { exact: true })).toBeVisible();
  });

  test("opens a decorated title returned for the selected home movie", async ({ page }) => {
    const worker = await mockHomeWorker(page.context(), "success", false, "示例电影（2026）");
    await page.goto("./");

    await page.getByRole("button", { name: "播放 示例电影" }).click();

    await expect.poll(() => worker.searchRequests.length).toBe(1);
    await expect(page).toHaveURL(/\/player\?id=video-1&source=source-home&title=/);
  });

  test("switches movie, TV, and server-provided Douban categories inside the reviewed home shell", async ({ page }) => {
    const worker = await mockHomeWorker(page.context());
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("./");

    const movie = page.getByRole("button", { name: "电影", exact: true });
    const television = page.getByRole("button", { name: "电视剧", exact: true });
    await expect(movie).toHaveAttribute("aria-pressed", "true");
    await expect(television).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("button", { name: "热门", exact: true })).toHaveAttribute("aria-pressed", "true");

    const movieBox = await movie.boundingBox();
    const televisionBox = await television.boundingBox();
    expect(movieBox && { x: Math.round(movieBox.x), y: Math.round(movieBox.y), width: Math.round(movieBox.width), height: Math.round(movieBox.height) })
      .toEqual({ x: 357, y: 229, width: 155, height: 40 });
    expect(televisionBox && { x: Math.round(televisionBox.x), y: Math.round(televisionBox.y), width: Math.round(televisionBox.width), height: Math.round(televisionBox.height) })
      .toEqual({ x: 512, y: 229, width: 155, height: 40 });

    await television.click();
    await expect(television).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "播放 示例电视剧" })).toBeVisible();
    const tvRequest = new URL(worker.homeRequests.at(-1)!);
    expect(tvRequest.searchParams.get("type")).toBe("tv");
    expect(tvRequest.searchParams.get("tag")).toBe("热门");
    expect(new URL(worker.tagRequests.at(-1)!).searchParams.get("type")).toBe("tv");

    await page.getByRole("button", { name: "纪录片", exact: true }).click();
    await expect(page.getByRole("button", { name: "播放 纪录片精选" })).toBeVisible();
    expect(new URL(worker.homeRequests.at(-1)!).searchParams.get("tag")).toBe("纪录片");

    await movie.focus();
    await page.keyboard.press("Tab");
    await expect(television).toBeFocused();
    await page.getByRole("button", { name: "高级", exact: true }).click();
    await expect(page).toHaveURL(/\/premium\/?$/);
  });

  test("preserves original queries while history, conversion, keyboard, and account isolation stay deterministic", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("uxuv-search-history:v1:other-user:standard", JSON.stringify([{ query: "其他账户", timestamp: 1 }]));
      localStorage.setItem("uxuv-search-history:v1:viewer-home:premium", JSON.stringify([{ query: "Premium历史", timestamp: 1 }]));
    });
    const worker = await mockHomeWorker(page.context());
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("./");

    const input = page.getByLabel("搜索视频内容");
    const search = page.getByRole("button", { name: "搜索", exact: true });
    const inputBox = await input.boundingBox();
    const searchBox = await search.boundingBox();
    expect(inputBox && { x: Math.round(inputBox.x), y: Math.round(inputBox.y), width: Math.round(inputBox.width), height: Math.round(inputBox.height) })
      .toEqual({ x: 128, y: 130, width: 768, height: 62 });
    expect(searchBox && { x: Math.round(searchBox.x), y: Math.round(searchBox.y), width: Math.round(searchBox.width), height: Math.round(searchBox.height) })
      .toEqual({ x: 780, y: 137, width: 108, height: 48 });

    await input.fill("繁體電影");
    await input.dispatchEvent("compositionstart");
    await page.keyboard.press("Enter");
    expect(worker.searchRequests).toHaveLength(0);
    await input.dispatchEvent("compositionend");
    await page.keyboard.press("Enter");
    await expect.poll(() => worker.searchRequests.length).toBe(1);
    expect(worker.searchRequests[0]).toMatchObject({ query: "繁体电影" });
    await expect(input).toHaveValue("繁體電影");

    await page.reload();
    await input.focus();
    await expect(page.getByRole("listbox", { name: "搜索历史" })).toBeVisible();
    await expect(page.getByRole("option", { name: /繁體電影/ })).toBeVisible();
    await expect(page.getByRole("option", { name: /其他账户|Premium历史/ })).toHaveCount(0);
    await page.addScriptTag({ content: axe.source });
    const historyViolations = await page.evaluate(async () => {
      const api = (window as unknown as { axe: typeof import("axe-core") }).axe;
      const result = await api.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
      return result.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
    });
    expect(historyViolations).toEqual([]);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect.poll(() => worker.searchRequests.length).toBe(2);
    expect(worker.searchRequests[1]).toMatchObject({ query: "繁体电影" });
    await expect(input).toHaveValue("繁體電影");

    await page.getByRole("button", { name: "清除搜索" }).focus();
    await page.keyboard.press("Enter");
    await input.focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Delete");
    await expect(page.getByRole("listbox", { name: "搜索历史" })).toHaveCount(0);

    for (const query of ["Alpha", "Beta"]) {
      await input.fill(query);
      await page.keyboard.press("Enter");
      await expect.poll(() => worker.searchRequests.length).toBe(query === "Alpha" ? 3 : 4);
      await page.getByRole("button", { name: "清除搜索" }).focus();
      await page.keyboard.press("Enter");
    }
    await input.focus();
    const historyListbox = page.getByRole("listbox", { name: "搜索历史" });
    await expect(historyListbox.getByRole("option").allTextContents()).resolves.toEqual(expect.arrayContaining([expect.stringMatching(/Beta/), expect.stringMatching(/Alpha/)]));
    const historyOptions = historyListbox.getByRole("option");
    expect(await historyOptions.nth(0).textContent()).toContain("Beta");
    await page.getByRole("button", { name: "清除所有历史" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("listbox", { name: "搜索历史" })).toHaveCount(0);

    await page.setViewportSize({ width: 320, height: 1000 });
    const mobileInputBox = await input.boundingBox();
    const mobileSearchBox = await search.boundingBox();
    expect(mobileInputBox && { x: Math.round(mobileInputBox.x), y: Math.round(mobileInputBox.y), width: Math.round(mobileInputBox.width), height: Math.round(mobileInputBox.height) })
      .toEqual({ x: 16, y: 112, width: 288, height: 50 });
    expect(mobileSearchBox && { x: Math.round(mobileSearchBox.x), y: Math.round(mobileSearchBox.y), width: Math.round(mobileSearchBox.width), height: Math.round(mobileSearchBox.height) })
      .toEqual({ x: 244, y: 115, width: 52, height: 44 });
  });
});

for (const [locale, expected] of [
  ["zh-CN", { lang: "zh-CN", label: "搜索视频内容", button: "搜索", history: "搜索历史", clear: "清除所有历史" }],
  ["zh-TW", { lang: "zh-TW", label: "搜尋影視內容", button: "搜尋", history: "搜尋記錄", clear: "清除所有記錄" }],
  ["en-US", { lang: "en", label: "Search videos", button: "Search", history: "Search history", clear: "Clear all history" }],
] as const) {
  test.describe(`basic home locale ${locale}`, () => {
    test.use({ locale });
    test("renders localized controls", async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem("uxuv-search-history:v1:viewer-home:standard", JSON.stringify([{ query: "History", timestamp: 1 }]));
      });
      await mockHomeWorker(page.context(), "empty");
      await page.goto("./");
      await expect(page.getByLabel(expected.label)).toBeVisible();
      await expect(page.getByRole("button", { name: expected.button, exact: true })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", expected.lang);
      await page.getByLabel(expected.label).focus();
      await expect(page.getByRole("listbox", { name: expected.history })).toBeVisible();
      await expect(page.getByRole("button", { name: expected.clear })).toBeVisible();
      await expect(page.getByRole("option", { name: "History" })).toHaveAttribute("aria-keyshortcuts", "Delete");
    });
  });
}
