import { expect, test, type BrowserContext, type Route } from "@playwright/test";

const runtime = {
  release: { worker: "1.0.0", pages: "0.1.2", apiContract: 1 },
  site: { name: "UXUVideo", title: "UXUVideo", description: "Private video", iconUrl: "/icon.png" },
  capabilities: { premium: true, iptv: false, danmaku: false }, adKeywords: [],
  sources: { subscriptionSources: "", iptvSources: "", mergeSources: false, danmakuApiUrl: "" },
  thirdPartyScripts: { videoTogether: { enabled: false, scriptUrl: null, settingUrl: null } }, authenticated: true,
};
const source = { id: "desktop-source", updatedAt: 1, name: "Desktop Source", baseUrl: "https://catalog.example",
  enabled: true, group: "normal", priority: 1 };

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockWorker(context: BrowserContext,
  videoTogether: { enabled: boolean; scriptUrl: string | null; settingUrl: string | null }
    = runtime.thirdPartyScripts.videoTogether,
  videoTogetherUserEnabled = false) {
  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/config") return json(route, {
      ...runtime,
      thirdPartyScripts: { videoTogether },
    });
    if (url.pathname === "/api/auth/session") return json(route, { authenticated: true, session: {
      accountId: "desktop-account", profileId: "desktop-account", username: "viewer", name: "Viewer",
      role: "viewer", customPermissions: [], mode: "managed",
    } });
    if (url.pathname === "/api/user/config") return json(route, { kind: "config", version: 1, updatedAt: 1,
      payload: { fields: videoTogetherUserEnabled ? { videoTogetherEnabled: { value: true, updatedAt: 1 } } : {},
        sources: [source], subscriptions: [], tombstones: [] } });
    if (url.pathname === "/api/user/sync") return json(route, { kind: "library", version: 1, updatedAt: 1,
      payload: { history: [], favorites: [], tombstones: [] } });
    if (url.pathname === "/api/detail") return json(route, { data: {
      vod_id: "desktop-movie", vod_name: "桌面播放器", source: source.id, vod_pic: "/placeholder-poster.svg",
      vod_content: "桌面播放器控制层固定测试。", episodes: [{ name: "第 1 集", index: 0, url: "https://media.example/video.mp4" }],
    } });
    if (url.pathname === "/api/proxy") return route.fulfill({ status: 206, contentType: "video/mp4", body: "test" });
    return json(route, { error: { code: "NOT_FOUND" } }, 404);
  });
}

async function installVirtualMediaClock(context: BrowserContext, suppressErrors = true) {
  await context.addInitScript((shouldSuppressErrors) => {
    type MediaState = { paused: boolean; currentTime: number; volume: number; muted: boolean; playbackRate: number; src: string };
    const states = new WeakMap<HTMLMediaElement, MediaState>();
    let virtualDuration = 0;
    Object.defineProperty(window, "__setVirtualMediaDuration", { value: (value: number) => { virtualDuration = value; } });
    const addEventListener = HTMLMediaElement.prototype.addEventListener;
    HTMLMediaElement.prototype.addEventListener = function addVirtualMediaListener(this: HTMLMediaElement, type: string,
      listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
      if (shouldSuppressErrors && type === "error") return;
      return addEventListener.call(this, type, listener as EventListener, options);
    } as typeof HTMLMediaElement.prototype.addEventListener;
    const state = (media: HTMLMediaElement) => {
      let value = states.get(media);
      if (!value) { value = { paused: true, currentTime: 0, volume: 1, muted: false, playbackRate: 1, src: "" }; states.set(media, value); }
      return value;
    };
    Object.defineProperties(HTMLMediaElement.prototype, {
      paused: { configurable: true, get() { return state(this as HTMLMediaElement).paused; } },
      duration: { configurable: true, get() { return virtualDuration; } },
      currentTime: { configurable: true, get() { return state(this as HTMLMediaElement).currentTime; }, set(value: number) {
        state(this as HTMLMediaElement).currentTime = value; this.dispatchEvent(new Event("timeupdate"));
      } },
      volume: { configurable: true, get() { return state(this as HTMLMediaElement).volume; }, set(value: number) {
        state(this as HTMLMediaElement).volume = value; this.dispatchEvent(new Event("volumechange"));
      } },
      muted: { configurable: true, get() { return state(this as HTMLMediaElement).muted; }, set(value: boolean) {
        state(this as HTMLMediaElement).muted = value; this.dispatchEvent(new Event("volumechange"));
      } },
      playbackRate: { configurable: true, get() { return state(this as HTMLMediaElement).playbackRate; }, set(value: number) {
        state(this as HTMLMediaElement).playbackRate = value; this.dispatchEvent(new Event("ratechange"));
      } },
      src: { configurable: true, get() { return state(this as HTMLMediaElement).src; }, set(value: string) {
        state(this as HTMLMediaElement).src = value;
      } },
    });
    HTMLMediaElement.prototype.load = function load() {
      queueMicrotask(() => {
        this.dispatchEvent(new Event("durationchange"));
        this.dispatchEvent(new Event("loadedmetadata"));
        this.dispatchEvent(new Event("canplay"));
      });
    };
    HTMLMediaElement.prototype.play = function play() {
      state(this).paused = false; this.dispatchEvent(new Event("play")); return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function pause() {
      if (state(this).paused) return;
      state(this).paused = true; this.dispatchEvent(new Event("pause"));
    };
  }, suppressErrors);
}

interface DeviceCapabilities {
  standardPiP?: boolean;
  androidPiP?: boolean;
  cast?: boolean;
  systemFullscreen?: boolean;
}

async function installDeviceCapabilities(context: BrowserContext, capabilities: DeviceCapabilities) {
  await context.addInitScript((options) => {
    const evidence = { orientationLocks: 0, orientationUnlocks: 0, nativeFullscreenRequests: 0,
      standardPiPRequests: 0, androidPiPRequests: 0, castSessionRequests: 0, castLoad: null as null | { url: string; currentTime: number } };
    Object.defineProperty(window, "__t23DeviceEvidence", { value: evidence });

    const orientation = screen.orientation as ScreenOrientation & { lock?: () => Promise<void>; unlock?: () => void };
    Object.defineProperty(orientation, "lock", { configurable: true, value: async () => { evidence.orientationLocks += 1; } });
    Object.defineProperty(orientation, "unlock", { configurable: true, value: () => { evidence.orientationUnlocks += 1; } });

    const fullscreenState: { element: Element | null } = { element: null };
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, get: () => Boolean(options.systemFullscreen) });
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullscreenState.element });
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { configurable: true, value: options.systemFullscreen
      ? function requestFullscreen(this: HTMLElement) {
        evidence.nativeFullscreenRequests += 1;
        fullscreenState.element = this;
        document.dispatchEvent(new Event("fullscreenchange"));
        return Promise.resolve();
      } : undefined });
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: async () => {
      fullscreenState.element = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    } });

    const pipState: { element: Element | null } = { element: null };
    Object.defineProperty(document, "pictureInPictureEnabled", { configurable: true, get: () => Boolean(options.standardPiP) });
    Object.defineProperty(document, "pictureInPictureElement", { configurable: true, get: () => pipState.element });
    Object.defineProperty(HTMLVideoElement.prototype, "requestPictureInPicture", { configurable: true, value: options.standardPiP
      ? function requestPictureInPicture(this: HTMLVideoElement) {
        evidence.standardPiPRequests += 1;
        pipState.element = this;
        this.dispatchEvent(new Event("enterpictureinpicture"));
        return Promise.resolve({});
      } : undefined });
    Object.defineProperty(document, "exitPictureInPicture", { configurable: true, value: async () => {
      pipState.element?.dispatchEvent(new Event("leavepictureinpicture"));
      pipState.element = null;
    } });

    if (options.androidPiP) {
      Object.defineProperty(window, "KVideoAndroid", { configurable: true, value: {
        isPictureInPictureSupported: () => true,
        enterPictureInPicture: () => { evidence.androidPiPRequests += 1; return true; },
      } });
    }

    if (options.cast) {
      class MediaInfo {
        constructor(public contentId: string, public contentType: string) {}
      }
      class LoadRequest {
        currentTime = 0;
        constructor(public media: MediaInfo) {}
      }
      const session = { loadMedia: async (request: LoadRequest) => {
        evidence.castLoad = { url: request.media.contentId, currentTime: request.currentTime };
      } };
      const castContext = {
        setOptions: () => undefined,
        requestSession: async () => { evidence.castSessionRequests += 1; },
        getCurrentSession: () => session,
      };
      Object.defineProperty(window, "cast", { configurable: true, value: { framework: { CastContext: { getInstance: () => castContext } } } });
      const chromeObject = (window as Window & { chrome?: Record<string, unknown> }).chrome ?? {};
      chromeObject.cast = { media: { DEFAULT_MEDIA_RECEIVER_APP_ID: "mock-receiver", MediaInfo, LoadRequest },
        AutoJoinPolicy: { ORIGIN_SCOPED: "origin_scoped" } };
      Object.defineProperty(window, "chrome", { configurable: true, value: chromeObject });
    }
  }, capabilities);
}

