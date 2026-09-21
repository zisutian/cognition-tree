import { uiConfig } from "../foundation/config.ts";

export const uiVirtualOverscan = 12;
export const uiVirtualRowHeightPx = uiConfig.metrics.rowHeight;
export const uiVirtualizationThreshold = 500;

export function shouldVirtualizeUiRows(rowCount: number) {
  return rowCount > uiVirtualizationThreshold;
}
