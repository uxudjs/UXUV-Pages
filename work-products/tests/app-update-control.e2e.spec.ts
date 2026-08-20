import { expect, test, type BrowserContext, type Route } from "@playwright/test";
import axe from "axe-core";

const session = {
  accountId: "update-viewer", profileId: "update-viewer", username: "viewer", name: "Viewer",
  role: "viewer", customPermissions: [], mode: "managed",
};
const source = { id: "source-a", updatedAt: 1, name: "Source A", baseUrl: "https://media.example", enabled: true };
const runtime = (authenticated: boolean) => ({
  release: { worker: "1.0.0", pages: "0.2.0", apiContract: 1 },
  site: { name: "UXUVideo", title: "UXUVideo", description: "Private video", iconUrl: "/icon.png" },
  capabilities: { premium: true, danmaku: false }, adKeywords: [], authenticated,
  thirdPartyScripts: { videoTogether: { enabled: false, scriptUrl: null, settingUrl: null } },
});
const syncDocument = (kind: "config" | "library") => ({ kind, version: 1, updatedAt: 1, payload: kind === "config"
  ? { fields: {}, sources: [source], subscriptions: [], tombstones: [] }
  : { history: [], favorites: [], tombstones: [] } });

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockWorker(context: BrowserContext, authenticated = true, clipboardMode: "primary" | "fallback" = "primary") {
  let status: "update-available" | "up-to-date" | "ahead-of-remote" | "check-failed" = "update-available";
  let artifactFails = false;
  let checks = 0;
  await context.addInitScript((mode) => {
    if (mode === "fallback") {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
        writeText: async () => { throw new DOMException("denied", "NotAllowedError"); },
      } });
      Object.defineProperty(document, "execCommand", { configurable: true, value: (command: string) => {
        const active = document.activeElement;
        if (command !== "copy" || !(active instanceof HTMLTextAreaElement)) return false;
        (window as unknown as { __copiedWorker?: string }).__copiedWorker = active.value;
        return true;
      } });
      return;
    }
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: async (value: string) => { (window as unknown as { __copiedWorker?: string }).__copiedWorker = value; },
    } });
  }, clipboardMode);
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === "/api/config") return json(route, runtime(authenticated));
    if (path === "/api/auth/session") return json(route, authenticated ? { authenticated: true, session } : { authenticated: false, session: null });
    if (path === "/api/user/config") return json(route, syncDocument("config"));
    if (path === "/api/user/sync") return json(route, syncDocument("library"));
    if (path === "/api/app-update" && url.searchParams.get("artifact") === "worker") {
      if (artifactFails) return json(route, { error: { code: "APP_UPDATE_FETCH_FAILED" } }, 502);
      return route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", headers: {
        "X-UXUVideo-Worker-Version": "1.1.0", "X-UXUVideo-Worker-SHA256": "fixture-sha256",
      }, body: "const WORKER_VERSION = '1.1.0';\n" });
    }
    if (path === "/api/app-update") {
      checks += 1;
      const latestVersion = status === "ahead-of-remote" ? "0.9.0" : status === "check-failed" ? "1.0.0" : "1.1.0";
      return json(route, {
        currentVersion: "1.0.0", latestVersion, status, checkedAt: "2026-08-11T08:00:00.000Z",
        checkedRemotely: status !== "check-failed", copy: { available: status !== "check-failed", href: "/api/app-update?artifact=worker", version: latestVersion },
        source: { changelogUrl: "https://github.com/uxudjs/UXUVideo/blob/main/CHANGELOG.md", repositoryUrl: "https://github.com/uxudjs/UXUVideo" },
      });
    }
    if (path === "/api/douban/tags") return json(route, { tags: ["Movie"] });
    if (path === "/api/douban/recommend") return json(route, { subjects: [] });
    if (path === "/api/detail") return json(route, { success: true, data: {
      vod_id: "movie-1", vod_name: "Movie", source: "source-a", episodes: [{ name: "Episode 1", url: "https://media.example/one.mp4", index: 0 }],
    } });
    if (path === "/api/premium/types") return json(route, { tags: [], capability: { profile: "paid", limits: {} } });
    if (path === "/api/premium/category") return json(route, { videos: [], capability: { profile: "paid", limits: {} } });
    if (path === "/api/auth/accounts") return json(route, { loginMode: "managed", managed: true, accounts: [], totalCount: 0 });
    if (path === "/api/admin/usage") return json(route, { data: { configured: false, missing: [], message: "Not configured" } });
    return json(route, { error: { code: "NOT_FOUND" } }, 404);
  });
  return {
    checks: () => checks,
    setStatus: (value: typeof status) => { status = value; },
    failArtifact: () => { artifactFails = true; },
  };
}

