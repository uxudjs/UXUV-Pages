import { expect, test, type BrowserContext, type Route } from "@playwright/test";
import axe from "axe-core";

const runtime = {
  release: { worker: "1.0.0", pages: "0.1.2", apiContract: 1 },
  site: { name: "UXUVideo", title: "UXUVideo", description: "Private video", iconUrl: "/icon.png" },
  capabilities: { premium: true, iptv: false, danmaku: true }, adKeywords: ["server-ad"],
  sources: { subscriptionSources: "", iptvSources: "", mergeSources: false, danmakuApiUrl: "https://danmaku.example/api" },
  thirdPartyScripts: { videoTogether: { enabled: false, scriptUrl: null, settingUrl: null } }, authenticated: true,
};

type ConfigDocument = { kind: "config"; version: number; updatedAt: number; payload: {
  fields: Record<string, { value: unknown; updatedAt: number }>; sources: unknown[]; subscriptions: unknown[]; tombstones: unknown[];
} };

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockWorker(context: BrowserContext) {
  let accountId = "account-a";
  let role: "viewer" | "admin" | "super_admin" = "super_admin";
  const documents = new Map<string, ConfigDocument>();
  const document = (id: string) => {
    if (!documents.has(id)) documents.set(id, { kind: "config", version: 1, updatedAt: 1, payload: { fields: {}, sources: [{
      id: "source-a", updatedAt: 1, name: "Fixture", baseUrl: "https://catalog.example", enabled: true,
      searchPath: "/api.php/provide/vod/", detailPath: "/api.php/provide/vod/",
    }], subscriptions: [], tombstones: [] } });
    return documents.get(id)!;
  };
  const library = { kind: "library", version: 1, updatedAt: 1, payload: { history: [], favorites: [], tombstones: [] } };
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/config") return json(route, runtime);
    if (path === "/api/auth/session") return json(route, { authenticated: true, session: {
      accountId, profileId: accountId, username: accountId, name: accountId, role, customPermissions: [], mode: "managed",
    } });
    if (path === "/api/user/config" && request.method() === "GET") return json(route, document(accountId));
    if (path === "/api/user/config" && request.method() === "POST") {
      const body = request.postDataJSON() as { payload: ConfigDocument["payload"] };
      const current = document(accountId);
      documents.set(accountId, { kind: "config", version: current.version + 1, updatedAt: Date.now(), payload: body.payload });
      return json(route, documents.get(accountId));
    }
    if (path === "/api/user/sync") return json(route, library);
    if (path === "/api/detail") return json(route, { success: true, data: {
      vod_id: "movie-1", vod_name: "Fixture movie", source: "source-a",
      episodes: [{ name: "Episode 1", url: "https://media.example/one.mp4", index: 0 }],
    } });
    if (path === "/api/proxy") return route.fulfill({ status: 206, headers: { "Content-Type": "video/mp4", "Content-Range": "bytes 0-3/4" }, body: "test" });
    return json(route, { error: { code: "NOT_FOUND" } }, 404);
  });
  return {
    document,
    setAccount: (next: string) => { accountId = next; },
    setRole: (next: typeof role) => { role = next; },
  };
}

function localeChoice(page: import("@playwright/test").Page, value: "zh-CN" | "zh-TW" | "en") {
  const label = value === "zh-CN" ? "简体中文" : value === "zh-TW" ? "繁體中文" : "English";
  return page.locator('[data-settings-section="display"]').getByRole("button", { name: new RegExp(label) });
}

