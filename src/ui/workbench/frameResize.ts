export const appContextMinWidth = 220;
export const appContextMaxWidth = 420;
export const appContextDefaultWidth = 280;
export const appDetailMinWidth = 240;
export const appDetailMaxWidth = 500;
export const appDetailDefaultWidth = 320;
export const appResizeKeyboardStep = 16;
export const appProblemsCollapsedHeight = 24;
export const appProblemsMinHeight = 120;
export const appProblemsMaxHeight = 360;
export const appProblemsDefaultHeight = 200;

export function clampAppContextWidth(width: number) {
  if (!Number.isFinite(width)) {
    return appContextDefaultWidth;
  }

  return Math.min(
    appContextMaxWidth,
    Math.max(appContextMinWidth, Math.round(width)),
  );
}

export function clampAppDetailWidth(width: number) {
  if (!Number.isFinite(width)) {
    return appDetailDefaultWidth;
  }

  return Math.min(
    appDetailMaxWidth,
    Math.max(appDetailMinWidth, Math.round(width)),
  );
}

export function clampAppProblemsHeight(height: number) {
  if (!Number.isFinite(height)) {
    return appProblemsDefaultHeight;
  }

  return Math.min(
    appProblemsMaxHeight,
    Math.max(appProblemsMinHeight, Math.round(height)),
  );
}

export function getAppContextKeyboardResizeWidth(width: number, key: string) {
  if (key === "ArrowLeft") {
    return clampAppContextWidth(width - appResizeKeyboardStep);
  }

  if (key === "ArrowRight") {
    return clampAppContextWidth(width + appResizeKeyboardStep);
  }

  return null;
}

export function getAppDetailKeyboardResizeWidth(width: number, key: string) {
  if (key === "ArrowLeft") {
    return clampAppDetailWidth(width + appResizeKeyboardStep);
  }

  if (key === "ArrowRight") {
    return clampAppDetailWidth(width - appResizeKeyboardStep);
  }

  return null;
}

export function getAppProblemsKeyboardResizeHeight(
  height: number,
  key: string,
) {
  if (key === "ArrowUp") {
    return clampAppProblemsHeight(height + appResizeKeyboardStep);
  }

  if (key === "ArrowDown") {
    return clampAppProblemsHeight(height - appResizeKeyboardStep);
  }

  return null;
}
