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
type Payload = { fields?: Record<string, unknown>; sources?: Record<string, unknown>[]; subscriptions?: unknown[];
  history?: Record<string, unknown>[]; favorites?: Record<string, unknown>[]; tombstones: unknown[] };
type Document = { kind: Kind; version: number; updatedAt: number; payload: Payload };
const sources = Array.from({ length: 7 }, (_, index) => ({
  id: `source-${String.fromCharCode(97 + index)}`, updatedAt: 1, name: `Source ${String.fromCharCode(65 + index)}`,
  baseUrl: `https://catalog-${index}.example`, enabled: true, group: "normal", priority: index + 1,
}));
const groupedSources = sources.map((source, index) => ({
  id: `movie-${String.fromCharCode(97 + index)}`, source: source.id, sourceName: source.name,
  typeName: index < 4 ? "Movie" : "Series", remarks: `${1080 - index * 10}P`,
}));

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockPlayerWorker(context: BrowserContext) {
  const documents: Record<Kind, Document> = {
    config: { kind: "config", version: 1, updatedAt: 1, payload: { fields: {}, sources, subscriptions: [], tombstones: [] } },
    library: { kind: "library", version: 1, updatedAt: 1, payload: { history: [{
      id: "source-a:history-movie", updatedAt: 1, videoId: "history-movie", title: "历史影片", source: "source-a",
      episodeIndex: 49, playbackPosition: 12, duration: 100, mode: "standard",
    }], favorites: [], tombstones: [] } },
  };
  const apiOrigins: string[] = [];
  await context.route("**/api/**", async (route) => {
    const request = route.request(); const url = new URL(request.url()); const method = request.method();
    apiOrigins.push(url.origin);
    if (url.pathname === "/api/config") return json(route, runtime);
    if (url.pathname === "/api/auth/session") return json(route, { authenticated: true, session: {
      accountId: "player-account", profileId: "player-account", username: "viewer", name: "Viewer", role: "viewer", customPermissions: [], mode: "managed",
    } });
    const kind: Kind | null = url.pathname === "/api/user/config" ? "config" : url.pathname === "/api/user/sync" ? "library" : null;
    if (kind && method === "GET") return json(route, documents[kind]);
    if (kind && method === "POST") {
      const body = request.postDataJSON() as { payload: Payload };
      documents[kind] = { kind, version: documents[kind].version + 1, updatedAt: Date.now(), payload: body.payload };
      return json(route, documents[kind]);
    }
    if (url.pathname === "/api/detail") {
      const body = request.postDataJSON() as { id: string; source: { id: string } };
      const empty = body.id === "empty-movie";
      return json(route, { success: true, data: {
        vod_id: body.id, vod_name: body.id === "history-movie" ? "历史影片" : "示例影片", source: body.source.id,
        vod_pic: "/placeholder-poster.svg", vod_remarks: "用于固定播放页壳层。", vod_content: "用于固定播放页壳层的合成简介。",
        vod_year: "2026", vod_area: "测试区域", vod_lang: "普通话", vod_actor: "示例演员，演员乙", vod_director: "示例导演",
        type_name: "剧情", episodes: empty ? [] : Array.from({ length: 51 }, (_, index) => ({
          name: `第 ${index + 1} 集`, url: `https://media.example/${body.source.id}/${index + 1}.mp4`, index,
        })),
      } });
    }
    if (url.pathname === "/api/proxy") return route.fulfill({ status: 206, headers: { "Content-Type": "video/mp4", "Content-Range": "bytes 0-3/4" }, body: "test" });
    return json(route, { error: { code: "NOT_FOUND" } }, 404);
  });
  return { documents, apiOrigins };
}

