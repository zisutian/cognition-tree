export const appDetailMinWidth = 260;
export const appDetailMaxWidth = 520;
export const appDetailDefaultWidth = 340;
export const appDetailKeyboardStep = 16;

export function clampAppDetailWidth(width: number) {
  return Math.min(
    appDetailMaxWidth,
    Math.max(appDetailMinWidth, Math.round(width)),
  );
}

export function resizeAppDetailWidth(width: number, delta: number) {
  return clampAppDetailWidth(width + delta);
}

export function getAppDetailKeyboardResizeWidth(
  width: number,
  key: string,
) {
  if (key === "ArrowLeft") {
    return resizeAppDetailWidth(width, appDetailKeyboardStep);
  }

  if (key === "ArrowRight") {
    return resizeAppDetailWidth(width, -appDetailKeyboardStep);
  }

  return null;
}
