import { expect, test, type BrowserContext, type Route } from "@playwright/test";

const runtime = {
  release: { worker: "1.0.0", pages: "0.1.2", apiContract: 1 },
  site: { name: "UXUVideo", title: "UXUVideo", description: "Private video", iconUrl: "/icon.png" },
  capabilities: { premium: true, iptv: true, danmaku: false }, adKeywords: [],
  thirdPartyScripts: { videoTogether: { enabled: false, scriptUrl: null, settingUrl: null } }, authenticated: true,
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockIptvBrowseWorker(context: BrowserContext, allowed = true) {
  const builtin = [
    { id: "m3u", name: "M3U Source", url: "https://m3u.example/list.m3u", ua: "IPTV-Agent", referer: "https://ref.example/" },
    { id: "json", name: "JSON Source", url: "https://json.example/channels.json" },
    { id: "nested", name: "Nested Source", url: "https://nested.example/config.json" },
    { id: "failed", name: "Failed Source", url: "https://failed.example/list.m3u8" },
  ];
  let config = { kind: "config", version: 1, updatedAt: 1,
    payload: { fields: {}, sources: [], subscriptions: [], tombstones: [] } };
  const evidence = { active: 0, maximum: 0, iptvRequests: 0, pingRequests: 0, configPosts: 0,
    requestQueries: [] as string[], streamTargets: [] as string[] };
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/config") return json(route, { ...runtime, sources: {
      subscriptionSources: "", iptvSources: JSON.stringify(builtin), mergeSources: false, danmakuApiUrl: "",
    } });
    if (url.pathname === "/api/auth/session") return json(route, { authenticated: true, session: {
      accountId: allowed ? "iptv-admin" : "iptv-viewer", profileId: allowed ? "iptv-admin" : "iptv-viewer",
      username: "viewer", name: "Viewer", role: allowed ? "super_admin" : "viewer", customPermissions: [], mode: "managed",
    } });
    if (url.pathname === "/api/user/config" && request.method() === "POST") {
      evidence.configPosts += 1;
      const body = request.postDataJSON() as { payload: typeof config.payload };
      config = { kind: "config", version: config.version + 1, updatedAt: Date.now(), payload: body.payload };
      return json(route, config);
    }
    if (url.pathname === "/api/user/config") return json(route, config);
    if (url.pathname === "/api/user/sync") return json(route, { kind: "library", version: 1, updatedAt: 1,
      payload: { history: [], favorites: [], tombstones: [] } });
    if (url.pathname === "/api/ping") {
      evidence.pingRequests += 1;
      const target = String((request.postDataJSON() as { url?: unknown }).url || "");
      const latency = target.includes("h264") ? 30 : target.includes("hevc") ? 5 : target.includes("backup") ? 40 : 20;
      return json(route, { success: true, timeout: false, latency, method: "HEAD" });
    }
    if (url.pathname === "/api/iptv") {
      evidence.iptvRequests += 1;
      evidence.requestQueries.push(url.search);
      evidence.active += 1;
      evidence.maximum = Math.max(evidence.maximum, evidence.active);
      await new Promise((resolve) => setTimeout(resolve, 25));
      evidence.active -= 1;
      const target = url.searchParams.get("url") || "";
      if (target.includes("failed.example")) return json(route, { error: { code: "UPSTREAM_FAILED" } }, 502);
      if (target.includes("json.example")) return json(route, { channels: [
        { name: "Direct News", urls: ["https://media.example/live-hevc.m3u8", "https://media.example/live.m3u8",
          "https://media.example/live-h264.m3u8", "https://media.example/live-backup.m3u8"], group: "News", ua: "Direct-UA", referer: "https://direct.example/" },
        { name: "Token News", url: "https://media.example/token-only.m3u8", group: "News" },
        { name: "Direct Sports", url: "https://media.example/sports.m3u8", group: "Sports" },
      ] });
      if (target.includes("nested.example/config")) return json(route, { lives: [{ name: "Nested Group", url: "child.m3u8" }] });
      if (target.includes("nested.example/child")) return route.fulfill({ status: 200, body: "#EXTM3U\n#EXTINF:-1,Child Channel\nhttps://media.example/child.m3u8" });
      if (target.includes("custom.example")) return json(route, [{ name: "Custom Channel", url: "https://media.example/custom.m3u8", group: "Custom" }]);
      const lines = ["#EXTM3U"];
      for (let index = 0; index < 205; index += 1) lines.push(`#EXTINF:-1 group-title="${index % 2 ? "Sports" : "News"}",Channel ${index}`,
        `https://media.example/channel-${index}.m3u8`);
      return route.fulfill({ status: 200, contentType: "application/vnd.apple.mpegurl", body: lines.join("\n") });
    }
    if (url.pathname === "/api/iptv/stream") {
      const target = url.searchParams.get("url") || "";
      evidence.streamTargets.push(target);
      if (target.includes("token-only")) return json(route, { error: { code: "MEDIA_TOKEN_INVALID" } }, 401);
      if (/\.m3u8(?:$|[?#])/i.test(target)) return route.fulfill({ status: 200, contentType: "application/vnd.apple.mpegurl",
        body: "#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:10,\n/api/iptv/stream?url=https%3A%2F%2Fmedia.example%2Fsegment.ts&token=fixture" });
      return route.fulfill({ status: 206, contentType: "video/mp2t", body: "segment" });
    }
    return json(route, { error: { code: "NOT_FOUND" } }, 404);
  });
  return evidence;
}