async function readDeviceEvidence(page: import("@playwright/test").Page) {
  return page.evaluate(() => (window as unknown as { __t23DeviceEvidence: {
    orientationLocks: number; orientationUnlocks: number; nativeFullscreenRequests: number;
    standardPiPRequests: number; androidPiPRequests: number; castSessionRequests: number;
    castLoad: null | { url: string; currentTime: number };
  } }).__t23DeviceEvidence);
}

async function dispatchTouchEnd(page: import("@playwright/test").Page, side: "left" | "right") {
  await page.locator("video").evaluate((video, selectedSide) => {
    const rect = video.getBoundingClientRect();
    const event = new Event("touchend", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "changedTouches", { value: [{ clientX: rect.left + rect.width * (selectedSide === "left" ? 0.25 : 0.75) }] });
    video.dispatchEvent(event);
  }, side);
}

async function installPlaybackLifecycleState(context: BrowserContext) {
  await context.addInitScript(() => {
    let playbackNow = 100_000;
    Date.now = () => playbackNow;
    Object.defineProperty(window, "__advancePlaybackNow", { value: (milliseconds: number) => { playbackNow += milliseconds; } });
    sessionStorage.setItem("uxuv-grouped-sources:v1:t24-sources", JSON.stringify({ storedAt: playbackNow, data: [
      { id: "movie-a", source: "source-a", sourceName: "Source A", latency: 100 },
      { id: "movie-b", source: "source-b", sourceName: "Source B", latency: 20 },
      { id: "movie-c", source: "source-c", sourceName: "Source C", latency: 50 },
    ] }));
  });
}

async function mockPlaybackLifecycleWorker(context: BrowserContext, proxyMode: "none" | "retry" | "always" = "retry") {
  const lifecycleSources = [
    { id: "source-a", updatedAt: 1, name: "Source A", baseUrl: "https://a.example", enabled: true, group: "normal", priority: 1 },
    { id: "source-b", updatedAt: 1, name: "Source B", baseUrl: "https://b.example", enabled: true, group: "normal", priority: 2 },
    { id: "source-c", updatedAt: 1, name: "Source C", baseUrl: "https://c.example", enabled: true, group: "normal", priority: 3 },
  ];
  const evidence = { syncPosts: 0, detailSources: [] as string[], pingUrls: [] as string[], probeBatches: [] as string[][] };
  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/config") return json(route, runtime);
    if (url.pathname === "/api/auth/session") return json(route, { authenticated: true, session: {
      accountId: "lifecycle-account", profileId: "lifecycle-account", username: "viewer", name: "Viewer",
      role: "viewer", customPermissions: [], mode: "managed",
    } });
    if (url.pathname === "/api/user/config") return json(route, { kind: "config", version: 1, updatedAt: 1,
      payload: { fields: { proxyMode: { value: proxyMode, updatedAt: 1 }, showModeIndicator: { value: true, updatedAt: 1 } },
        sources: lifecycleSources, subscriptions: [], tombstones: [] } });
    if (url.pathname === "/api/user/sync" && route.request().method() === "POST") {
      evidence.syncPosts += 1;
      const document = route.request().postDataJSON() as Record<string, unknown>;
      return json(route, { ...document, version: Number(document.version || 0) + 1, updatedAt: Date.now() });
    }
    if (url.pathname === "/api/user/sync") return json(route, { kind: "library", version: 1, updatedAt: 1,
      payload: { history: [{ id: "source-a:movie-a", updatedAt: 50_000, videoId: "movie-a", title: "Lifecycle Video",
        source: "source-a", episodeIndex: 0, playbackPosition: 42, duration: 100, mode: "standard" }], favorites: [], tombstones: [] } });
    if (url.pathname === "/api/ping") {
      const body = route.request().postDataJSON() as { url?: string };
      const target = body.url || "";
      evidence.pingUrls.push(target);
      return json(route, { success: true, latency: target.includes("b.example") ? 20 : target.includes("c.example") ? 50 : 100 });
    }
    if (url.pathname === "/api/probe-resolution") {
      const body = route.request().postDataJSON() as { videos?: Array<{ id: string; source: string }> };
      const videos = body.videos || [];
      evidence.probeBatches.push(videos.map(({ source }) => source));
      const labels: Record<string, { width: number; height: number; label: string }> = {
        "source-a": { width: 1920, height: 1080, label: "1080P" },
        "source-b": { width: 1280, height: 720, label: "720P" },
        "source-c": { width: 3840, height: 2160, label: "4K" },
      };
      const events = ["data: {\"type\":\"start\",\"capability\":{\"profile\":\"free\",\"limits\":{}}}\n\n",
        ...videos.map(({ id, source }) => `data: ${JSON.stringify({ id, source, resolution: labels[source] })}\n\n`), "data: {\"done\":true}\n\n"];
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: events.join("") });
    }
    if (url.pathname === "/api/detail") {
      const body = route.request().postDataJSON() as { source?: { id?: string } };
      const sourceId = body.source?.id || "source-a";
      evidence.detailSources.push(sourceId);
      const suffix = sourceId.at(-1) || "a";
      return json(route, { data: { vod_id: `movie-${suffix}`, vod_name: "Lifecycle Video", source: sourceId,
        vod_pic: "/placeholder-poster.svg", vod_content: "Lifecycle fixture",
        episodes: [{ name: "Episode 1", index: 0, url: `https://media-${suffix}.example/video.mp4` }] } });
    }
    if (url.pathname === "/api/proxy") return route.fulfill({ status: 206, contentType: "video/mp4", headers: {
      "Accept-Ranges": "bytes", "Content-Range": "bytes 0-3/4",
    }, body: "test" });
    return json(route, { error: { code: "NOT_FOUND" } }, 404);
  });
  return evidence;
}

