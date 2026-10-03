import {
  Button,
  ContentTree,
  type ContentTreeHandle,
} from "compact-ui";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { normalizeStructureTreeIndentUnitCount } from "./structureIndent.ts";
import { projectStructureContent } from "./structureContentProjection.tsx";
import { useContentTreeLabelPreference } from "./ContentTreeLabelPreference.tsx";
import type { StructureTreeProps } from "./types.ts";

function findScrollContainer(host: HTMLElement): HTMLElement | null {
  let ancestor = host.parentElement;
  while (ancestor) {
    const overflowY = getComputedStyle(ancestor).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return ancestor;
    ancestor = ancestor.parentElement;
  }
  return null;
}

function StructureTreeSession(props: StructureTreeProps) {
  const { labelsVisible, setLabelsVisible } = useContentTreeLabelPreference();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const treeRef = useRef<ContentTreeHandle | null>(null);
  const previousSelectedId = useRef<string | null>(null);
  const [scrollContainer, setScrollContainer] = useState<HTMLElement | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [pendingRevealId, setPendingRevealId] = useState<string | null>(null);
  const projection = useMemo(
    () => projectStructureContent(props.nodes, labelsVisible),
    [props.nodes, labelsVisible],
  );
  const expandedIds = useMemo(
    () => new Set([...projection.branchIds].filter((id) => !collapsedIds.has(id))),
    [collapsedIds, projection.branchIds],
  );
  const selectedId = props.selectionMode === "single"
    ? [...props.selectedIds][0] ?? null : null;

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => {
      const next = findScrollContainer(host);
      setScrollContainer((current) => current === next ? current : next);
    };
    update();
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(update);
    let ancestor: HTMLElement | null = host;
    while (ancestor) {
      observer?.observe(ancestor);
      ancestor = ancestor.parentElement;
    }
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    setCollapsedIds((current) => {
      const retained = [...current].filter((id) => projection.branchIds.has(id));
      return retained.length === current.size ? current : new Set(retained);
    });
  }, [projection.branchIds]);

  useEffect(() => {
    if (previousSelectedId.current === selectedId) return;
    previousSelectedId.current = selectedId;
    if (!selectedId || !projection.nodeById.has(selectedId)) {
      setPendingRevealId(null);
      return;
    }
    const ancestors = new Set<string>();
    let parentId = projection.parentById.get(selectedId) ?? null;
    while (parentId) {
      ancestors.add(parentId);
      parentId = projection.parentById.get(parentId) ?? null;
    }
    setCollapsedIds((current) => {
      if (![...ancestors].some((id) => current.has(id))) return current;
      return new Set([...current].filter((id) => !ancestors.has(id)));
    });
    setPendingRevealId(selectedId);
  }, [projection, selectedId]);

  useLayoutEffect(() => {
    if (!pendingRevealId || !scrollContainer) return;
    let parentId = projection.parentById.get(pendingRevealId) ?? null;
    while (parentId) {
      if (!expandedIds.has(parentId)) return;
      parentId = projection.parentById.get(parentId) ?? null;
    }
    if (treeRef.current?.reveal(pendingRevealId)) setPendingRevealId(null);
  }, [expandedIds, pendingRevealId, projection, scrollContainer]);

  const common = {
    "aria-label": props.ariaLabel,
    dragDrop: props.dragDrop,
    expandedIds,
    indentScale: normalizeStructureTreeIndentUnitCount(props.indentUnitCount) / 4,
    nodes: projection.nodes,
    onExpandedChange: (ids: ReadonlySet<string>) => {
      setCollapsedIds(new Set([...projection.branchIds].filter((id) => !ids.has(id))));
    },
    onRequestContextMenu: props.onRequestContextMenu,
    scrollContainer,
  };
  return (
    <div ref={hostRef}>
      {props.nodes.length > 0 ? (
        <Button appearance="plain" type="button" onClick={() => setLabelsVisible(!labelsVisible)}>
          {labelsVisible ? "隐藏标签" : "显示标签"}
        </Button>
      ) : null}
      {props.selectionMode === "none" ? (
        <ContentTree {...common} ref={treeRef} selectionMode="none" />
      ) : (
        <ContentTree
          {...common}
          ref={treeRef}
          selectionMode={props.selectionMode}
          selectedIds={props.selectedIds}
          onSelectionChange={props.onSelectionChange}
        />
      )}
    </div>
  );
}

/** CTN identity, diagnostics and inline content adapt at this application boundary. */
export function StructureTree(props: StructureTreeProps) {
  return <StructureTreeSession {...props} key={props.stateKey} />;
}
