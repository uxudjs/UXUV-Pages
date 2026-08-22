import { expect, test } from "@playwright/test";

const proxyStatusURL = "http://127.0.0.1:4174/__offline/status";

test("keeps the app reachable while rejecting ordinary and CONNECT proxy traffic", async ({ page, request }) => {
  const externalRequests: string[] = [];
  page.on("request", (outgoing) => {
    const target = new URL(outgoing.url());
    if (!(["127.0.0.1", "localhost"].includes(target.hostname))) externalRequests.push(outgoing.url());
  });
  const beforeResponse = await request.get(proxyStatusURL);
  expect(beforeResponse.ok()).toBe(true);
  const before = await beforeResponse.json() as { ordinaryRejected: number; connectRejected: number };

  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Setup is incomplete" })).toBeVisible();
  const afterNavigationResponse = await request.get(proxyStatusURL);
  expect(afterNavigationResponse.ok()).toBe(true);
  const afterNavigation = await afterNavigationResponse.json() as { ordinaryRejected: number; connectRejected: number };
  expect(externalRequests).toEqual([]);
  expect(afterNavigation.ordinaryRejected).toBeGreaterThanOrEqual(before.ordinaryRejected);
  expect(afterNavigation.connectRejected).toBeGreaterThanOrEqual(before.connectRejected);

  for (const target of ["http://example.invalid/", "https://example.invalid/"]) {
    const result = await page.evaluate(async (url) => {
      try {
        await fetch(url);
        return "resolved";
      } catch {
        return "rejected";
      }
    }, target);
    expect(result).toBe("rejected");
  }

  const afterResponse = await request.get(proxyStatusURL);
  expect(afterResponse.ok()).toBe(true);
  const after = await afterResponse.json() as { ordinaryRejected: number; connectRejected: number };
  expect(after.ordinaryRejected).toBeGreaterThan(afterNavigation.ordinaryRejected);
  expect(after.connectRejected).toBeGreaterThan(afterNavigation.connectRejected);
});