async function localLibrary(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    for (let index = 0; index < localStorage.length; index += 1) {
      const raw = localStorage.getItem(localStorage.key(index) || "");
      if (!raw) continue;
      try {
        const value = JSON.parse(raw) as { kind?: string; revision?: number; payload?: { history?: unknown[] } };
        if (value.kind === "library") return { revision: value.revision || 0, history: value.payload?.history || [] };
      } catch { /* unrelated storage */ }
    }
    return { revision: -1, history: [] };
  });
}

test.describe("KVideo T22 desktop player", () => {
  test.use({ locale: "zh-CN", timezoneId: "Asia/Taipei", colorScheme: "dark", viewport: { width: 1440, height: 900 } });

  test("drives controls, virtual time, shortcuts, deterministic hiding, and reduced motion", async ({ page }) => {
    await installVirtualMediaClock(page.context());
    await mockWorker(page.context());
    await page.goto("./player/?id=desktop-movie&source=desktop-source&episode=0");
    const video = page.getByLabel("视频播放器");
    const player = page.locator(".media-player");
    const overlay = page.locator(".desktop-player-overlay");
    const bottom = page.locator(".desktop-player-controls");
    await expect(video).not.toHaveAttribute("controls");
    await expect(bottom.getByRole("button", { name: "播放" })).toBeVisible();
    await expect(page.getByRole("button", { name: "后退 10 秒" })).toBeVisible();
    await expect(page.getByRole("button", { name: "前进 10 秒" })).toBeVisible();
    await expect(bottom).toContainText("0:00 / 0:00");
    const bottomBox = await bottom.boundingBox();
    const playerBox = await player.boundingBox();
    expect(bottomBox).not.toBeNull();
    expect(playerBox).not.toBeNull();
    expect(bottomBox!.y + bottomBox!.height).toBeLessThanOrEqual(playerBox!.y + playerBox!.height);
    await page.evaluate(() => {
      (window as unknown as { __setVirtualMediaDuration: (value: number) => void }).__setVirtualMediaDuration(600);
      document.querySelector("video")?.dispatchEvent(new Event("durationchange"));
    });
    await expect(bottom).toContainText("0:00 / 10:00");

    await bottom.getByRole("button", { name: "播放" }).click();
    await expect(bottom.getByRole("button", { name: "暂停" })).toBeVisible();
    await page.getByLabel("播放进度").fill("120");
    await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBe(120);
    await page.getByRole("button", { name: "前进 10 秒" }).click();
    await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBe(130);
    await page.getByRole("button", { name: "后退 10 秒" }).click();
    await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBe(120);

    await page.getByRole("button", { name: "播放速度" }).click();
    await page.getByRole("menuitemradio", { name: "1.5x" }).click();
    await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).playbackRate)).toBe(1.5);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("m");
    await expect(bottom.getByRole("button", { name: "取消静音" })).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).volume)).toBeCloseTo(0.9, 5);
    await page.keyboard.press("l");
    await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBe(130);
    await page.keyboard.press("j");
    await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBe(120);

    await page.waitForTimeout(250);
    await page.clock.install();
    const freezeAt = await page.evaluate(() => Date.now() + 100);
    await page.clock.pauseAt(freezeAt);
    await player.evaluate((element) => {
      Object.defineProperty(document, "fullscreenElement", { configurable: true, value: element });
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    await player.dispatchEvent("pointermove");
    await expect(overlay).toHaveClass(/is-visible/);
    await page.clock.fastForward(2999);
    await expect(overlay).toHaveClass(/is-visible/);
    await page.clock.fastForward(1);
    await expect(overlay).not.toHaveClass(/is-visible/);
    await expect(player).toHaveClass(/is-cursor-hidden/);
    await player.hover({ position: { x: 301, y: 181 } });
    await expect(overlay).toHaveClass(/is-visible/);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect.poll(() => overlay.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe("0s");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("k");
    await expect(bottom.getByRole("button", { name: "播放" })).toBeVisible();
    await page.clock.fastForward(3000);
    await expect(overlay).toHaveClass(/is-visible/);
  });
});

