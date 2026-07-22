export type ListRowDropPlacement = "before" | "after";

export function getListRowDropPlacement({
  offsetY,
  rowHeight,
}: {
  offsetY: number;
  rowHeight: number;
}): ListRowDropPlacement {
  const ratio = rowHeight <= 0 ? 0.5 : offsetY / rowHeight;

  return ratio < 0.5 ? "before" : "after";
}

export function getListReorderIndex({
  placement,
  sourceIndex,
  targetIndex,
}: {
  placement: ListRowDropPlacement;
  sourceIndex: number;
  targetIndex: number;
}) {
  if (sourceIndex === targetIndex) return sourceIndex;

  const targetIndexAfterRemoval = targetIndex -
    (sourceIndex < targetIndex ? 1 : 0);

  return placement === "before"
    ? targetIndexAfterRemoval
    : targetIndexAfterRemoval + 1;
}
