import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const testsRoot = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(testsRoot, "fixtures", "kvideo-4.9.19");
const crops = {
  320: { left: 16, top: 16, width: 288, height: 64 },
  768: { left: 16, top: 16, width: 736, height: 82 },
  1024: { left: 16, top: 16, width: 992, height: 82 },
  1440: { left: 96, top: 16, width: 1248, height: 82 },
};

for (const [viewport, crop] of Object.entries(crops)) {
  const centerX = Math.floor(crop.width / 2);
  const centerY = Math.floor(crop.height / 2);
  const rectangles = [
    [2, 2, crop.width - 4, crop.height - 4],
    [0, 0, centerX - 5, 2], [centerX + 5, 0, crop.width - centerX - 5, 2],
    [0, crop.height - 2, centerX - 5, 2], [centerX + 5, crop.height - 2, crop.width - centerX - 5, 2],
    [0, 2, 2, centerY - 5], [0, centerY + 5, 2, crop.height - centerY - 7],
    [crop.width - 2, 2, 2, centerY - 5], [crop.width - 2, centerY + 5, 2, crop.height - centerY - 7],
  ];
  const mask = Buffer.from(`<svg width="${crop.width}" height="${crop.height}" xmlns="http://www.w3.org/2000/svg">${rectangles.map(([x, y, width, height]) => `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#ff00ff"/>`).join("")}</svg>`);
  await sharp(join(fixtureRoot, "routes", `home-${viewport}.png`))
    .extract(crop)
    .composite([{ input: mask }])
    .png()
    .toFile(join(fixtureRoot, `shell-nav-${viewport}.png`));
}

console.log(`Derived ${Object.keys(crops).length} navigation slices from the approved route baselines.`);