test.describe("KVideo T23 mobile and device controls", () => {
  test.use({ locale: "zh-CN", timezoneId: "Asia/Taipei", colorScheme: "dark", viewport: { width: 1440, height: 900 } });

  test("drives touch, fullscreen, standard PiP, Cast, responsive captures, and TV arrow isolation", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await installVirtualMediaClock(page.context());
    await installDeviceCapabilities(page.context(), { standardPiP: true, cast: true, systemFullscreen: true });
    await mockWorker(page.context());
    await page.goto("./player/?id=desktop-movie&source=desktop-source&episode=0");
    const video = page.getByLabel("视频播放器");
    const player = page.locator(".media-player");
    await expect(player).toHaveAttribute("data-input-mode", "touch");
    await expect(page.locator(".desktop-volume-control")).toBeHidden();
    await expect(page.locator(".desktop-duration")).toBeHidden();
    await video.evaluate((element) => { (element as HTMLVideoElement).currentTime = 100; });
    await dispatchTouchEnd(page, "right");
    await dispatchTouchEnd(page, "right");
    await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBe(110);
    await dispatchTouchEnd(page, "left");
    await dispatchTouchEnd(page, "left");
    await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBe(100);

    await page.getByRole("button", { name: "网页全屏" }).click();
    await expect(player).toHaveClass(/is-web-fullscreen/);
    await expect(page.locator("body")).toHaveClass(/player-web-fullscreen-open/);
    await expect.poll(async () => (await readDeviceEvidence(page)).orientationLocks).toBeGreaterThan(0);
    await page.getByRole("button", { name: "退出网页全屏" }).click();
    await expect(player).not.toHaveClass(/is-web-fullscreen/);

    await page.getByRole("button", { name: "系统全屏" }).click();
    await expect(player).toHaveAttribute("data-phase", "ready");
    await expect(page.getByRole("button", { name: "退出系统全屏" })).toBeVisible();
    await page.getByRole("button", { name: "退出系统全屏" }).click();
    await expect.poll(async () => (await readDeviceEvidence(page)).nativeFullscreenRequests).toBe(1);

    await page.getByRole("button", { name: "画中画" }).click();
    await expect.poll(async () => (await readDeviceEvidence(page)).standardPiPRequests).toBe(1);
    await page.getByRole("button", { name: "投放" }).click();
    const castEvidence = await expect.poll(async () => (await readDeviceEvidence(page)).castLoad).not.toBeNull();
    void castEvidence;
    const loaded = (await readDeviceEvidence(page)).castLoad!;
    const loadedUrl = new URL(loaded.url);
    expect(loadedUrl.origin).toBe("http://127.0.0.1:4173");
    expect(loadedUrl.pathname).toBe("/api/proxy");
    expect(loaded.url).not.toBe("https://media.example/video.mp4");

    await player.screenshot({ path: testInfo.outputPath("player-320.png"), animations: "disabled" });
    await page.setViewportSize({ width: 768, height: 720 });
    await expect(player).toHaveAttribute("data-input-mode", "desktop");
    await player.screenshot({ path: testInfo.outputPath("player-768.png"), animations: "disabled" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("button", { name: "投放" }).focus();
    const focusedBefore = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
    const timeBefore = await video.evaluate((element) => (element as HTMLVideoElement).currentTime);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBe(timeBefore + 10);
    expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))).toBe(focusedBefore);
    const volumeSlider = page.getByLabel("音量");
    await volumeSlider.focus();
    const volumeBefore = await video.evaluate((element) => (element as HTMLVideoElement).volume);
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).volume)).toBeLessThan(volumeBefore);
    await expect(volumeSlider).toBeFocused();
    await player.screenshot({ path: testInfo.outputPath("player-tv-1440.png"), animations: "disabled" });
  });

  test("keeps unavailable PiP and Cast controls visible with reasons", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await installVirtualMediaClock(page.context());
    await installDeviceCapabilities(page.context(), {});
    await mockWorker(page.context());
    await page.goto("./player/?id=desktop-movie&source=desktop-source&episode=0");
    await expect(page.getByRole("button", { name: "画中画" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "画中画" })).toHaveAttribute("title", "当前浏览器或设备不支持画中画");
    await expect(page.getByRole("button", { name: "投放" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "投放" })).toHaveAttribute("title", "未检测到可用的 Google Cast 能力");
  });

  test("uses the Android bridge when standard PiP is unavailable", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await installVirtualMediaClock(page.context());
    await installDeviceCapabilities(page.context(), { androidPiP: true });
    await mockWorker(page.context());
    await page.goto("./player/?id=desktop-movie&source=desktop-source&episode=0");
    await expect(page.getByRole("button", { name: "画中画" })).toBeEnabled();
    await page.getByRole("button", { name: "画中画" }).click();
    await expect.poll(async () => (await readDeviceEvidence(page)).androidPiPRequests).toBe(1);
  });
});

