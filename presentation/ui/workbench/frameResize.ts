import { designMetrics } from "../foundation/designTokens.ts";

export const appContextMinWidth = designMetrics.context.min;
export const appContextMaxWidth = designMetrics.context.max;
export const appContextDefaultWidth = designMetrics.context.default;
export const appDetailMinWidth = designMetrics.detail.min;
export const appDetailMaxWidth = designMetrics.detail.max;
export const appDetailDefaultWidth = designMetrics.detail.default;
export const appResizeKeyboardStep = designMetrics.resizeKeyboardStep;
export const appProblemsMinHeight = designMetrics.problems.min;
export const appProblemsMaxHeight = designMetrics.problems.max;
export const appProblemsDefaultHeight = designMetrics.problems.default;

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