test.describe("KVideo T21 player shell", () => {
  test.use({ locale: "zh-CN", timezoneId: "Asia/Taipei", colorScheme: "dark" });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const addEventListener = HTMLMediaElement.prototype.addEventListener;
      HTMLMediaElement.prototype.addEventListener = function addStableMediaListener(this: HTMLMediaElement, type: string,
        listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
        if (type === "error") return;
        return addEventListener.call(this, type, listener as EventListener, options);
      } as typeof HTMLMediaElement.prototype.addEventListener;
    });
  });

  test("switches grouped sources and 51 episodes, toggles favorite, localizes, and keeps the reviewed layout", async ({ page }) => {
    await page.addInitScript((items) => sessionStorage.setItem("uxuv-grouped-sources:v1:player-group", JSON.stringify(items)), groupedSources);
    const worker = await mockPlayerWorker(page.context());
    await page.goto("./player/?id=movie-a&source=source-a&title=示例影片&episode=50&gs=player-group");
    await expect(page.getByRole("heading", { name: "示例影片" })).toBeVisible();
    await expect(page.getByLabel("视频播放器")).not.toHaveAttribute("controls");
    await expect(page.getByRole("button", { name: "播放", exact: true })).toHaveCount(2);
    await expect(page.getByRole("button", { name: "播放", exact: true }).first()).toBeVisible();
    await expect(page.getByRole("radio", { name: /第 51 集/ })).toHaveAttribute("aria-current", "true");
    await expect(page.getByRole("button", { name: "1-50" })).toBeVisible();
    await expect(page.getByRole("button", { name: "51-51" })).toHaveAttribute("aria-current", "page");

    await page.getByRole("button", { name: "切换为列表" }).click();
    await expect(page.getByRole("radio", { name: "第 1 集" })).toBeVisible();
    await page.getByRole("radio", { name: "第 1 集" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("radio", { name: "第 2 集" })).toBeFocused();

    await page.locator(".current-source").click();
    await expect(page.getByRole("heading", { name: "Movie" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Source F" })).toHaveCount(0);
    await page.getByRole("button", { name: /展开更多/ }).click();
    await page.getByRole("button", { name: "Source B" }).click();
    await expect(page).toHaveURL(/source=source-b/);
    await expect(page.getByLabel("视频播放器")).toHaveAttribute("data-media-source", /source-b%2F51\.mp4/);

    const actor = page.getByRole("link", { name: "示例演员" });
    await expect(actor).toHaveAttribute("href", /movie\.douban\.com\/celebrities\/search\?search_text=/);
    await expect(page.getByRole("link", { name: "示例导演" })).toHaveAttribute("target", "_blank");
    await page.getByRole("button", { name: "收藏", exact: true }).click();
    await expect(page.getByRole("button", { name: "取消收藏" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => worker.documents.library.payload.favorites?.length).toBe(1);

    await page.setViewportSize({ width: 1440, height: 900 });
    const tops = await page.evaluate(() => [document.querySelector(".media-player")?.getBoundingClientRect().top,
      document.querySelector(".episode-panel")?.getBoundingClientRect().top]);
    expect(Math.abs(Number(tops[0]) - Number(tops[1]))).toBeLessThanOrEqual(2);
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 768, height: 900 });
    await page.getByRole("tab", { name: "简介" }).click();
    await page.getByLabel("语言").selectOption("zh-TW");
    await expect(page.getByRole("tab", { name: "簡介" })).toHaveAttribute("aria-selected", "true");
    await page.getByLabel("語言").selectOption("en");
    await expect(page.getByRole("tab", { name: "Info" })).toBeVisible();
    await page.addScriptTag({ content: axe.source });
    expect((await page.evaluate(async () => (await (window as unknown as { axe: typeof import("axe-core") }).axe.run(document)).violations))
      .filter(({ impact }) => impact === "serious" || impact === "critical")).toEqual([]);
    expect(worker.apiOrigins.every((origin) => origin === "http://127.0.0.1:4173")).toBe(true);
  });

  test("migrates legacy grouped URLs and preserves empty, missing, and history episode states", async ({ page }) => {
    await mockPlayerWorker(page.context());
    const legacy = encodeURIComponent(JSON.stringify(groupedSources.slice(0, 2)));
    await page.goto(`./player/?id=movie-a&source=source-a&title=示例影片&groupedSources=${legacy}`);
    await expect(page.getByRole("heading", { name: "示例影片" })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.has("groupedSources")).toBe(false);
    await expect.poll(() => new URL(page.url()).searchParams.has("gs")).toBe(true);
    expect(await page.evaluate(() => Object.keys(sessionStorage).some((key) => key.startsWith("uxuv-grouped-sources:v1:")))).toBe(true);

    await page.getByRole("button", { name: "打开观看历史" }).click();
    await expect(page.getByRole("link", { name: /继续播放 历史影片/ })).toHaveAttribute("href", /episode=49/);
    await page.getByRole("dialog", { name: "观看历史" }).getByRole("button", { name: "关闭观看历史" }).click();
    await page.goto("./player/?id=empty-movie&source=source-a&title=空影片");
    await expect(page.getByText("当前视频没有可播放的剧集。")).toBeVisible();
    await page.goto("./player/");
    await expect(page.getByRole("heading", { name: "无法开始播放" })).toBeVisible();
  });
});