test.describe("KVideo T24 playback lifecycle", () => {
  test.use({ locale: "zh-CN", timezoneId: "Asia/Taipei", colorScheme: "dark", viewport: { width: 1440, height: 900 } });

  test("resumes and throttles history, reports stalls and resolution, then switches failed sources once by latency", async ({ page }) => {
    await installVirtualMediaClock(page.context(), false);
    await installPlaybackLifecycleState(page.context());
    const evidence = await mockPlaybackLifecycleWorker(page.context());
    await page.goto("./player/?id=movie-a&source=source-a&episode=0&title=Lifecycle%20Video&gs=t24-sources");
    const player = page.locator(".media-player");
    const video = page.getByLabel("视频播放器");
    await expect(player).toHaveAttribute("data-playback-strategy", "native-retry");
    await expect(page.locator(".player-proxy-badge")).toHaveText("智能重试");
    await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBe(42);
    await expect.poll(() => evidence.probeBatches).toEqual([["source-a", "source-b", "source-c"]]);
    await expect.poll(() => new Set(evidence.pingUrls)).toEqual(new Set(["https://a.example", "https://b.example", "https://c.example"]));
    await page.locator(".current-source").click();
    const sourceOptions = page.locator(".source-group > button");
    await expect(sourceOptions.nth(0)).toContainText("Source B");
    await expect(sourceOptions.nth(0)).toContainText("20 ms · 720P");
    await expect(sourceOptions.nth(1)).toContainText("Source C");
    await expect(sourceOptions.nth(2)).toContainText("Source A");

    await page.evaluate(() => {
      (window as unknown as { __setVirtualMediaDuration: (value: number) => void }).__setVirtualMediaDuration(100);
      document.querySelector("video")?.dispatchEvent(new Event("durationchange"));
    });
    await video.evaluate((element) => { (element as HTMLVideoElement).currentTime = 50; });
    const firstLocal = await expect.poll(async () => localLibrary(page)).toMatchObject({ history: [{ playbackPosition: 50 }] });
    void firstLocal;
    const firstRevision = (await localLibrary(page)).revision;
    await video.evaluate((element) => { (element as HTMLVideoElement).currentTime = 51; });
    expect((await localLibrary(page)).revision).toBe(firstRevision);
    await page.evaluate(() => (window as unknown as { __advancePlaybackNow: (milliseconds: number) => void }).__advancePlaybackNow(5_000));
    await video.evaluate((element) => { (element as HTMLVideoElement).currentTime = 56; });
    await expect.poll(async () => (await localLibrary(page)).revision).toBe(firstRevision + 1);
    expect(evidence.syncPosts).toBe(0);

    await video.evaluate((element) => {
      Object.defineProperty(element, "videoWidth", { configurable: true, value: 1920 });
      Object.defineProperty(element, "videoHeight", { configurable: true, value: 1080 });
      element.dispatchEvent(new Event("resize"));
    });
    await expect(page.locator(".player-resolution-badge")).toHaveText("1080P");
    await expect.poll(() => page.evaluate(() => [...Array(sessionStorage.length).keys()]
      .map((index) => sessionStorage.getItem(sessionStorage.key(index) || "") || "").some((value) => value.includes('"origin":"played"')))).toBe(true);

    await page.locator(".desktop-player-controls").getByRole("button", { name: "播放" }).click();
    await video.dispatchEvent("waiting");
    const stalledStatus = page.locator(".media-stalled");
    await expect(stalledStatus).toHaveText("正在缓冲…");
    await video.evaluate((element) => { (element as HTMLVideoElement).currentTime = 57; });
    await expect(stalledStatus).toBeHidden();

    await video.dispatchEvent("error");
    await page.waitForURL(/source=source-b/);
    expect(new URL(page.url()).searchParams.get("t")).toBe("57");
    await expect(page.getByLabel("视频播放器")).toHaveAttribute("data-media-source", /media-b\.example/);
    await page.evaluate(() => {
      (window as unknown as { __setVirtualMediaDuration: (value: number) => void }).__setVirtualMediaDuration(100);
    });
    await expect.poll(() => page.getByLabel("视频播放器").evaluate((element) => (element as HTMLVideoElement).currentTime)).toBe(57);
    await page.evaluate(() => (window as unknown as { __advancePlaybackNow: (milliseconds: number) => void }).__advancePlaybackNow(5_000));
    await page.getByLabel("视频播放器").evaluate((element) => { (element as HTMLVideoElement).currentTime = 60; });
    await expect.poll(async () => (await localLibrary(page)).history).toMatchObject([{ id: "source-a:movie-a", source: "source-b", playbackPosition: 60 }]);
    expect((await localLibrary(page)).history).toHaveLength(1);

    await page.getByLabel("视频播放器").dispatchEvent("error");
    await page.waitForURL(/source=source-c/);
    await expect(page.getByLabel("视频播放器")).toHaveAttribute("data-media-source", /media-c\.example/);
    await page.getByLabel("视频播放器").dispatchEvent("error");
    await expect(page.locator(".media-error")).toContainText("媒体播放失败");
    await page.waitForTimeout(250);
    expect(new URL(page.url()).searchParams.get("source")).toBe("source-c");
    expect(new Set(evidence.detailSources)).toEqual(new Set(["source-a", "source-b", "source-c"]));
    expect(evidence.syncPosts).toBe(0);
  });

  for (const scenario of [
    { mode: "none" as const, strategy: "native-none", label: "原生解码" },
    { mode: "always" as const, strategy: "native-always", label: "始终中继" },
  ]) test(`${scenario.mode} mode stays on the protected same-origin media route`, async ({ page }) => {
    await installVirtualMediaClock(page.context());
    await installPlaybackLifecycleState(page.context());
    await mockPlaybackLifecycleWorker(page.context(), scenario.mode);
    await page.goto("./player/?id=movie-a&source=source-a&episode=0&title=Lifecycle%20Video&gs=t24-sources");
    await expect(page.locator(".media-player")).toHaveAttribute("data-playback-strategy", scenario.strategy);
    await expect(page.locator(".player-proxy-badge")).toHaveText(scenario.label);
    const mediaSource = await page.getByLabel("视频播放器").getAttribute("data-media-source");
    const mediaUrl = new URL(mediaSource!, page.url());
    expect(mediaUrl.origin).toBe(new URL(page.url()).origin);
    expect(mediaUrl.pathname).toBe("/api/proxy");
  });
});

type DanmakuFixture = "comments" | "empty" | "error";

async function installDanmakuCanvasEvidence(context: BrowserContext) {
  await context.addInitScript(() => {
    const draws: Array<{ text: string; x: number; y: number; alpha: number; font: string }> = [];
    Object.defineProperty(window, "__t25DanmakuDraws", { value: draws });
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function recordDanmakuDraw(this: CanvasRenderingContext2D,
      text: string, x: number, y: number, maximumWidth?: number) {
      draws.push({ text, x, y, alpha: this.globalAlpha, font: this.font });
      if (draws.length > 500) draws.splice(0, draws.length - 500);
      if (maximumWidth === undefined) return fillText.call(this, text, x, y);
      return fillText.call(this, text, x, y, maximumWidth);
    };
  });
}

async function mockDanmakuWorker(context: BrowserContext, fixture: DanmakuFixture) {
  const apiUrls: string[] = [];
  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/config") return json(route, {
      ...runtime,
      sources: { ...runtime.sources, danmakuApiUrl: "" },
    });
    if (url.pathname === "/api/auth/session") return json(route, { authenticated: true, session: {
      accountId: "danmaku-account", profileId: "danmaku-account", username: "viewer", name: "Viewer",
      role: "viewer", customPermissions: [], mode: "managed",
    } });
    if (url.pathname === "/api/user/config") return json(route, { kind: "config", version: 1, updatedAt: 1,
      payload: { fields: {
        danmakuEnabled: { value: true, updatedAt: 1 }, danmakuOpacity: { value: 0.4, updatedAt: 1 },
        danmakuFontSize: { value: 24, updatedAt: 1 }, danmakuDisplayArea: { value: 0.25, updatedAt: 1 },
        danmakuApis: { value: [{ id: "user-api", name: "User API", url: "https://user-danmaku.example" }], updatedAt: 1 },
        activeDanmakuApiId: { value: "user-api", updatedAt: 1 },
      }, sources: [source], subscriptions: [], tombstones: [] } });
    if (url.pathname === "/api/user/sync") return json(route, { kind: "library", version: 1, updatedAt: 1,
      payload: { history: [], favorites: [], tombstones: [] } });
    if (url.pathname === "/api/detail") return json(route, { data: {
      vod_id: "danmaku-video", vod_name: "Danmaku Video", source: source.id, vod_pic: "/placeholder-poster.svg",
      vod_content: "Danmaku fixture", episodes: [{ name: "Episode 1", index: 0, url: "https://media.example/video.mp4" }],
    } });
    if (url.pathname === "/api/danmaku") {
      apiUrls.push(url.searchParams.get("apiUrl") || "");
      if (fixture === "error") return json(route, { error: { code: "UPSTREAM_FAILED" } }, 502);
      if (url.searchParams.get("action") === "search" && !url.searchParams.get("keyword")) {
        return json(route, { error: { code: "INVALID_DANMAKU_REQUEST" } }, 400);
      }
      if (url.searchParams.get("action") === "search") return json(route, { animes: [{
        animeId: "anime-1", animeTitle: "Danmaku Video",
        episodes: [{ episodeId: "episode-1", episodeTitle: "Episode 1" }],
      }] });
      return json(route, fixture === "empty" ? { comments: [] } : { comments: [
        { p: "0.1,1,16777215", m: "scroll-comment" },
        { p: "0.2,5,16711680", m: "top-comment" },
        { p: "0.3,4,255", m: "bottom-comment" },
      ] });
    }
    if (url.pathname === "/api/proxy") return route.fulfill({ status: 206, contentType: "video/mp4", body: "test" });
    return json(route, { error: { code: "NOT_FOUND" } }, 404);
  });
  return apiUrls;
}