test.describe("KVideo T27 IPTV browse", () => {
  test.use({ locale: "zh-CN", timezoneId: "Asia/Taipei", colorScheme: "dark", viewport: { width: 1440, height: 900 } });

  test("loads three sources at a time, browses source-group-channel, searches, pages, caches, and manages complete sources", async ({ page }, testInfo) => {
    const evidence = await mockIptvBrowseWorker(page.context());
    await page.goto("./iptv/");
    const sourceStage = page.locator('[data-iptv-stage="source"]');
    const groupStage = page.locator('[data-iptv-stage="group"]');
    const channelStage = page.locator('[data-iptv-stage="channel"]');
    await expect(sourceStage.getByRole("button", { name: /M3U Source/ })).toContainText("205 个频道");
    await expect.poll(() => evidence.maximum).toBe(3);
    expect(evidence.requestQueries.some((query) => query.includes("ua=IPTV-Agent") && query.includes("referer=https%3A%2F%2Fref.example%2F"))).toBe(true);
    await expect(channelStage.locator(".channel-grid button")).toHaveCount(100);
    await channelStage.getByRole("button", { name: /Channel 0/ }).click();
    const streamUrl = new URL((await page.getByLabel("视频播放器").getAttribute("data-media-source"))!, page.url());
    expect(streamUrl.pathname).toBe("/api/iptv/stream");
    expect(streamUrl.searchParams.get("ua")).toBe("IPTV-Agent");
    expect(streamUrl.searchParams.get("referer")).toBe("https://ref.example/");
    await page.getByRole("button", { name: "关闭播放" }).click();
    await channelStage.getByRole("button", { name: /加载更多/ }).click();
    await expect(channelStage.locator(".channel-grid button")).toHaveCount(200);
    await channelStage.getByRole("button", { name: /加载更多/ }).click();
    await expect(channelStage.locator(".channel-grid button")).toHaveCount(205);

    await page.getByLabel("搜索频道").fill("Channel 204");
    await expect(channelStage.locator(".channel-grid button")).toHaveCount(1);
    await page.getByLabel("搜索频道").fill("");
    await groupStage.getByRole("button", { name: "Sports", exact: true }).click();
    await expect(channelStage.locator(".channel-grid button")).toHaveCount(100);

    const firstSource = sourceStage.getByRole("button", { name: /M3U Source/ });
    await firstSource.focus();
    await page.keyboard.press("ArrowRight");
    await expect(groupStage.getByRole("button", { name: "全部分类" })).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(channelStage.locator(".channel-grid button").first()).toBeFocused();

    await sourceStage.getByRole("button", { name: /JSON Source/ }).click();
    await expect(channelStage.getByRole("button", { name: /Direct News/ })).toBeVisible();
    await sourceStage.getByRole("button", { name: /Nested Source/ }).click();
    await expect(channelStage.getByRole("button", { name: /Child Channel/ })).toBeVisible();

    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`iptv-${width}.png`), animations: "disabled" });
    }

    await sourceStage.getByRole("button", { name: /Failed Source/ }).click();
    await expect(channelStage.getByRole("alert")).toContainText("加载失败 (502)");
    await page.getByRole("button", { name: "管理源" }).click();
    await page.getByLabel("名称").fill("Custom Source");
    await page.getByLabel("M3U / M3U8 / JSON URL").fill("https://custom.example/channels.json");
    await page.getByLabel("User-Agent（可选）").fill("Custom-UA");
    await page.getByLabel("Referer（可选）").fill("https://custom-ref.example/");
    await page.getByRole("button", { name: "添加源", exact: true }).click();
    await expect(sourceStage.getByRole("button", { name: /Custom Source/ })).toBeVisible();
    await expect.poll(() => evidence.configPosts).toBeGreaterThan(0);
    await expect(sourceStage.getByRole("button", { name: /M3U Source/ })).toContainText("缓存");
  });

  test("localizes the explanatory permission state and never loads a playlist", async ({ browser }) => {
    for (const scenario of [
      { locale: "zh-CN", heading: "无权访问 IPTV" },
      { locale: "zh-TW", heading: "無權存取 IPTV" },
      { locale: "en-US", heading: "IPTV access denied" },
    ]) {
      const context = await browser.newContext({ locale: scenario.locale });
      const evidence = await mockIptvBrowseWorker(context, false);
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:4173/UXUV-Pages/iptv/");
      await expect(page.getByRole("heading", { name: scenario.heading })).toBeVisible();
      expect(evidence.iptvRequests).toBe(0);
      await context.close();
    }
  });

  test("selects a compatible route, expands all routes, contains TV focus, closes with Escape, and explains expired tokens", async ({ page }, testInfo) => {
    const evidence = await mockIptvBrowseWorker(page.context());
    await page.goto("./iptv/");
    await page.locator('[data-iptv-stage="source"]').getByRole("button", { name: /JSON Source/ }).click();
    await page.locator('[data-iptv-stage="channel"]').getByRole("button", { name: /Direct News/ }).click();
    const player = page.locator(".iptv-player");
    await expect(player).toHaveAttribute("data-iptv-route-count", "4");
    await expect.poll(() => evidence.pingRequests).toBe(4);
    await expect(player.locator(".iptv-route-list button")).toHaveCount(3);
    await expect(player.getByRole("button", { name: /线路 3/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("视频播放器")).toHaveAttribute("data-media-source", /live-h264\.m3u8/);
    await player.getByRole("button", { name: "展开全部线路" }).click();
    await expect(player.locator(".iptv-route-list button")).toHaveCount(4);
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`iptv-player-${width}.png`), animations: "disabled" });
    }

    const focusScope = player.locator(".media-player");
    await focusScope.focus();
    await page.keyboard.press("ArrowRight");
    await expect(focusScope).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(player).toHaveCount(0);

    await page.locator('[data-iptv-stage="channel"]').getByRole("button", { name: /Token News/ }).click();
    await expect(page.locator(".media-error")).toContainText("直播授权已过期");
    expect(evidence.streamTargets.some((target) => target.includes("live-h264"))).toBe(true);
  });
});