test.describe("KVideo T18 player and danmaku settings", () => {
  test.use({ locale: "zh-CN", timezoneId: "Asia/Taipei", colorScheme: "dark" });

  test("persists every setting, rejects credential URLs, and updates the live player snapshot", async ({ page }) => {
    const worker = await mockWorker(page.context());
    await page.goto("./settings");
    await localeChoice(page, "zh-TW").click();
    await expect(page.getByRole("heading", { name: "播放器設定" })).toBeVisible();
    await localeChoice(page, "en").click();
    const player = page.locator('[data-settings-section="player"]');
    const danmaku = page.locator('[data-settings-section="danmaku-apis"]');
    await expect(player.getByLabel("Auto-play next episode")).toBeChecked();
    await expect(player.getByLabel("Skip intro")).not.toBeChecked();
    await expect(player.getByLabel("Intro duration (seconds)")).toBeDisabled();
    await expect(player.getByLabel("Enable VideoTogether")).not.toBeChecked();

    await player.getByRole("button", { name: /System fullscreen/ }).click();
    await player.getByRole("button", { name: "30 s" }).click();
    await player.getByRole("button", { name: /Always proxy/ }).click();
    await player.getByLabel("Auto-play next episode").uncheck();
    await player.getByLabel("Show playback mode").check();
    await player.getByLabel("Enable VideoTogether").check();
    await player.getByLabel("Skip intro").check();
    await player.getByLabel("Intro duration (seconds)").fill("75");
    await player.getByLabel("Skip outro").check();
    await player.getByLabel("Outro remaining (seconds)").fill("120");
    await player.getByRole("button", { name: "Aggressive" }).click();
    await player.getByPlaceholder("Ad keyword").fill("custom-ad");
    await player.getByRole("button", { name: "Add", exact: true }).click();
    await player.getByLabel(/Danmaku opacity/).fill("80");
    await player.getByRole("button", { name: "24px" }).click();
    await player.getByRole("button", { name: "3/4" }).click();
    await player.getByLabel("Enable danmaku").check();

    await danmaku.getByLabel("API name").fill("Unsafe");
    await danmaku.getByLabel("API URL (https://…)").fill("https://danmaku.example/custom?access_token=fixture");
    await danmaku.getByRole("button", { name: "Add", exact: true }).click();
    await expect(danmaku.getByRole("alert")).toContainText("must not contain token");
    await danmaku.getByLabel("API name").fill("Personal API");
    await danmaku.getByLabel("API URL (https://…)").fill("https://personal.example/danmaku");
    await danmaku.getByRole("button", { name: "Add", exact: true }).click();
    await danmaku.getByRole("button", { name: "Set as preferred Personal API" }).click();

    await expect.poll(() => worker.document("account-a").payload.fields.proxyMode?.value).toBe("always");
    await expect.poll(() => worker.document("account-a").payload.fields.videoTogetherEnabled?.value).toBe(true);
    await expect.poll(() => worker.document("account-a").payload.fields.activeDanmakuApiId?.value).toMatch(/^danmaku-/);
    expect(JSON.stringify(worker.document("account-a"))).not.toContain("access_token");

    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () => {
      const result = await (window as unknown as { axe: typeof import("axe-core") }).axe.run(document,
        { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
      return result.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
    });
    expect(violations).toEqual([]);

    await page.goto("./player/?id=movie-1&source=source-a");
    const media = page.locator(".media-player");
    await expect(media).toHaveAttribute("data-proxy-mode", "always");
    await expect(media).toHaveAttribute("data-fullscreen-type", "native");
    await expect(media).toHaveAttribute("data-seek-step", "30");
    await expect(media).toHaveAttribute("data-auto-next-episode", "false");
    await expect(media).toHaveAttribute("data-auto-skip-intro", "true");
    await expect(media).toHaveAttribute("data-auto-skip-outro", "true");
    await expect(media).toHaveAttribute("data-ad-filter-mode", "aggressive");
    await expect(media).toHaveAttribute("data-danmaku-enabled", "true");
    await expect(page.getByRole("button", { name: "Watch together" })).toBeVisible();
    await expect(page.getByLabel("视频播放器")).toHaveAttribute("data-media-source", /\/api\/proxy\?.*one\.mp4/);
    await page.reload();
    await expect(page.locator(".media-player")).toHaveAttribute("data-proxy-mode", "always");
  });

  test("migrates a legacy snapshot once and keeps defaults isolated for a restricted second account", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("kvideo-settings", JSON.stringify({
      proxyMode: "always", autoSkipIntro: true, skipIntroSeconds: 45, danmakuOpacity: 0.8,
    })));
    const worker = await mockWorker(page.context());
    await page.goto("./settings");
    await expect.poll(() => worker.document("account-a").payload.fields.skipIntroSeconds?.value).toBe(45);
    expect(await page.evaluate(() => localStorage.getItem("uxuv-player-settings-account-migration-v1"))).toBe("account-a");

    worker.setAccount("account-b");
    worker.setRole("viewer");
    await page.reload();
    const player = page.locator('[data-settings-section="player"]');
    await expect(player.getByRole("note")).toBeVisible();
    await expect(player.getByLabel("自动下一集")).toBeDisabled();
    await expect(player.getByLabel("跳过片头")).not.toBeChecked();
    await expect(player.getByRole("button", { name: /智能重试/ })).toHaveAttribute("aria-pressed", "true");
    expect(worker.document("account-b").payload.fields.proxyMode).toBeUndefined();
  });
});
