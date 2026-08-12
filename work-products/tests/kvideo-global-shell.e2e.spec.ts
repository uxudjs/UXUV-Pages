import { expect, test, type BrowserContext, type Route } from "@playwright/test";

const session = { accountId: "viewer-shell", profileId: "viewer-shell", username: "viewer", name: "Viewer", role: "viewer", customPermissions: [], mode: "managed" };
const config = {
  release: { worker: "1.0.0", pages: "0.1.2", apiContract: 1 },
  site: { name: "UXUVideo", title: "UXUVideo", description: "视频聚合平台", iconUrl: "/icon.png" },
  capabilities: { premium: true, iptv: true, danmaku: false },
  adKeywords: [],
  thirdPartyScripts: { videoTogether: { enabled: false, scriptUrl: null, settingUrl: null } },
  authenticated: true,
};
const source = { id: "shell-source", updatedAt: 1, name: "Fixture", baseUrl: "https://media.example", enabled: true };
const syncDocument = (kind: "config" | "library") => ({ kind, version: 0, updatedAt: null, payload: kind === "config"
  ? { fields: {}, sources: [source], subscriptions: [], tombstones: [] }
  : { history: [], favorites: [], tombstones: [] } });

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockShellWorker(context: BrowserContext, movieCount = 3) {
  const methods: string[] = [];
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/config") return json(route, config);
    if (path === "/api/auth/session") {
      methods.push(request.method());
      return json(route, request.method() === "DELETE" ? { success: true } : { authenticated: true, session });
    }
    if (path === "/api/user/config") return json(route, syncDocument("config"));
    if (path === "/api/user/sync") return json(route, syncDocument("library"));
    if (path === "/api/app-update") return json(route, {
      currentVersion: "1.0.0", latestVersion: "1.0.0", status: "up-to-date", checkedAt: "2026-08-11T08:00:00.000Z",
      copy: { available: true, href: "/api/app-update?artifact=worker", version: "1.0.0" },
    });
    if (path === "/api/douban/tags") return json(route, { tags: ["热门", "高级"] });
    if (path === "/api/douban/recommend") return json(route, { subjects: Array.from({ length: movieCount }, (_, index) => ({
      id: `movie-${index}`, title: `示例影片 ${index + 1}`, cover: "placeholder-poster.svg", rate: "8.8", url: "",
    })) });
    return json(route, { error: { code: "NOT_FOUND" } }, 404);
  });
  return methods;
}

test.describe("KVideo global shell", () => {
  test.use({ locale: "zh-CN", colorScheme: "dark", viewport: { width: 1024, height: 900 } });

  test("keeps the reviewed nav geometry and operates theme, settings, locale, and session actions", async ({ page }) => {
    const methods = await mockShellWorker(page.context());
    await page.goto("./");
    await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
    await expect(page.getByRole("link", { name: "直播" })).toHaveAttribute("href", /\/iptv$/);
    await expect(page.getByRole("button", { name: "高级" })).toBeVisible();
    await expect(page.getByRole("link", { name: "打开设置" })).toHaveText("V");
    await expect(page.getByRole("link", { name: "GitHub 仓库" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "我的收藏" })).toHaveCount(0);

    for (const [width, expected] of [[320, [16, 288, 64]], [768, [16, 736, 82]], [1024, [16, 992, 82]], [1440, [96, 1248, 82]]] as const) {
      await page.setViewportSize({ width, height: 900 });
      const box = await page.locator(".content-nav-glass").boundingBox();
      expect(box).not.toBeNull();
      expect([Math.round(box!.x), Math.round(box!.width), Math.round(box!.height)]).toEqual(expected);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const glass = page.locator(".content-nav-glass");
      await glass.evaluate((element, size) => {
        element.querySelectorAll("[data-shell-visual-mask]").forEach((mask) => mask.remove());
        (element as HTMLElement).style.position = "relative";
        const centerX = Math.floor(size.width / 2);
        const centerY = Math.floor(size.height / 2);
        const rectangles = [
          [2, 2, size.width - 4, size.height - 4],
          [0, 0, centerX - 5, 2], [centerX + 5, 0, size.width - centerX - 5, 2],
          [0, size.height - 2, centerX - 5, 2], [centerX + 5, size.height - 2, size.width - centerX - 5, 2],
          [0, 2, 2, centerY - 5], [0, centerY + 5, 2, size.height - centerY - 7],
          [size.width - 2, 2, 2, centerY - 5], [size.width - 2, centerY + 5, 2, size.height - centerY - 7],
        ];
        for (const [left, top, maskWidth, maskHeight] of rectangles) {
          const mask = document.createElement("span");
          mask.dataset.shellVisualMask = "";
          mask.setAttribute("aria-hidden", "true");
          Object.assign(mask.style, {
            position: "absolute", zIndex: "9999", left: `${left - 1}px`, top: `${top - 1}px`,
            width: `${maskWidth}px`, height: `${maskHeight}px`, background: "#ff00ff", pointerEvents: "none",
          });
          element.append(mask);
        }
      }, { width: Math.round(box!.width), height: Math.round(box!.height) });
      const screenshot = await page.screenshot({
        animations: "disabled",
        clip: { x: box!.x, y: box!.y, width: box!.width, height: box!.height },
      });
      expect(screenshot).toMatchSnapshot(`shell-nav-${width}.png`, { maxDiffPixelRatio: 0.005 });
    }

    await page.getByRole("button", { name: "设为浅色主题" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.getByRole("button", { name: "设为深色主题" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: "设为系统主题" }).click();
    await expect(page.getByRole("button", { name: "设为系统主题" })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("link", { name: "打开设置" }).click();
    const display = page.locator('[data-settings-section="display"]');
    await display.getByRole("button", { name: "繁體中文", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-TW");
    await display.getByRole("button", { name: "English", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();

    await page.goto("./");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect.poll(() => methods.filter((method) => method === "DELETE").length).toBe(1);
    await expect(page.getByRole("heading", { name: "Access restricted" })).toBeVisible();
  });

  test("restores scroll and exposes a keyboard-operable back-to-top action", async ({ page }) => {
    await mockShellWorker(page.context(), 20);
    await page.setViewportSize({ width: 320, height: 500 });
    await page.goto("./");
    await expect(page.locator(".kvideo-movie-grid")).toBeVisible();
    await page.evaluate(() => scrollTo(0, 700));
    await expect(page.getByRole("button", { name: "返回顶部" })).toBeVisible();
    await page.getByRole("button", { name: "返回顶部" }).click();
    await expect.poll(() => page.evaluate(() => Math.round(scrollY))).toBe(0);
    await page.evaluate(() => scrollTo(0, 600));
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem(`scroll-pos:viewer-shell:${location.pathname}${location.search}`))).toBe("600");
    await page.reload();
    await expect(page.locator(".kvideo-movie-grid")).toBeVisible();
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(500);
  });
});

test.describe("KVideo TV shell", () => {
  test.use({ locale: "zh-CN", colorScheme: "dark", userAgent: "Mozilla/5.0 SMART-TV", viewport: { width: 1280, height: 720 } });
  test("uses arrow keys for spatial card focus without trapping text cursor keys", async ({ page }) => {
    await mockShellWorker(page.context());
    await page.goto("./");
    await expect(page.locator("body")).toHaveClass(/tv-mode/);
    const cards = page.locator(".kvideo-movie-link");
    await cards.nth(0).focus();
    await page.keyboard.press("ArrowRight");
    await expect(cards.nth(1)).toBeFocused();
    await page.getByLabel("搜索视频内容").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByLabel("搜索视频内容")).toBeFocused();
  });
});
