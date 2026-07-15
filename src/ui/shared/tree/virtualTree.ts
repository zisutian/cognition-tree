import {
  defaultRangeExtractor,
  useVirtualizer,
  type Range,
} from "@tanstack/react-virtual";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
  type RefObject,
} from "react";

export const treeRowHeightPx = 22;
export const treeVirtualizationThreshold = 500;
const treeVirtualOverscan = 12;
const emptyPinnedIndexes: ReadonlySet<number> = new Set();

export function shouldVirtualizeTreeRows(rowCount: number) {
  return rowCount > treeVirtualizationThreshold;
}

function findVerticalScrollElement(element: HTMLElement) {
  let ancestor = element.parentElement;

  while (ancestor) {
    const overflowY = getComputedStyle(ancestor).overflowY;

    if (overflowY === "auto" || overflowY === "scroll") {
      return ancestor;
    }

    ancestor = ancestor.parentElement;
  }

  return null;
}

function createPinnedRangeExtractor(pinnedIndexes: ReadonlySet<number>) {
  return (range: Range) => {
    const indexes = new Set(defaultRangeExtractor(range));

    pinnedIndexes.forEach((index) => indexes.add(index));
    return [...indexes].sort((left, right) => left - right);
  };
}

export function useVirtualTreeRows({
  count,
  getItemKey,
  hostRef,
  pinnedIndexes = emptyPinnedIndexes,
}: {
  count: number;
  getItemKey: (index: number) => string;
  hostRef: RefObject<HTMLElement | null>;
  pinnedIndexes?: ReadonlySet<number>;
}) {
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const rangeExtractor = useMemo(
    () => createPinnedRangeExtractor(pinnedIndexes),
    [pinnedIndexes],
  );
  const updateScrollContext = useCallback(() => {
    const host = hostRef.current;

    if (!host) {
      return;
    }

    const nextScrollElement = findVerticalScrollElement(host);

    setScrollElement((current) =>
      current === nextScrollElement ? current : nextScrollElement,
    );

    if (!nextScrollElement) {
      setScrollMargin(0);
      return;
    }

    const hostRect = host.getBoundingClientRect();
    const scrollRect = nextScrollElement.getBoundingClientRect();
    const nextScrollMargin =
      hostRect.top - scrollRect.top + nextScrollElement.scrollTop;

    setScrollMargin((current) =>
      current === nextScrollMargin ? current : nextScrollMargin,
    );
  }, [hostRef]);

  useLayoutEffect(() => {
    updateScrollContext();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(updateScrollContext);
    const host = hostRef.current;

    if (host) {
      observer.observe(host);
    }
    if (scrollElement) {
      observer.observe(scrollElement);
    }

    return () => observer.disconnect();
  }, [scrollElement, updateScrollContext]);

  const virtualizer = useVirtualizer({
    count,
    estimateSize: () => treeRowHeightPx,
    getItemKey,
    getScrollElement: () => scrollElement,
    overscan: treeVirtualOverscan,
    rangeExtractor,
    scrollMargin,
  });

  return {
    scrollMargin,
    totalSize: virtualizer.getTotalSize(),
    virtualRows: virtualizer.getVirtualItems(),
  };
}
