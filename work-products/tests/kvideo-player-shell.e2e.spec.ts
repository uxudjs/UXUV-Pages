import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";
import axe from "axe-core";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const runtime = {
  release: { worker: "2.0.0", pages: "0.3.0", apiContract: 2 },
  site: { name: "UXUVideo", title: "UXUVideo", description: "Private video", iconUrl: "/icon.png" },
  capabilities: { premium: true, danmaku: false }, adKeywords: [],
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
const candidateDir = resolve(dirname(fileURLToPath(import.meta.url)), ...(
  process.env.UXUV_WRITE_VISUAL_CANDIDATE === "1"
    ? ["fixtures", "ui-review", "section21-candidate"]
    : ["work", "section21-candidate-draft"]
));

async function settleCandidate(page: Page) {
  await page.addStyleTag({ content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}.sync-status{display:none!important}" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode().catch(() => undefined)));
    window.scrollTo(0, 0);
    (document.activeElement as HTMLElement | null)?.blur();
    await new Promise<void>((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame())));
  });
  await page.mouse.move(0, 0);
}

async function clearCandidateScrollFixture(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 150));
    window.scrollTo(0, 0);
    const suffix = `${location.pathname}${location.search}`;
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith("scroll-pos:") && key.endsWith(suffix)) sessionStorage.removeItem(key);
    }
    await new Promise<void>((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame())));
  });
}

