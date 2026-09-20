import { designMetrics } from "../foundation/designTokens.ts";

export const uiVirtualOverscan = 12;
export const uiVirtualRowHeightPx = designMetrics.rowHeight;
export const uiVirtualizationThreshold = 500;

export function shouldVirtualizeUiRows(rowCount: number) {
  return rowCount > uiVirtualizationThreshold;
}
