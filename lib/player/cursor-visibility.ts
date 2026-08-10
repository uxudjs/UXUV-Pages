interface CursorVisibilityInput {
  fullscreen: boolean;
  playing: boolean;
  controlsVisible: boolean;
  interactiveOverlay: boolean;
}

export function shouldHidePlayerCursor({ fullscreen, playing, controlsVisible, interactiveOverlay }: CursorVisibilityInput): boolean {
  return fullscreen && playing && !controlsVisible && !interactiveOverlay;
}
