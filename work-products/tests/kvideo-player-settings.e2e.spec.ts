import { expect, test, type BrowserContext, type Route } from "@playwright/test";
import axe from "axe-core";

const runtime = {
  release: { worker: "1.0.0", pages: "0.1.2", apiContract: 1 },
  site: { name: "UXUVideo", title: "UXUVideo", description: "Private video", iconUrl: "/icon.png" },
  capabilities: { premium: true, danmaku: true }, adKeywords: ["server-ad"],
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
  let danmakuRequests = 0;
  const documents = new Map<string, ConfigDocument>();
  const document = (id: string) => {
    if (!documents.has(id)) documents.set(id, { kind: "config", version: 1, updatedAt: 1, payload: { fields: {}, sources: [{
      id: "source-a", updatedAt: 1, name: "Fixture A", baseUrl: "https://catalog-a.example", enabled: true,
      searchPath: "/api.php/provide/vod/", detailPath: "/api.php/provide/vod/",
    }, {
      id: "source-b", updatedAt: 1, name: "Fixture B", baseUrl: "https://catalog-b.example", enabled: true,
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
      vod_id: new URL(request.url()).searchParams.get("id") || "movie-1", vod_name: "Fixture movie",
      source: new URL(request.url()).searchParams.get("source") || "source-a",
      episodes: [{ name: "Episode 1", url: "https://media.example/one.mp4", index: 0 }],
    } });
    if (path === "/api/danmaku") { danmakuRequests += 1; return json(route, { data: [] }); }
    if (path === "/api/proxy") return route.fulfill({ status: 206, headers: { "Content-Type": "video/mp4", "Content-Range": "bytes 0-3/4" }, body: "test" });
    return json(route, { error: { code: "NOT_FOUND" } }, 404);
  });
  return {
    document,
    setAccount: (next: string) => { accountId = next; },
    setRole: (next: typeof role) => { role = next; },
    danmakuRequests: () => danmakuRequests,
  };
}

function localeChoice(page: import("@playwright/test").Page, value: "zh-CN" | "zh-TW" | "en") {
  const label = value === "zh-CN" ? "简体中文" : value === "zh-TW" ? "繁體中文" : "English";
  return page.locator('[data-settings-section="display"]').getByRole("button", { name: new RegExp(label) });
}

test.describe("KVideo T18 player and danmaku settings", () => {
  test.use({ locale: "zh-CN", timezoneId: "Asia/Taipei", colorScheme: "dark" });

  test("persists visible settings, rejects credential URLs, and updates the live player snapshot", async ({ page }) => {
    const worker = await mockWorker(page.context());
    await page.goto("./settings");
    await localeChoice(page, "zh-TW").click();
    await expect(page.getByRole("heading", { name: "播放器設定" })).toBeVisible();
    await localeChoice(page, "en").click();
    const player = page.locator('[data-settings-section="player"]');
    const danmaku = page.locator('[data-settings-section="danmaku-apis"]');
    await expect(player.getByLabel("Auto-play next episode")).toBeChecked();
    await expect(player.getByLabel("Skip intro")).toHaveCount(0);
    await expect(player.getByLabel("Intro duration (seconds)")).toHaveCount(0);
    await expect(player.getByLabel("Skip outro")).toHaveCount(0);
    await expect(player.getByLabel("Outro remaining (seconds)")).toHaveCount(0);
    await expect(player.getByLabel("Enable VideoTogether")).not.toBeChecked();
    await expect(player.getByLabel("Enable danmaku")).toBeDisabled();
    await expect(player.locator(".player-danmaku-api")).toHaveCount(0);
    await expect(danmaku.locator(".danmaku-api-empty")).toContainText("No danmaku APIs");

    await player.getByLabel("Default fullscreen mode").selectOption("native");
    await player.getByRole("button", { name: "30 s" }).click();
    await player.getByLabel("Playback proxy mode").selectOption("always");
    await player.getByLabel("Auto-play next episode").uncheck();
    await player.getByLabel("Show playback mode").check();
    await player.getByLabel("Enable VideoTogether").check();
    await player.getByLabel("Ad filtering").selectOption("aggressive");
    await player.getByLabel("Ad keyword").fill("custom-ad");
    await player.getByRole("button", { name: "Add", exact: true }).click();
    await player.getByLabel(/Danmaku opacity/).fill("80");
    await player.getByLabel("Danmaku font size").selectOption("24");
    await player.getByLabel("Danmaku display area").selectOption("0.75");

    await danmaku.getByLabel("API name").fill("Unsafe");
    await danmaku.getByLabel("API URL (https://…)").fill("https://danmaku.example/custom?access_token=fixture");
    await danmaku.getByRole("button", { name: "Add", exact: true }).click();
    await expect(danmaku.getByRole("alert")).toContainText("must not contain token");
    await danmaku.getByLabel("API name").fill("Personal API");
    await danmaku.getByLabel("API URL (https://…)").fill("https://personal.example/danmaku");
    await danmaku.getByRole("button", { name: "Add", exact: true }).click();
    await expect(danmaku.locator(".danmaku-api-empty")).toHaveCount(0);
    const preferred = danmaku.getByRole("button", { name: "Set as preferred Personal API" });
    await expect(preferred).toHaveAttribute("aria-pressed", "false");
    await expect(player.getByLabel("Enable danmaku")).toBeDisabled();
    await preferred.click();
    await expect(player.getByLabel("Enable danmaku")).toBeEnabled();
    await player.getByLabel("Enable danmaku").check();

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
    await expect(media).toHaveAttribute("data-auto-skip-intro", "false");
    await expect(media).toHaveAttribute("data-auto-skip-outro", "false");
    await expect(media).toHaveAttribute("data-ad-filter-mode", "aggressive");
    await expect(media).toHaveAttribute("data-danmaku-enabled", "true");
    await expect.poll(worker.danmakuRequests).toBeGreaterThan(0);
    await expect(page.getByRole("button", { name: "Watch together" })).toBeVisible();
    await expect(page.getByLabel("视频播放器")).toHaveAttribute("data-media-source", /\/api\/proxy\?.*one\.mp4/);
    await page.reload();
    await expect(page.locator(".media-player")).toHaveAttribute("data-proxy-mode", "always");
    await page.waitForLoadState("networkidle");

    const requestsWithSelection = worker.danmakuRequests();
    await page.goto("./settings/");
    await localeChoice(page, "en").click();
    const settingsPlayer = page.locator('[data-settings-section="player"]');
    const settingsDanmaku = page.locator('[data-settings-section="danmaku-apis"]');
    await settingsDanmaku.getByRole("button", { name: "Remove Personal API" }).click();
    await expect(settingsPlayer.getByLabel("Enable danmaku")).toBeDisabled();
    await expect(settingsPlayer.getByLabel("Enable danmaku")).not.toBeChecked();
    await expect.poll(() => worker.document("account-a").payload.fields.activeDanmakuApiId?.value).toBeNull();
    await expect.poll(() => worker.document("account-a").payload.fields.danmakuEnabled?.value).toBe(false);
    await page.goto("./player/?id=movie-1&source=source-a");
    await expect(page.locator(".media-player")).toHaveAttribute("data-danmaku-enabled", "false");
    await page.waitForLoadState("networkidle");
    expect(worker.danmakuRequests()).toBe(requestsWithSelection);
  });

  test("migrates a legacy snapshot once and keeps defaults isolated for a restricted second account", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("kvideo-settings", JSON.stringify({
      proxyMode: "always", autoSkipIntro: true, skipIntroSeconds: 45, danmakuOpacity: 0.8,
    })));
    const worker = await mockWorker(page.context());
    await page.goto("./settings");
    await expect.poll(() => worker.document("account-a").payload.fields.skipIntroSeconds?.value).toBe(45);
    expect(worker.document("account-a").payload.fields.videoSkipRules).toBeUndefined();
    expect(await page.evaluate(() => localStorage.getItem("uxuv-player-settings-account-migration-v1"))).toBe("account-a");
    await page.goto("./player/?id=movie-1&source=source-a");
    await expect(page.locator(".media-player")).toHaveAttribute("data-auto-skip-intro", "false");
    await page.goto("./settings");

    worker.setAccount("account-b");
    worker.setRole("viewer");
    await page.reload();
    const player = page.locator('[data-settings-section="player"]');
    await expect(player.locator(".settings-restriction")).toBeVisible();
    await expect(player.getByLabel("自动下一集")).toBeDisabled();
    await expect(player.getByLabel("跳过片头")).toHaveCount(0);
    await expect(player.getByLabel("代理播放模式")).toHaveValue("retry");
    expect(worker.document("account-b").payload.fields.proxyMode).toBeUndefined();
  });

  test("edits an isolated per-video rule without resetting playback and restores focus", async ({ page }) => {
    const worker = await mockWorker(page.context());
    await page.goto("./settings");
    await localeChoice(page, "en").click();
    await page.goto("./player/?id=movie-1&source=source-a");
    const media = page.locator(".media-player");
    await expect(media).toHaveAttribute("data-auto-skip-intro", "false");
    const trigger = page.getByRole("button", { name: "Skip settings" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Skip settings" });
    await expect(dialog.getByLabel("Skip intro")).toBeFocused();
    await dialog.getByLabel("Skip intro").check();
    await dialog.getByLabel("Intro duration (seconds)").fill("601");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByRole("alert")).toContainText("0 to 600");
    await dialog.getByLabel("Intro duration (seconds)").fill("12");
    await dialog.getByLabel("Skip outro").check();
    await dialog.getByLabel("Outro remaining (seconds)").fill("34");
    await page.getByLabel("视频播放器").evaluate((video) => {
      Object.defineProperty(video, "currentTime", { configurable: true, writable: true, value: 42 });
    });
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await page.getByLabel("视频播放器").evaluate((video) => (video as HTMLVideoElement).currentTime)).toBe(42);
    await expect(media).toHaveAttribute("data-auto-skip-intro", "true");
    await expect(media).toHaveAttribute("data-auto-skip-outro", "true");
    await expect.poll(() => worker.document("account-a").payload.fields.videoSkipRules?.value).toMatchObject({
      "standard:source-a:movie-1": { introEnabled: true, introSeconds: 12, outroEnabled: true, outroSeconds: 34 },
    });

    await trigger.click();
    await expect(dialog.getByLabel("Intro duration (seconds)")).toHaveValue("12");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await page.goto("./player/?id=movie-2&source=source-a");
    await expect(page.locator(".media-player")).toHaveAttribute("data-auto-skip-intro", "false");
    await page.goto("./player/?id=movie-1&source=source-b");
    await expect(page.locator(".media-player")).toHaveAttribute("data-auto-skip-intro", "false");
    await page.goto("./player/?id=movie-1&source=source-a");
    await expect(page.locator(".media-player")).toHaveAttribute("data-auto-skip-intro", "true");

    await page.setViewportSize({ width: 320, height: 800 });
    const restoredTrigger = page.getByRole("button", { name: "Skip settings" });
    await restoredTrigger.click();
    const restoredDialog = page.getByRole("dialog", { name: "Skip settings" });
    const undersized = await restoredDialog.locator("button, input[type=number], .player-skip-rule-toggle").evaluateAll((elements) => elements
      .map((element) => ({ label: element.getAttribute("aria-label") || element.textContent, height: element.getBoundingClientRect().height }))
      .filter(({ height }) => height < 44));
    expect(undersized).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.addScriptTag({ content: axe.source });
    const violations = await restoredDialog.evaluate(async (element) => {
      const result = await (window as unknown as { axe: typeof import("axe-core") }).axe.run(element,
        { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
      return result.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
    });
    expect(violations).toEqual([]);
    await restoredDialog.getByRole("button", { name: "Delete rule" }).click();
    await expect(restoredDialog).toBeHidden();
    await expect.poll(() => worker.document("account-a").payload.fields.videoSkipRules?.value).toEqual({});
    await expect(page.locator(".media-player")).toHaveAttribute("data-auto-skip-intro", "false");
  });
});