async function latestDanmakuDraw(page: import("@playwright/test").Page, text: string) {
  return page.evaluate((target) => {
    const draws = (window as unknown as { __t25DanmakuDraws: Array<{
      text: string; x: number; y: number; alpha: number; font: string;
    }> }).__t25DanmakuDraws;
    return [...draws].reverse().find((draw) => draw.text === target) ?? null;
  }, text);
}

test.describe("KVideo T25 danmaku canvas", () => {
  test.use({ locale: "zh-CN", timezoneId: "Asia/Taipei", colorScheme: "dark", viewport: { width: 1440, height: 900 } });

  test("uses the selected user API and renders bounded scrolling, top, and bottom tracks across playback changes", async ({ page }) => {
    await installVirtualMediaClock(page.context());
    await installDanmakuCanvasEvidence(page.context());
    const apiUrls = await mockDanmakuWorker(page.context(), "comments");
    await page.goto("./player/?id=danmaku-video&source=desktop-source&episode=0");
    const player = page.locator(".media-player");
    const video = page.locator("video");
    await expect(player).toHaveAttribute("data-danmaku-status", "ready");
    expect(new Set(apiUrls)).toEqual(new Set(["https://user-danmaku.example"]));
    expect(await page.locator("body").innerText()).not.toContain("user-danmaku.example");

    await video.evaluate((element) => void (element as HTMLVideoElement).play());
    await video.evaluate((element) => { (element as HTMLVideoElement).currentTime = 1; });
    const canvas = page.locator(".danmaku-canvas");
    await expect.poll(async () => Number(await canvas.getAttribute("data-active-count"))).toBe(3);
    const scroll = await expect.poll(() => latestDanmakuDraw(page, "scroll-comment")).not.toBeNull();
    void scroll;
    const top = (await latestDanmakuDraw(page, "top-comment"))!;
    const bottom = (await latestDanmakuDraw(page, "bottom-comment"))!;
    const scrolling = (await latestDanmakuDraw(page, "scroll-comment"))!;
    expect(scrolling.alpha).toBeCloseTo(0.4, 5);
    expect(scrolling.font).toContain("24px");
    expect(bottom.y).toBeGreaterThan(top.y);
    const canvasHeight = await canvas.evaluate((element) => (element as HTMLCanvasElement).height / window.devicePixelRatio);
    expect(bottom.y).toBeLessThanOrEqual(canvasHeight * 0.25);

    await video.evaluate((element) => (element as HTMLVideoElement).pause());
    const pausedX = (await latestDanmakuDraw(page, "scroll-comment"))!.x;
    await page.waitForTimeout(100);
    expect((await latestDanmakuDraw(page, "scroll-comment"))!.x).toBeCloseTo(pausedX, 5);

    const bitmapWidth = await canvas.getAttribute("width");
    await player.locator(".desktop-device-controls .desktop-icon-button").nth(2).click();
    await expect(player).toHaveClass(/is-web-fullscreen/);
    await expect.poll(() => canvas.getAttribute("width")).not.toBe(bitmapWidth);
    await video.evaluate((element) => { (element as HTMLVideoElement).currentTime = 10; });
    await expect(canvas).toHaveAttribute("data-active-count", "0");
  });

  for (const fixture of ["empty", "error"] as const) test(`${fixture} danmaku remains non-blocking`, async ({ page }) => {
    await installVirtualMediaClock(page.context());
    await mockDanmakuWorker(page.context(), fixture);
    await page.goto("./player/?id=danmaku-video&source=desktop-source&episode=0");
    const player = page.locator(".media-player");
    const video = page.locator("video");
    await expect(player).toHaveAttribute("data-danmaku-status", fixture);
    await expect(player).toHaveAttribute("data-phase", "ready");
    await video.evaluate((element) => void (element as HTMLVideoElement).play());
    await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).paused)).toBe(false);
    await expect(page.locator(".danmaku-canvas")).toHaveCount(0);
  });
});

async function mockPlaybackAutomationWorker(context: BrowserContext, autoNextEpisode = true) {
  let config = { kind: "config", version: 1, updatedAt: 1, payload: { fields: {
    autoNextEpisode: { value: autoNextEpisode, updatedAt: 1 },
    autoSkipIntro: { value: true, updatedAt: 1 }, skipIntroSeconds: { value: 10, updatedAt: 1 },
    autoSkipOutro: { value: true, updatedAt: 1 }, skipOutroSeconds: { value: 5, updatedAt: 1 },
    adFilterMode: { value: "heuristic", updatedAt: 1 }, adKeywords: { value: ["sponsor"], updatedAt: 1 },
  }, sources: [source], subscriptions: [], tombstones: [] } };
  const library = { kind: "library", version: 1, updatedAt: 1,
    payload: { history: [], favorites: [], tombstones: [] } };
  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === "/api/config") return json(route, { ...runtime, adKeywords: ["runtime-promo"] });
    if (url.pathname === "/api/auth/session") return json(route, { authenticated: true, session: {
      accountId: "automation-account", profileId: "automation-account", username: "viewer", name: "Viewer",
      role: "viewer", customPermissions: [], mode: "managed",
    } });
    if (url.pathname === "/api/user/config" && method === "POST") {
      const body = route.request().postDataJSON() as { payload: typeof config.payload };
      config = { kind: "config", version: config.version + 1, updatedAt: Date.now(), payload: body.payload };
      return json(route, config);
    }
    if (url.pathname === "/api/user/config") return json(route, config);
    if (url.pathname === "/api/user/sync" && method === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      return json(route, { ...body, version: Number(body.version || 0) + 1, updatedAt: Date.now() });
    }
    if (url.pathname === "/api/user/sync") return json(route, library);
    if (url.pathname === "/api/detail") return json(route, { data: {
      vod_id: "automation-video", vod_name: "Playback Automation", source: source.id,
      vod_pic: "/placeholder-poster.svg", vod_content: "Playback automation fixture",
      episodes: [1, 2, 3].map((number, index) => ({ name: `Episode ${number}`, index,
        url: `https://media.example/video-${number}.mp4` })),
    } });
    if (url.pathname === "/api/proxy") return route.fulfill({ status: 206, contentType: "video/mp4", body: "test" });
    return json(route, { error: { code: "NOT_FOUND" } }, 404);
  });
}

