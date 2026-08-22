import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const testRoot = dirname(fileURLToPath(import.meta.url));
const baselinePath = resolve(testRoot, '../evidence/section21/performance-baseline.json');

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function measure(page: Page, durationMs: number) {
  return page.evaluate(async (measurementMs) => {
    if (!PerformanceObserver.supportedEntryTypes.includes('longtask')) throw new Error('longtask observer is unavailable');
    const intervals: number[] = [];
    const longTasks: number[] = [];
    let previous = performance.now();
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTasks.push(entry.duration);
    });
    observer.observe({ type: 'longtask', buffered: false });

    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 180;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas context is unavailable');
    const stream = canvas.captureStream(30);
    const video = document.createElement('video');
    video.muted = true; video.autoplay = true; video.playsInline = true; video.srcObject = stream;
    video.style.cssText = 'position:fixed;right:0;bottom:0;width:320px;height:180px;z-index:1';
    document.body.append(video);
    let active = true;
    let frame = 0;
    const draw = () => {
      if (!active) return;
      context.fillStyle = `hsl(${frame % 360} 50% 40%)`;
      context.fillRect(0, 0, canvas.width, canvas.height);
      frame += 1;
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
    await video.play();
    if (video.paused || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.getVideoPlaybackQuality) {
      throw new Error('muted video fixture did not start');
    }
    const before = video.getVideoPlaybackQuality();

    const started = performance.now();
    let collecting = true;
    const tick = (now: number) => {
      if (!collecting) return;
      intervals.push(now - previous);
      previous = now;
      const elapsed = now - started;
      const maximum = Math.max(0, document.documentElement.scrollHeight - innerHeight);
      scrollTo(0, maximum * (0.5 - 0.5 * Math.cos(elapsed / 500)));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    await new Promise((resolveMeasurement) => setTimeout(resolveMeasurement, measurementMs));
    collecting = false;
    active = false;
    observer.disconnect();
    const after = video.getVideoPlaybackQuality();
    for (const track of stream.getTracks()) track.stop();
    video.remove();
    if (after.totalVideoFrames <= before.totalVideoFrames || intervals.length === 0) {
      throw new Error('muted video fixture produced no measurable frames');
    }
    intervals.sort((a, b) => a - b);
    return {
      p95RafIntervalMs: intervals[Math.min(intervals.length - 1, Math.floor(intervals.length * 0.95))],
      longTaskTotalMs: longTasks.reduce((sum, value) => sum + value, 0),
      droppedFrames: Math.max(0, after.droppedVideoFrames - before.droppedVideoFrames),
      totalFrames: after.totalVideoFrames - before.totalVideoFrames,
    };
  }, durationMs);
}

test('S21-T06 preserves the fixed 120-card scroll and 30-second muted-video budget', async ({ page }) => {
  test.setTimeout(180_000);
  expect(existsSync(baselinePath), 'T01 performance baseline must exist before verification').toBe(true);
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  expect(baseline.schemaVersion).toBe(1);
  expect(baseline.fixture).toEqual({ cards: 120, mutedVideoSeconds: 30, samples: 3 });
  expect(baseline.repositoryHead).toMatch(/^[a-f0-9]{40}$/);
  const baselineCss = execFileSync('git', ['show', `${baseline.repositoryHead}:app/globals.css`], { cwd: resolve(testRoot, '../..') });
  expect(baseline.cssSha256).toBe(createHash('sha256').update(baselineCss).digest('hex'));

  await page.goto('./');
  await page.evaluate(() => {
    document.body.innerHTML = `<nav class="content-nav-glass" style="position:fixed;z-index:4;top:8px;left:8px;right:8px;height:56px"></nav>
      <div class="player-status-badges" style="position:fixed;z-index:5;top:16px;right:16px"><span>1080P</span></div>
      <main class="content-shell" style="padding-top:72px"><div class="kvideo-result-grid">${Array.from({ length: 120 }, (_, index) => (
      `<article class="kvideo-result-card"><div class="kvideo-result-poster"></div><h3>Fixture ${index}</h3></article>`
    )).join('')}</div></main>`;
  });
  const filters = await page.locator('.kvideo-result-card').evaluateAll((cards) => cards.map((card) => getComputedStyle(card).backdropFilter));
  expect(filters.every((value) => !value || value === 'none')).toBe(true);
  const glassFilters = await page.locator('.content-nav-glass, .player-status-badges span').evaluateAll((layers) => (
    layers.map((layer) => getComputedStyle(layer).backdropFilter)
  ));
  expect(glassFilters).toHaveLength(2);
  expect(glassFilters.every((value) => value && value !== 'none')).toBe(true);

  for (let warmup = 0; warmup < 3; warmup += 1) await measure(page, 2_000);
  const samples = [];
  for (let sample = 0; sample < 3; sample += 1) {
    samples.push(await measure(page, 30_000));
  }

  const metrics = {
    p95RafIntervalMs: median(samples.map((sample) => sample.p95RafIntervalMs)),
    longTaskTotalMs: median(samples.map((sample) => sample.longTaskTotalMs)),
    droppedFrames: median(samples.map((sample) => sample.droppedFrames)),
  };
  expect(metrics.p95RafIntervalMs > baseline.median.p95RafIntervalMs * 1.1 && metrics.p95RafIntervalMs > baseline.median.p95RafIntervalMs + 2).toBe(false);
  expect(metrics.longTaskTotalMs > baseline.median.longTaskTotalMs * 1.1 && metrics.longTaskTotalMs > baseline.median.longTaskTotalMs + 50).toBe(false);
  expect(metrics.droppedFrames - baseline.median.droppedFrames).toBeLessThanOrEqual(1);
  expect(samples.every((sample) => sample.totalFrames > 0)).toBe(true);
  console.log(`S21-T06 performance ${JSON.stringify({ samples, median: metrics })}`);
});