async function expectPlayerNavbarClear(page: Page, label: string) {
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await new Promise<void>((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame())));
  });
  const geometry = await page.evaluate(() => {
    const bounds = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    };
    const navbar = document.querySelector<HTMLElement>(".player-navbar")!;
    const glass = document.querySelector<HTMLElement>(".player-navbar-glass")!;
    const control = document.querySelector<HTMLElement>(".player-viewport-control");
    const player = document.querySelector<HTMLElement>(".media-player")!;
    const next = control && control.getClientRects().length > 0 ? control : player;
    return {
      navbar: bounds(navbar),
      glass: bounds(glass),
      next: bounds(next),
      nextSelector: next === control ? ".player-viewport-control" : ".media-player",
    };
  });
  expect(
    geometry.navbar.bottom,
    `${label}: .player-navbar must not cover ${geometry.nextSelector}; ${JSON.stringify(geometry)}`,
  ).toBeLessThanOrEqual(geometry.next.top + 1);
  expect(
    geometry.next.top - geometry.glass.bottom,
    `${label}: .player-navbar-glass needs at least 8px before ${geometry.nextSelector}; ${JSON.stringify(geometry)}`,
  ).toBeGreaterThanOrEqual(7);
}

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
    if (url.pathname === "/api/app-update") return json(route, { currentVersion: "2.0.0", latestVersion: "2.0.0", status: "up-to-date", checkedRemotely: true });
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
  test.use({ locale: "zh-CN", timezoneId: "Asia/Taipei", colorScheme: "dark", serviceWorkers: "block" });
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

  test("switches grouped sources and 51 episodes while keeping cinema navigation and content aligned", async ({ page }) => {
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
    await expect.poll(() => page.getByRole("radio", { name: /第 51 集/ }).evaluate((element) => {
      const item = element.getBoundingClientRect();
      const strip = element.parentElement!.getBoundingClientRect();
      return item.left >= strip.left - 1 && item.right <= strip.right + 1;
    })).toBe(true);
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
    await page.getByRole("button", { name: "切换为列表" }).click();

    const actor = page.getByRole("link", { name: "示例演员" });
    await expect(actor).toHaveAttribute("href", /movie\.douban\.com\/celebrities\/search\?search_text=/);
    await expect(page.getByRole("link", { name: "示例导演" })).toHaveAttribute("target", "_blank");
    await page.getByRole("button", { name: "收藏", exact: true }).click();
    await expect(page.getByRole("button", { name: "取消收藏" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => worker.documents.library.payload.favorites?.length).toBe(1);
    await expect(page.locator(".player-favorite-row")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "打开设置" })).toHaveText("V");
    await expect(page.getByRole("link", { name: "打开设置" })).toHaveAttribute("href", "/settings");
    await expect(page.getByLabel("语言")).toHaveCount(0);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("button", { name: "影院" }).click();
    const geometry = await page.evaluate(() => {
      const rect = (selector: string) => {
        const bounds = document.querySelector(selector)!.getBoundingClientRect();
        return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom };
      };
      return {
        navbar: rect(".player-navbar-glass"), control: rect(".player-viewport-control"),
        player: rect(".media-player"), episodes: rect(".episode-panel"), metadata: rect(".desktop-metadata"),
        actionOrder: [".player-navbar-favorite button", ".player-navbar-actions .nav-user", ".player-navbar-actions .theme-switcher button"]
          .map((selector) => rect(selector).left),
      };
    });
    for (const boundary of [geometry.control, geometry.player, geometry.episodes, geometry.metadata]) {
      expect(Math.abs(boundary.left - geometry.navbar.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(boundary.right - geometry.navbar.right)).toBeLessThanOrEqual(1);
    }
    expect(geometry.episodes.top).toBeGreaterThanOrEqual(geometry.player.bottom);
    expect(geometry.actionOrder[0]).toBeLessThan(geometry.actionOrder[1]);
    expect(geometry.actionOrder[1]).toBeLessThan(geometry.actionOrder[2]);

    const episodeStrip = page.locator(".episode-options");
    await episodeStrip.evaluate((element) => { element.scrollLeft = 0; });
    await episodeStrip.dispatchEvent("wheel", { deltaY: 240, shiftKey: true });
    await expect.poll(() => episodeStrip.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() => ({
        viewport: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        offenders: [...document.querySelectorAll<HTMLElement>("body *")].flatMap((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.right > innerWidth + 1 || bounds.left < -1
            ? [{ className: typeof element.className === "string" ? element.className : element.tagName,
              left: bounds.left, right: bounds.right, scrollWidth: element.scrollWidth }] : [];
        }).slice(0, 8),
      }));
      expect(overflow.scrollWidth, `horizontal overflow at ${width}px: ${JSON.stringify(overflow)}`).toBe(width);
      const edges = await page.evaluate(() => {
        const selectors = [".player-navbar-glass", ".media-player", ".episode-panel", ".player-viewport-control", ".desktop-metadata"];
        return selectors.flatMap((selector) => {
          const element = document.querySelector<HTMLElement>(selector);
          if (!element || element.getClientRects().length === 0) return [];
          const bounds = element.getBoundingClientRect();
          return [{ selector, left: bounds.left, right: bounds.right }];
        });
      });
      for (const edge of edges.slice(1)) {
        expect(Math.abs(edge.left - edges[0].left), `${edge.selector} left edge at ${width}px`).toBeLessThanOrEqual(1);
        expect(Math.abs(edge.right - edges[0].right), `${edge.selector} right edge at ${width}px`).toBeLessThanOrEqual(1);
      }
    }
    await page.setViewportSize({ width: 320, height: 900 });
    await expect.poll(() => episodeStrip.evaluate((element) => ({ overflow: getComputedStyle(element).overflowX,
      touchAction: getComputedStyle(element).touchAction }))).toMatchObject({ overflow: "auto", touchAction: "pan-x" });
    await page.setViewportSize({ width: 768, height: 900 });
    await page.getByRole("tab", { name: "简介" }).click();
    await page.evaluate(() => localStorage.setItem("uxuv-locale:player-account", "zh-TW"));
    await page.reload();
    await page.getByRole("tab", { name: "簡介" }).click();
    await expect(page.getByRole("tab", { name: "簡介" })).toHaveAttribute("aria-selected", "true");
    await page.evaluate(() => localStorage.setItem("uxuv-locale:player-account", "en"));
    await page.reload();
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

  test("captures the final API 2 ready-player candidates in all languages and breakpoints", async ({ page }) => {
    await page.addInitScript((items) => sessionStorage.setItem("uxuv-grouped-sources:v1:player-candidate", JSON.stringify(items)), groupedSources);
    await mockPlayerWorker(page.context());
    mkdirSync(candidateDir, { recursive: true });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    const playerUrl = "./player/?id=movie-a&source=source-a&title=示例影片&episode=0&gs=player-candidate";
    await page.goto(playerUrl);
    for (const locale of ["zh-CN", "zh-TW", "en"] as const) {
      await page.evaluate(({ key, value }) => {
        localStorage.setItem(key, value);
        localStorage.setItem("uxuv-player-viewport:v1:player-account:standard", "standard");
      }, { key: "uxuv-locale:player-account", value: locale });
      for (const width of [320, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await clearCandidateScrollFixture(page);
        await page.goto(playerUrl);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.locator(".player-ready")).toBeVisible();
        await page.locator("video").evaluate((video) => {
          video.dispatchEvent(new Event("loadedmetadata"));
          video.dispatchEvent(new Event("canplay"));
        });
        await expect(page.locator('.media-player[data-phase="ready"]')).toBeVisible();
        await expect(page.getByText("示例影片 第 1 集", { exact: true })).toBeVisible();
        await expect(page.locator(".player-skip-rule-trigger")).toBeVisible();
        await expect(page.getByRole("radio", { name: /第 1 集/ }).first()).toBeVisible();
        await expect(page.locator(".app-update-trigger")).toContainText("2.0.0");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await settleCandidate(page);
        await expectPlayerNavbarClear(page, `${locale} at ${width}px`);
        const panelContainment = await page.evaluate(() => {
          const panel = document.querySelector<HTMLElement>(".episode-panel")!;
          const style = getComputedStyle(panel);
          const panelBox = panel.getBoundingClientRect();
          const contentRight = panelBox.left + panel.clientLeft + panel.clientWidth
            - Number.parseFloat(style.paddingRight || "0");
          const sourceControl = panel.querySelector<HTMLElement>(".source-selector > .player-panel-heading > button")!;
          const episodeControl = panel.querySelector<HTMLElement>(".episode-selector > .player-panel-heading > div button:last-child")!;
          const episodeButtons = [...panel.querySelectorAll<HTMLElement>(".episode-options button")];
          return {
            clientWidth: panel.clientWidth,
            scrollWidth: panel.scrollWidth,
            contentRight,
            sourceControlRight: sourceControl.getBoundingClientRect().right,
            episodeControlRight: episodeControl.getBoundingClientRect().right,
            episodeButtonRight: Math.max(...episodeButtons.map((button) => button.getBoundingClientRect().right)),
          };
        });
        expect(
          panelContainment.scrollWidth,
          `${locale}/${width}: episode panel has internal horizontal overflow: ${JSON.stringify(panelContainment)}`,
        ).toBeLessThanOrEqual(panelContainment.clientWidth + 1);
        for (const [name, right] of [
          ["source control", panelContainment.sourceControlRight],
          ["episode control", panelContainment.episodeControlRight],
          ["episode option", panelContainment.episodeButtonRight],
        ] as const) {
          expect(
            right,
            `${locale}/${width}: ${name} exceeds panel content: ${JSON.stringify(panelContainment)}`,
          ).toBeLessThanOrEqual(panelContainment.contentRight + 1);
        }
        const floatingControls = await page.evaluate(() => {
          const rect = (selector: string) => {
            const box = document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
            return {
              left: box.left,
              right: box.right,
              top: box.top,
              bottom: box.bottom,
              width: box.width,
              height: box.height,
            };
          };
          const history = rect(".history-sidebar-toggle");
          const skip = rect(".player-skip-rule-trigger");
          const currentSource = rect(".current-source");
          const overlapWidth = Math.max(0, Math.min(history.right, skip.right) - Math.max(history.left, skip.left));
          const overlapHeight = Math.max(0, Math.min(history.bottom, skip.bottom) - Math.max(history.top, skip.top));
          const sourceOverlapWidth = Math.max(0,
            Math.min(history.right, currentSource.right) - Math.max(history.left, currentSource.left));
          const sourceVerticalOverlap = Math.max(0,
            Math.min(history.bottom, currentSource.bottom) - Math.max(history.top, currentSource.top));
          return {
            history,
            skip,
            currentSource,
            overlapArea: overlapWidth * overlapHeight,
            sourceVerticalOverlap,
            sourceOverlapArea: sourceOverlapWidth * sourceVerticalOverlap,
            sourceGap: history.left - currentSource.right,
          };
        });
        expect(
          floatingControls.overlapArea,
          `${locale}/${width}: history toggle overlaps skip trigger: ${JSON.stringify(floatingControls)}`,
        ).toBe(0);
        expect(
          floatingControls.sourceOverlapArea,
          `${locale}/${width}: history toggle overlaps current source: ${JSON.stringify(floatingControls)}`,
        ).toBe(0);
        if (floatingControls.sourceVerticalOverlap > 0) {
          expect(
            floatingControls.sourceGap,
            `${locale}/${width}: missing 8px history/current-source gap: ${JSON.stringify(floatingControls)}`,
          ).toBeGreaterThanOrEqual(7);
        }
        if (width <= 520) {
          expect(
            floatingControls.history.left - floatingControls.skip.right,
            `${locale}/${width}: missing 8px history/skip gap: ${JSON.stringify(floatingControls)}`,
          ).toBeGreaterThanOrEqual(7);
          expect(floatingControls.skip.height).toBeGreaterThanOrEqual(44);
          expect(floatingControls.history.width).toBe(50);
          expect(floatingControls.history.height).toBe(50);
        }
        await expect.poll(() => page.evaluate(() => ({ x: scrollX, y: scrollY })))
          .toEqual({ x: 0, y: 0 });
        await page.screenshot({ path: resolve(candidateDir, `routes-player-ready-${locale}-${width}.png`), fullPage: true, animations: "disabled" });
      }
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await page.setViewportSize({ width: 640, height: 900 });
    await settleCandidate(page);
    await expectPlayerNavbarClear(page, "200% text at 640px");
    const reflow = await page.evaluate(() => {
      const rect = (element: HTMLElement) => {
        const bounds = element.getBoundingClientRect();
        return { selector: element.className, left: bounds.left, right: bounds.right, width: bounds.width, height: bounds.height };
      };
      return {
        viewport: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        regions: [".player-navbar-actions", ".theme-switcher", ".history-sidebar-toggle"]
          .map((selector) => rect(document.querySelector<HTMLElement>(selector)!)),
        actionTargets: [...document.querySelectorAll<HTMLElement>(".player-navbar-actions button, .player-navbar-actions a")].map(rect),
        floatingTargets: [".favorites-sidebar-toggle", ".history-sidebar-toggle"]
          .map((selector) => rect(document.querySelector<HTMLElement>(selector)!)),
        offenders: [...document.querySelectorAll<HTMLElement>("body *")].flatMap((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.right > innerWidth + 1 || bounds.left < -1
            ? [{ className: typeof element.className === "string" ? element.className : element.tagName,
              left: bounds.left, right: bounds.right, scrollWidth: element.scrollWidth }] : [];
        }).slice(0, 8),
      };
    });
    expect(reflow.scrollWidth, `horizontal overflow at 200%: ${JSON.stringify(reflow)}`).toBe(640);
    for (const region of reflow.regions) {
      expect(region.left, `200% region starts outside viewport: ${JSON.stringify(region)}`).toBeGreaterThanOrEqual(-1);
      expect(region.right, `200% region ends outside viewport: ${JSON.stringify(region)}`).toBeLessThanOrEqual(641);
    }
    for (const target of reflow.actionTargets) {
      expect(Math.min(target.width, target.height), `player action target below 44px: ${JSON.stringify(target)}`).toBeGreaterThanOrEqual(44);
    }
    for (const target of reflow.floatingTargets) {
      expect(Math.min(target.width, target.height), `floating target below its existing 50px box: ${JSON.stringify(target)}`).toBeGreaterThanOrEqual(50);
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  });
});
