import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");
const files = [
  "components/player/desktop/DesktopDeviceControls.tsx",
  "components/player/hooks/desktop/android-pip-utils.ts",
  "components/player/hooks/useCastControls.ts",
  "components/player/hooks/useFullscreenControls.ts",
  "components/player/hooks/usePictureInPicture.ts",
  "lib/hooks/mobile/useDoubleTap.ts",
  "lib/hooks/mobile/useScreenOrientation.ts",
  "lib/hooks/useMobilePlayer.ts",
];

test("T23 supplies bounded device capability modules", () => {
  for (const path of files) assert.equal(existsSync(join(root, path)), true, `${path} must exist`);
  const combined = files.map(read).join("\n");
  for (const token of ["requestFullscreen", "exitFullscreen", "requestPictureInPicture", "UXUVideoAndroid",
    "requestSession", "ORIGIN_SCOPED", "orientation.lock", "orientation.unlock", "DOUBLE_TAP_WINDOW_MS"]) {
    assert.match(combined, new RegExp(token.replace(".", "\\.")));
  }
});

test("T23 keeps unavailable PiP and Cast entries visible and explained", () => {
  const controls = read("components/player/desktop/DesktopDeviceControls.tsx");
  assert.match(controls, /disabled=\{!pipAvailable\}/);
  assert.match(controls, /disabled=\{!castAvailable\}/);
  assert.match(controls, /aria-describedby/);
  assert.match(controls, /PictureInPicture/);
  assert.match(controls, /Cast/);
});

test("T23 connects touch, TV isolation, fullscreen, PiP, and Cast only to the protected media URL", () => {
  const player = read("components/media/MediaPlayer.tsx");
  const route = read("components/PlayerExperience.tsx");
  assert.match(player, /useMobilePlayer/);
  assert.match(player, /useFullscreenControls/);
  assert.match(player, /usePictureInPicture/);
  assert.match(player, /useCastControls/);
  assert.match(player, /onTouchEnd/);
  assert.match(player, /onKeyDownCapture/);
  assert.match(player, /data-input-mode/);
  assert.match(route, /data-no-spatial/);
  assert.doesNotMatch(files.map(read).join("\n"), /buildMediaUrl|target\s*:/);
});

test("T23 defines web fullscreen and mobile control geometry without native controls", () => {
  const css = read("app/globals.css");
  const player = read("components/media/MediaPlayer.tsx");
  const fullscreen = read("components/player/hooks/useFullscreenControls.ts");
  const backToTop = read("components/ui/BackToTop.tsx");
  assert.match(css, /\.media-player\.is-web-fullscreen/);
  assert.match(css, /body\.player-web-fullscreen-open\s+\.back-to-top/);
  assert.match(css, /\.media-player\[data-input-mode="touch"\]/);
  assert.match(css, /\.desktop-device-controls/);
  assert.match(player, /controls=\{!shellControls\}/);
  assert.match(fullscreen, /fullscreenMode !== "window"/);
  assert.match(backToTop, /hidden=\{webFullscreen\}/);
});
