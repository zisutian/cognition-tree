export const appSidebarMinWidth = 220;
export const appSidebarMaxWidth = 420;
export const appSidebarDefaultWidth = 292;
export const appSidebarKeyboardStep = 16;

export function clampAppSidebarWidth(width: number) {
  return Math.min(
    appSidebarMaxWidth,
    Math.max(appSidebarMinWidth, Math.round(width)),
  );
}

export function resizeAppSidebarWidth(width: number, delta: number) {
  return clampAppSidebarWidth(width + delta);
}

export function getAppSidebarKeyboardResizeWidth(
  width: number,
  key: string,
) {
  if (key === "ArrowLeft") {
    return resizeAppSidebarWidth(width, -appSidebarKeyboardStep);
  }

  if (key === "ArrowRight") {
    return resizeAppSidebarWidth(width, appSidebarKeyboardStep);
  }

  return null;
}
