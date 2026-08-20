import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");
const files = [
  "components/player/desktop/DesktopControls.tsx",
  "components/player/desktop/DesktopLeftControls.tsx",
  "components/player/desktop/DesktopProgressBar.tsx",
  "components/player/desktop/DesktopSpeedMenu.tsx",
  "components/player/desktop/DesktopVolumeControl.tsx",
  "components/player/hooks/useControlsVisibility.ts",
  "components/player/hooks/useDesktopShortcuts.ts",
  "components/player/hooks/useSkipControls.ts",
  "lib/player/cursor-visibility.ts",
];

test("T22 supplies the reviewed desktop control modules", () => {
  for (const path of files) assert.equal(existsSync(join(root, path)), true, `${path} must exist`);
  const controls = files.slice(0, 5).map(read).join("\n");
  for (const token of ["DesktopProgressBar", "DesktopLeftControls", "DesktopSpeedMenu", "Play", "Pause", "Volume2", "VolumeX"]) {
    assert.match(controls, new RegExp(token));
  }
  assert.match(controls, /aria-label/);
  assert.match(controls, /type="range"/);
});

test("T22 keeps control visibility and keyboard behavior deterministic", () => {
  const visibility = read("components/player/hooks/useControlsVisibility.ts");
  const shortcuts = read("components/player/hooks/useDesktopShortcuts.ts");
  assert.match(visibility, /CONTROLS_HIDE_DELAY_MS\s*=\s*3000/);
  assert.match(visibility, /POINTER_MOVE_THROTTLE_MS\s*=\s*200/);
  assert.match(visibility, /setControlsVisible\(true\)/);
  assert.match(shortcuts, /contentEditable|HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement/);
  for (const key of [" ", "k", "m", "arrowright", "l", "arrowleft", "j", "arrowup", "arrowdown"]) {
    assert.match(shortcuts, new RegExp(`case ["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`));
  }
});

test("T22 connects custom controls to regular playback", () => {
  const player = read("components/media/MediaPlayer.tsx");
  const route = read("components/PlayerExperience.tsx");
  const cursor = read("lib/player/cursor-visibility.ts");
  assert.match(player, /<DesktopControls/);
  assert.match(player, /useControlsVisibility/);
  assert.match(player, /useDesktopShortcuts/);
  assert.match(player, /useSkipControls/);
  assert.match(player, /controls=\{!shellControls\}/);
  assert.match(route, /shellControls=/);
  assert.match(cursor, /fullscreen.*playing.*controlsVisible.*interactiveOverlay/s);
});

test("T22 provides reduced-motion and hidden-cursor states", () => {
  const css = read("app/globals.css");
  assert.match(css, /\.desktop-player-controls/);
  assert.match(css, /\.desktop-player-overlay/);
  assert.match(css, /\.media-player\.is-cursor-hidden/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