test.describe("global app update control", () => {
  test.use({ locale: "en", timezoneId: "Asia/Taipei", colorScheme: "dark" });

  test("checks once across client navigation and copies only a freshly verified Worker", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const worker = await mockWorker(page.context());
    await page.goto("./");
    const trigger = page.getByRole("button", { name: "View version and updates" });
    await expect(trigger).toContainText("Update available");
    await expect.poll(worker.checks).toBe(1);

    await page.getByRole("link", { name: "Open settings" }).click();
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "View version and updates" })).toHaveCount(1);
    await expect.poll(worker.checks).toBe(1);

    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Version and updates" });
    await expect(dialog).toBeVisible();
    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () => {
      const result = await (window as unknown as { axe: typeof import("axe-core") }).axe.run(".app-update-dialog",
        { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
      return result.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
    });
    expect(violations).toEqual([]);
    expect(await trigger.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
    await expect(dialog.getByText("1.0.0", { exact: true })).toBeVisible();
    await expect(dialog.getByText("1.1.0", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Copy latest _worker.js" }).click();
    await expect(dialog.getByText("Latest _worker.js copied")).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __copiedWorker?: string }).__copiedWorker)).toBe("const WORKER_VERSION = '1.1.0';\n");

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();

    worker.setStatus("ahead-of-remote");
    await trigger.click();
    await dialog.getByRole("button", { name: "Check again" }).click();
    await expect(dialog.getByRole("button", { name: "Copy latest _worker.js" })).toBeDisabled();

    worker.setStatus("update-available");
    await dialog.getByRole("button", { name: "Check again" }).click();
    worker.failArtifact();
    await dialog.getByRole("button", { name: "Copy latest _worker.js" }).click();
    await expect(dialog.getByText("Copy failed. Check again before retrying.")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Copy latest _worker.js" })).toBeDisabled();
  });

  test("restores focus after the textarea clipboard fallback", async ({ page }) => {
    await mockWorker(page.context(), true, "fallback");
    await page.goto("./");
    const trigger = page.getByRole("button", { name: "View version and updates" });
    await expect(trigger).toContainText("Update available");
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "Version and updates" });
    const copyButton = dialog.getByRole("button", { name: "Copy latest _worker.js" });
    await copyButton.click();

    await expect(dialog.getByText("Latest _worker.js copied")).toBeVisible();
    await expect(copyButton).toBeFocused();
    await expect(page.locator("body > textarea")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __copiedWorker?: string }).__copiedWorker))
      .toBe("const WORKER_VERSION = '1.1.0';\n");
  });

  test("renders one non-overlapping entry on all seven routes and four breakpoints", async ({ page }) => {
    await mockWorker(page.context());
    const routes = ["./", "./favorites/", "./player/?id=movie-1&source=source-a&title=Movie",
      "./premium/", "./premium/favorites/", "./premium/settings/", "./settings/"];
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator(".app-update-trigger")).toHaveCount(1);
      const overlaps = await page.evaluate(() => {
        const trigger = document.querySelector<HTMLElement>(".app-update-trigger")?.getBoundingClientRect();
        if (!trigger) return ["missing-trigger"];
        const selectors = [".content-nav-glass", ".player-navbar", ".settings-page-heading", ".premium-settings-heading", ".usage-alert"];
        return selectors.filter((selector) => [...document.querySelectorAll<HTMLElement>(selector)].some((element) => {
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          return trigger.left < rect.right && trigger.right > rect.left && trigger.top < rect.bottom && trigger.bottom > rect.top;
        }));
      });
      expect(overlaps).toEqual([]);
    }
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("./");
      await page.addStyleTag({ content: "html{font-size:200%}" });
      const trigger = page.locator(".app-update-trigger");
      const nav = page.locator(".content-nav-glass");
      const [triggerBox, navBox] = await Promise.all([trigger.boundingBox(), nav.boundingBox()]);
      expect(triggerBox).not.toBeNull();
      expect(navBox).not.toBeNull();
      expect(triggerBox!.x).toBeGreaterThanOrEqual(0);
      expect(triggerBox!.x + triggerBox!.width).toBeLessThanOrEqual(width);
      expect(triggerBox!.y + triggerBox!.height).toBeLessThanOrEqual(navBox!.y);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });

  test("does not mount or check for updates before authentication", async ({ page }) => {
    const worker = await mockWorker(page.context(), false);
    await page.goto("./");
    await expect(page.getByRole("heading", { name: "Access restricted" })).toBeVisible();
    await expect(page.locator(".app-update-trigger")).toHaveCount(0);
    expect(worker.checks()).toBe(0);
  });
});
