export const uiVirtualOverscan = 12;
export const uiVirtualRowHeightPx = 22;
export const uiVirtualizationThreshold = 500;

export function shouldVirtualizeUiRows(rowCount: number) {
  return rowCount > uiVirtualizationThreshold;
}
