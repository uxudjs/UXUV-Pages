import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const reviewRoot = join(root, "work-products", "tests", "fixtures", "icon-review");
const iconPath = join(root, "public", "icon.png");
const sizes = [16, 32, 48, 192, 512, 1024];
const mark = `
  <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="UXUVideo U V icon">
    <rect width="1024" height="1024" fill="#0F172A"/>
    <path d="M300 280V575C300 790 724 790 724 575V280" fill="none" stroke="#60A5FA" stroke-width="140" stroke-linecap="square"/>
    <path d="M420 330L512 625L604 330" fill="none" stroke="#94A3B8" stroke-width="128" stroke-linecap="square" stroke-linejoin="miter"/>
  </svg>`;

await mkdir(reviewRoot, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  await page.setContent(`<style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}svg{display:block;width:100%;height:100%}</style>${mark}`);
  await page.screenshot({ path: iconPath, animations: "disabled" });

  for (const size of sizes) {
    await page.setViewportSize({ width: size, height: size });
    await page.screenshot({ path: join(reviewRoot, `icon-${size}.png`), animations: "disabled" });
  }

  for (const [name, radius] of [["circle", "50%"], ["rounded-square", "22%"]]) {
    await page.setViewportSize({ width: 512, height: 512 });
    await page.setContent(`<style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#E2E8F0}svg{display:block;width:100%;height:100%;border-radius:${radius}}</style>${mark}`);
    await page.screenshot({ path: join(reviewRoot, `mask-${name}.png`), animations: "disabled" });
  }

  const imageData = async (path) => `data:image/png;base64,${(await readFile(path)).toString("base64")}`;
  const scaleSamples = await Promise.all(sizes.map(async (size) => ({ size, src: await imageData(join(reviewRoot, `icon-${size}.png`)) })));
  const circle = await imageData(join(reviewRoot, "mask-circle.png"));
  const rounded = await imageData(join(reviewRoot, "mask-rounded-square.png"));
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.setContent(`<style>
    *{box-sizing:border-box}html,body{margin:0;background:#f8fafc;color:#0f172a;font:16px system-ui,sans-serif}
    main{padding:40px}h1{margin:0 0 8px;font-size:26px}p{margin:0 0 28px;color:#475569}
    .sizes{display:grid;grid-template-columns:repeat(6,1fr);gap:20px}.sample{display:grid;gap:8px;justify-items:center;color:#475569;font-size:13px}
    .sample img{display:block;width:144px;height:144px;object-fit:contain}.sample[data-small="true"] img{image-rendering:pixelated}
    .masks{display:grid;grid-template-columns:repeat(2,1fr);gap:24px;margin-top:36px}.mask{display:grid;grid-template-columns:192px 1fr;align-items:center;gap:18px}
    .mask img{display:block;width:192px;height:192px}
    .mask strong{display:block;margin-bottom:6px}.mask span{color:#64748b;font-size:14px}
  </style><main><h1>UXUVideo U/V 图标候选</h1><p>固定色：#0F172A · #60A5FA · #94A3B8</p>
    <div class="sizes">${scaleSamples.map(({ size, src }) => `<div class="sample" data-small="${size <= 48}"><img src="${src}" alt="${size}px icon"><span>${size}px${size <= 48 ? " · 像素放大" : " · 缩览"}</span></div>`).join("")}</div>
    <div class="masks"><div class="mask"><img src="${circle}" alt="圆形 mask"><div><strong>圆形 mask</strong><span>关键 U/V 笔画保持可见</span></div></div>
      <div class="mask"><img src="${rounded}" alt="圆角矩形 mask"><div><strong>圆角矩形 mask</strong><span>无边框、无渐变、无发光</span></div></div></div>
  </main>`);
  await page.screenshot({ path: join(reviewRoot, "icon-review-sheet.png"), animations: "disabled" });
} finally {
  await browser.close();
}