async function setAutomationDuration(page: import("@playwright/test").Page, duration: number) {
  await page.evaluate((value) => {
    (window as unknown as { __setVirtualMediaDuration: (duration: number) => void }).__setVirtualMediaDuration(value);
    document.querySelector("video")?.dispatchEvent(new Event("durationchange"));
  }, duration);
}

test.describe("KVideo T26 playback automation", () => {
  test.use({ locale: "zh-CN", timezoneId: "Asia/Taipei", colorScheme: "dark", viewport: { width: 1440, height: 900 } });

  test("skips bounded intro and advances once at outro or ended without crossing the final episode", async ({ page }) => {
    await installVirtualMediaClock(page.context());
    await mockPlaybackAutomationWorker(page.context());
    await page.goto("./player/?id=automation-video&source=desktop-source&episode=0");
    await setAutomationDuration(page, 100);
    await expect.poll(() => page.getByLabel("视频播放器").evaluate((video) => (video as HTMLVideoElement).currentTime)).toBe(10);

    await page.getByLabel("视频播放器").evaluate((video) => void (video as HTMLVideoElement).play());
    await page.getByLabel("视频播放器").evaluate((video) => { (video as HTMLVideoElement).currentTime = 96; });
    await expect.poll(() => new URL(page.url()).searchParams.get("episode")).toBe("1");
    await expect(page.getByLabel("视频播放器")).toHaveAttribute("data-media-source", /video-2\.mp4/);
    await expect.poll(() => page.getByLabel("视频播放器").evaluate((video) => (video as HTMLVideoElement).currentTime)).toBe(10);

    await page.getByLabel("视频播放器").dispatchEvent("ended");
    await expect.poll(() => new URL(page.url()).searchParams.get("episode")).toBe("2");
    await expect(page.getByLabel("视频播放器")).toHaveAttribute("data-media-source", /video-3\.mp4/);
    await page.getByLabel("视频播放器").dispatchEvent("ended");
    await page.waitForTimeout(100);
    expect(new URL(page.url()).searchParams.get("episode")).toBe("2");
  });

  test("finishes the current episode when automatic next is disabled", async ({ page }) => {
    await installVirtualMediaClock(page.context());
    await mockPlaybackAutomationWorker(page.context(), false);
    await page.goto("./player/?id=automation-video&source=desktop-source&episode=0");
    await setAutomationDuration(page, 100);
    await page.getByLabel("视频播放器").evaluate((video) => void (video as HTMLVideoElement).play());
    await page.getByLabel("视频播放器").evaluate((video) => { (video as HTMLVideoElement).currentTime = 96; });
    await expect.poll(() => page.getByLabel("视频播放器").evaluate((video) => (video as HTMLVideoElement).currentTime)).toBe(100);
    await page.getByLabel("视频播放器").dispatchEvent("ended");
    await page.waitForTimeout(100);
    expect(new URL(page.url()).searchParams.get("episode")).toBe("0");
  });

  test("switches all four ad modes live and keeps bounded options on the same-origin media route", async ({ page }) => {
    await installVirtualMediaClock(page.context());
    await mockPlaybackAutomationWorker(page.context());
    await page.goto("./player/?id=automation-video&source=desktop-source&episode=0");
    const player = page.locator(".media-player");
    const video = page.getByLabel("视频播放器");
    await expect(player).toHaveAttribute("data-ad-filter-mode", "heuristic");
    let mediaUrl = new URL((await video.getAttribute("data-media-source"))!, page.url());
    expect(mediaUrl.origin).toBe(new URL(page.url()).origin);
    expect(mediaUrl.pathname).toBe("/api/proxy");
    expect(mediaUrl.searchParams.get("ad")).toBe("heuristic");
    expect(mediaUrl.searchParams.getAll("adkw")).toEqual(["runtime-promo", "sponsor"]);

    await page.getByRole("button", { name: /广告过滤: 启发式/ }).click();
    await page.getByRole("menuitemradio", { name: "激进" }).click();
    await expect(player).toHaveAttribute("data-ad-filter-mode", "aggressive");
    mediaUrl = new URL((await video.getAttribute("data-media-source"))!, page.url());
    expect(mediaUrl.searchParams.get("ad")).toBe("aggressive");

    await page.locator(".desktop-ad-filter-trigger").click();
    await page.getByRole("menuitemradio", { name: "关闭" }).click();
    await expect(player).toHaveAttribute("data-ad-filter-mode", "off");
    mediaUrl = new URL((await video.getAttribute("data-media-source"))!, page.url());
    expect(mediaUrl.searchParams.get("ad")).toBe("off");
  });
});

const enabledVideoTogether = {
  enabled: true,
  scriptUrl: "https://scripts.example/video-together.js",
  settingUrl: "https://scripts.example/settings",
};

async function installVideoTogetherBridge(context: BrowserContext) {
  await context.addInitScript(() => {
    const evidence = { created: 0, joined: [] as string[], settings: 0 };
    Object.defineProperty(window, "__t38VideoTogetherEvidence", { value: evidence });
    Object.defineProperty(window, "__UXU_VIDEO_TOGETHER_MOCK__", { value: {
      createRoom: async () => { evidence.created += 1; return { roomId: "ROOM-123" }; },
      joinRoom: async (roomId: string) => {
        if (roomId === "FAIL") throw new Error("mock failure");
        evidence.joined.push(roomId);
      },
      openSettings: async () => { evidence.settings += 1; },
    } });
  });
}

async function installOfficialVideoTogetherEvidence(context: BrowserContext) {
  await context.addInitScript(() => {
    const evidence = { created: [] as Array<[string, string]>, joined: [] as Array<[string, string]> };
    Object.defineProperty(window, "__t39OfficialVideoTogetherEvidence", { value: evidence });
  });
}

async function readOfficialVideoTogetherEvidence(page: import("@playwright/test").Page) {
  return page.evaluate(() => (window as unknown as { __t39OfficialVideoTogetherEvidence: {
    created: Array<[string, string]>; joined: Array<[string, string]>;
  } }).__t39OfficialVideoTogetherEvidence);
}

async function readVideoTogetherEvidence(page: import("@playwright/test").Page) {
  return page.evaluate(() => (window as unknown as { __t38VideoTogetherEvidence: {
    created: number; joined: string[]; settings: number;
  } }).__t38VideoTogetherEvidence);
}

