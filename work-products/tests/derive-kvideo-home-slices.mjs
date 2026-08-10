import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const testsRoot = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(testsRoot, "fixtures", "kvideo-4.9.19");
const crops = {
  320: { left: 16, top: 420, width: 288, height: 454 },
  768: { left: 24, top: 450, width: 720, height: 250 },
  1024: { left: 32, top: 450, width: 960, height: 267 },
  1440: { left: 112, top: 450, width: 1216, height: 343 },
};
const masks = {
  320: [{ left: 0, top: 0, width: 52, height: 56 }, { left: 228, top: 0, width: 60, height: 56 }, { left: 0, top: 418, width: 48, height: 36 }],
  768: [{ left: 0, top: 0, width: 48, height: 24 }, { left: 668, top: 0, width: 52, height: 24 }],
  1024: [{ left: 0, top: 0, width: 48, height: 24 }, { left: 916, top: 0, width: 52, height: 24 }],
  1440: [],
};

for (const [viewport, crop] of Object.entries(crops)) {
  const rectangles = masks[viewport];
  const mask = rectangles.length ? Buffer.from([
    `<svg width="${crop.width}" height="${crop.height}" xmlns="http://www.w3.org/2000/svg">`,
    ...rectangles.map(({ left, top, width, height }) => `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="#ff00ff"/>`),
    "</svg>",
  ].join("")) : null;
  const image = sharp(join(fixtureRoot, "routes", `home-${viewport}.png`)).extract(crop);
  await (mask ? image.composite([{ input: mask }]) : image)
    .png()
    .toFile(join(fixtureRoot, `slices-home-grid-${viewport}.png`));
}

console.log(`Derived ${Object.keys(crops).length} home grid slices from the approved route baselines.`);