test.describe("KVideo T38 VideoTogether controller", () => {
  test.use({ locale: "zh-CN", timezoneId: "Asia/Taipei", colorScheme: "dark", viewport: { width: 1440, height: 900 },
    userAgent: "Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0) AppleWebKit/537.36" });

  test("keeps the disabled entry explanatory, localized, and TV-keyboard operable without loading a script", async ({ page }) => {
    const requestUrls: string[] = [];
    page.on("request", (request) => requestUrls.push(request.url()));
    await installVirtualMediaClock(page.context());
    await mockWorker(page.context(), runtime.thirdPartyScripts.videoTogether, true);
    await page.goto("./player/?id=desktop-movie&source=desktop-source&episode=0");

    const trigger = page.getByRole("button", { name: "一起看" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "VideoTogether 一起看" });
    await expect(dialog).toHaveAttribute("data-videotogether-state", "disabled");
    await expect(dialog).toContainText("部署管理员尚未通过 Worker RuntimeConfig 与 CSP 启用第三方脚本");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await page.getByLabel("语言").selectOption("zh-TW");
    await page.getByRole("button", { name: "一起看" }).click();
    await expect(page.getByRole("dialog", { name: "VideoTogether 一起看" }))
      .toContainText("部署管理員尚未透過 Worker RuntimeConfig 與 CSP 啟用第三方腳本");
    await page.getByRole("dialog", { name: "VideoTogether 一起看" }).getByRole("button", { name: "關閉" }).click();

    await page.getByLabel("語言").selectOption("en");
    await page.getByRole("button", { name: "Watch together" }).click();
    await expect(page.getByRole("dialog", { name: "VideoTogether" }))
      .toContainText("has not enabled the third-party script through Worker RuntimeConfig and CSP");
    expect(requestUrls.some((url) => url.includes("video-together.js"))).toBe(false);
  });

  test("creates, joins, configures, rejects failures, and keeps room state out of storage and requests", async ({ page }) => {
    let scriptRequests = 0;
    const requestEvidence: Array<{ url: string; body: string | null }> = [];
    page.on("request", (request) => requestEvidence.push({ url: request.url(), body: request.postData() }));
    await page.context().route(enabledVideoTogether.scriptUrl, async (route) => {
      scriptRequests += 1;
      await route.fulfill({ status: 200, contentType: "text/javascript", body: "" });
    });
    await installVirtualMediaClock(page.context());
    await installVideoTogetherBridge(page.context());
    await mockWorker(page.context(), enabledVideoTogether, true);
    await page.goto("./player/?id=desktop-movie&source=desktop-source&episode=0");

    await page.getByRole("button", { name: "一起看" }).click();
    const dialog = page.getByRole("dialog", { name: "VideoTogether 一起看" });
    await expect(dialog).toHaveAttribute("data-videotogether-state", "ready");
    const roomInput = page.getByLabel("房间 ID");
    await expect(roomInput).toBeFocused();
    await roomInput.fill("ROOM-123");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("button", { name: "创建房间" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(roomInput).toHaveValue("ROOM-123");
    await expect(dialog).toContainText("房间已创建: ROOM-123");

    await roomInput.fill("ROOM-456");
    await page.getByRole("button", { name: "加入房间" }).click();
    await expect(dialog).toContainText("已加入房间: ROOM-456");
    await roomInput.fill("FAIL");
    await page.getByRole("button", { name: "加入房间" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("操作失败，请检查配置后重试。");
    await roomInput.fill("ab");
    await page.getByRole("button", { name: "加入房间" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("房间 ID 只能包含字母、数字、下划线和连字符。");
    await page.getByRole("button", { name: "配置" }).click();

    expect(await readVideoTogetherEvidence(page)).toEqual({ created: 1, joined: ["ROOM-456"], settings: 1 });
    expect(scriptRequests).toBe(0);
    expect(page.url()).not.toMatch(/ROOM-|roomId/i);
    const stored = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
    expect(stored).not.toMatch(/ROOM-123|ROOM-456/);
    expect(JSON.stringify(requestEvidence)).not.toMatch(/ROOM-123|ROOM-456|\bFAIL\b/);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "一起看" })).toBeFocused();
  });

  test("reports a locally intercepted script-load failure without exposing room controls", async ({ page }) => {
    let scriptRequests = 0;
    await page.context().route(enabledVideoTogether.scriptUrl, async (route) => {
      scriptRequests += 1;
      await route.abort("blockedbyclient");
    });
    await installVirtualMediaClock(page.context());
    await mockWorker(page.context(), enabledVideoTogether, true);
    await page.goto("./player/?id=desktop-movie&source=desktop-source&episode=0");
    await page.getByRole("button", { name: "一起看" }).click();
    const dialog = page.getByRole("dialog", { name: "VideoTogether 一起看" });
    await expect(dialog).toHaveAttribute("data-videotogether-state", "error");
    await expect(dialog.getByRole("alert")).toHaveText("VideoTogether 加载失败或未提供兼容接口。");
    await expect(page.getByLabel("房间 ID")).toHaveCount(0);
    expect(scriptRequests).toBeGreaterThan(0);
  });

  test("adapts the official asynchronous videoTogetherExtension API", async ({ page }) => {
    await page.context().route(enabledVideoTogether.scriptUrl, async (route) => {
      await route.fulfill({ status: 200, contentType: "text/javascript", body: `setTimeout(() => {
        window.videoTogetherExtension = {
          CreateRoom: async (name, password) => window.__t39OfficialVideoTogetherEvidence.created.push([name, password]),
          JoinRoom: async (name, password) => window.__t39OfficialVideoTogetherEvidence.joined.push([name, password]),
        };
      }, 25);` });
    });
    await installVirtualMediaClock(page.context());
    await installOfficialVideoTogetherEvidence(page.context());
    await mockWorker(page.context(), enabledVideoTogether, true);
    await page.goto("./player/?id=desktop-movie&source=desktop-source&episode=0");

    await page.getByRole("button", { name: "一起看" }).click();
    const dialog = page.getByRole("dialog", { name: "VideoTogether 一起看" });
    await expect(dialog).toHaveAttribute("data-videotogether-state", "ready");
    const roomInput = page.getByLabel("房间 ID");
    await roomInput.fill("ab");
    await page.getByRole("button", { name: "创建房间" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("房间 ID 只能包含字母、数字、下划线和连字符。");
    expect(await readOfficialVideoTogetherEvidence(page)).toEqual({ created: [], joined: [] });
    await roomInput.fill("ROOM-OFFICIAL");
    await page.getByRole("button", { name: "创建房间" }).click();
    await expect(dialog).toContainText("房间已创建: ROOM-OFFICIAL");
    await page.getByRole("button", { name: "加入房间" }).click();
    await expect(dialog).toContainText("已加入房间: ROOM-OFFICIAL");
    expect(await readOfficialVideoTogetherEvidence(page)).toEqual({
      created: [["ROOM-OFFICIAL", ""]], joined: [["ROOM-OFFICIAL", ""]],
    });
  });
});
