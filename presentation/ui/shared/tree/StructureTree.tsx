import { Button } from "compact-ui";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { BlockText, type DisplayText } from "../blockText.tsx";
import { createClassNames } from "../classNames.ts";
import { shouldVirtualizeUiRows } from "../virtualListMetrics.ts";
import { getStructureTreeRowStyle } from "./structureIndent.ts";
import {
  flattenStructureTreeRows,
  visibleStructureTreeRows,
  type StructureTreeRow as FlatStructureTreeRow,
} from "./structureRows.ts";
import treeStyles from "./Tree.module.css";
import type { StructureTreeProps } from "./types.ts";
import { useVirtualTreeRows } from "./virtualTree.ts";

const cx = createClassNames(treeStyles);
const emptyKeepMountedLineNumbers: ReadonlySet<number> = new Set();

function StructureTreeRowContent({
  label,
  lineLabel,
  textDisplay,
}: {
  label: string;
  lineLabel: string;
  textDisplay: DisplayText;
}) {
  return (
    <>
      <span className={cx("ui-structure-prefix")}>
        <span className={cx("ui-structure-marker")}>{label}</span>
      </span>
      <BlockText text={textDisplay} />
      <span className={cx("ui-tree-meta")}>{lineLabel}</span>
    </>
  );
}

function StructureTreeSession({
  ariaLabel,
  className,
  getRowProps,
  indentUnitCount,
  keepMountedLineNumbers = emptyKeepMountedLineNumbers,
  nodes,
  onRequestContextMenu,
  onSelectLine,
  selectedLineNumbers,
  selectedRootLineNumber,
  subtreeSelection,
}: StructureTreeProps) {
  const treeId = useId().replace(/:/g, "-");
  const hostRef = useRef<HTMLUListElement | null>(null);
  const searchRef = useRef({ text: "", at: 0 });
  const previousParentsRef = useRef(new Map<string, string | null>());
  const previousSelectionRef = useRef<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [scrollTargetId, setScrollTargetId] = useState<string | null>(null);
  const allRows = useMemo(() => flattenStructureTreeRows(nodes), [nodes]);
  const rowById = useMemo(
    () => new Map(allRows.map((row) => [row.node.id, row])),
    [allRows],
  );
  const validCollapsedIds = useMemo(
    () => new Set([...collapsedIds].filter((id) => rowById.has(id))),
    [collapsedIds, rowById],
  );
  const selectedRow =
    allRows.find((row) => row.node.lineNumber === selectedRootLineNumber) ??
    allRows.find((row) => selectedLineNumbers?.has(row.node.lineNumber)) ??
    null;
  const selectedId = selectedRow?.node.id ?? null;
  const visibleRows = useMemo(
    () => visibleStructureTreeRows(allRows, validCollapsedIds),
    [allRows, validCollapsedIds],
  );
  const visibleById = useMemo(
    () => new Map(visibleRows.map((row, index) => [row.node.id, index])),
    [visibleRows],
  );
  const resolveActiveId = () => {
    if (activeId && visibleById.has(activeId)) return activeId;
    if (activeId) {
      let ancestor = previousParentsRef.current.get(activeId) ?? null;
      while (ancestor) {
        if (visibleById.has(ancestor)) return ancestor;
        ancestor = previousParentsRef.current.get(ancestor) ?? null;
      }
      return visibleRows[0]?.node.id ?? null;
    }
    return selectedId && visibleById.has(selectedId)
      ? selectedId
      : (visibleRows[0]?.node.id ?? null);
  };
  const resolvedActiveId = resolveActiveId();
  const virtual = shouldVirtualizeUiRows(visibleRows.length);
  const getItemKey = useCallback(
    (index: number) => visibleRows[index]?.node.id ?? String(index),
    [visibleRows],
  );
  const pinnedIndexes = useMemo(() => {
    const indexes = new Set<number>();
    visibleRows.forEach((row, index) => {
      if (
        row.node.id === resolvedActiveId ||
        row.node.lineNumber === selectedRootLineNumber ||
        keepMountedLineNumbers.has(row.node.lineNumber)
      ) {
        indexes.add(index);
      }
    });
    return indexes;
  }, [keepMountedLineNumbers, resolvedActiveId, selectedRootLineNumber, visibleRows]);
  const { scrollMargin, totalSize, virtualRows } =
    useVirtualTreeRows({
      count: virtual ? visibleRows.length : 0,
      getItemKey,
      hostRef,
      pinnedIndexes,
    });

  useEffect(() => {
    setCollapsedIds((current) => {
      const retained = [...current].filter((id) => rowById.has(id));
      return retained.length === current.size ? current : new Set(retained);
    });
  }, [rowById]);

  useEffect(() => {
    if (activeId && activeId !== resolvedActiveId) setActiveId(resolvedActiveId);
    previousParentsRef.current = new Map(
      allRows.map((row) => [row.node.id, row.parentId]),
    );
    if (!activeId && resolvedActiveId) setActiveId(resolvedActiveId);
  }, [activeId, allRows, resolvedActiveId]);

  useEffect(() => {
    if (previousSelectionRef.current === selectedId) return;
    previousSelectionRef.current = selectedId;
    if (!selectedId) return;
    const ancestors = new Set<string>();
    let parentId = rowById.get(selectedId)?.parentId ?? null;
    while (parentId) {
      ancestors.add(parentId);
      parentId = rowById.get(parentId)?.parentId ?? null;
    }
    if (ancestors.size > 0) {
      setCollapsedIds((current) => {
        if (![...ancestors].some((id) => current.has(id))) return current;
        return new Set([...current].filter((id) => !ancestors.has(id)));
      });
    }
  }, [rowById, selectedId]);

  useEffect(() => {
    if (!scrollTargetId) return;
    const index = visibleById.get(scrollTargetId);
    if (index === undefined) {
      setScrollTargetId(null);
      return;
    }
    document.getElementById(`${treeId}-${scrollTargetId}`)?.scrollIntoView({ block: "nearest" });
    setScrollTargetId(null);
  }, [scrollTargetId, treeId, visibleById]);

  const activate = (id: string) => {
    setActiveId(id);
    setScrollTargetId(id);
  };
  const draggedIds = useMemo(
    () => new Set(allRows.filter((row) => keepMountedLineNumbers.has(row.node.lineNumber)).map((row) => row.node.id)),
    [allRows, keepMountedLineNumbers],
  );
  const canCollapse = (id: string) => {
    for (const draggedId of draggedIds) {
      let parentId = rowById.get(draggedId)?.parentId ?? null;
      while (parentId) {
        if (parentId === id) return false;
        parentId = rowById.get(parentId)?.parentId ?? null;
      }
    }
    return true;
  };
  const toggle = (id: string) => {
    const row = rowById.get(id);
    if (!row?.node.children.length) return;
    setCollapsedIds((current) => {
      if (current.has(id)) return new Set([...current].filter((value) => value !== id));
      if (!canCollapse(id)) return current;
      return new Set(current).add(id);
    });
  };
  const requestMenu = (row: FlatStructureTreeRow, position: { x: number; y: number }) =>
    onRequestContextMenu?.(row.node, position);
  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.keyCode === 229) return;
    const index = resolvedActiveId ? visibleById.get(resolvedActiveId) ?? 0 : 0;
    const row = visibleRows[index];
    if (!row) return;
    let targetId: string | null = null;
    switch (event.key) {
      case "ArrowDown": targetId = visibleRows[Math.min(index + 1, visibleRows.length - 1)].node.id; break;
      case "ArrowUp": targetId = visibleRows[Math.max(index - 1, 0)].node.id; break;
      case "Home": targetId = visibleRows[0].node.id; break;
      case "End": targetId = visibleRows[visibleRows.length - 1].node.id; break;
      case "ArrowRight":
        if (row.node.children.length > 0) {
          if (validCollapsedIds.has(row.node.id)) toggle(row.node.id);
          else targetId = row.node.children[0].id;
        }
        break;
      case "ArrowLeft":
        if (row.node.children.length > 0 && !validCollapsedIds.has(row.node.id)) toggle(row.node.id);
        else targetId = row.parentId;
        break;
      case "Enter": case " ":
        if (onSelectLine) onSelectLine(row.node.lineNumber);
        else return;
        break;
      case "ContextMenu": case "F10":
        if (!onRequestContextMenu || (event.key === "F10" && !event.shiftKey)) return;
        {
          const rect = document.getElementById(`${treeId}-${row.node.id}`)?.getBoundingClientRect();
          requestMenu(row, { x: rect ? rect.left + rect.width / 2 : 0, y: rect?.bottom ?? 0 });
        }
        break;
      default:
        if (event.key.length !== 1 || event.ctrlKey || event.altKey || event.metaKey || event.key === " ") return;
        {
          const now = Date.now();
          const prior = searchRef.current;
          const text = (now - prior.at <= 700 ? prior.text : "") + event.key.toLocaleLowerCase();
          searchRef.current = { text, at: now };
          const candidates = [...visibleRows.slice(index + 1), ...visibleRows.slice(0, index + 1)];
          targetId = candidates.find(({ node }) =>
            node.textDisplay.displayText.toLocaleLowerCase().startsWith(text) ||
            node.label.toLocaleLowerCase().startsWith(text),
          )?.node.id ?? null;
        }
        break;
    }
    event.preventDefault();
    if (targetId && visibleById.has(targetId)) activate(targetId);
  };

  const renderRow = (
    row: FlatStructureTreeRow,
    itemStyle?: CSSProperties,
    virtualRow = false,
  ) => {
    const { node, depth, position, setSize } = row;
    const isSelected = selectedLineNumbers?.has(node.lineNumber) === true;
    const isSelectedRoot = selectedRootLineNumber === node.lineNumber;
    const rowProps = getRowProps?.(node, { depth, isSelected, isSelectedRoot });
    const { className: rowClassName, ...rowAttributes } = rowProps ?? {};
    const expanded = node.children.length > 0 && !validCollapsedIds.has(node.id);
    const onMouseContextMenu = (event: MouseEvent<HTMLButtonElement>) => {
      if (!onRequestContextMenu) return;
      event.preventDefault();
      hostRef.current?.focus();
      activate(node.id);
      const rect = event.currentTarget.getBoundingClientRect();
      requestMenu(row, { x: event.clientX || rect.left + rect.width / 2, y: event.clientY || rect.bottom });
    };
    return (
      <li
        aria-expanded={node.children.length > 0 ? expanded : undefined}
        aria-level={depth + 1}
        aria-posinset={position}
        aria-selected={onSelectLine ? isSelected : undefined}
        aria-setsize={setSize}
        className={cx("ui-structure-tree-item", isSelectedRoot && "is-selected-root", virtualRow && "ui-virtual-tree-row")}
        data-flat-index={virtualRow ? visibleById.get(node.id) : undefined}
        id={`${treeId}-${node.id}`}
        key={node.id}
        role="treeitem"
        style={itemStyle}
      >
        <div
          className={cx("ui-structure-container", isSelected && "is-selected", node.hasDiagnostics && "has-diagnostics", resolvedActiveId === node.id && "is-active", rowClassName)}
          style={getStructureTreeRowStyle({ depth, indentUnitCount })}
        >
          {node.children.length > 0 ? (
            <span className={cx("ui-structure-disclosure")}>
            <Button
              appearance="plain"
              aria-label={`${expanded ? "收起" : "展开"} ${node.label}: ${node.textDisplay.displayText}`}
              aria-expanded={expanded}
              onClick={() => { hostRef.current?.focus(); activate(node.id); toggle(node.id); }}
              tabIndex={-1}
              type="button"
              iconOnly
            >
              {expanded ? <ChevronDown aria-hidden="true" size={14} /> : <ChevronRight aria-hidden="true" size={14} />}
            </Button>
            </span>
          ) : <span aria-hidden="true" className={cx("ui-structure-disclosure-space")} />}
          <Button
            {...rowAttributes}
            appearance="plain"
            aria-pressed={onSelectLine ? isSelected : undefined}
            onClick={() => { hostRef.current?.focus(); activate(node.id); onSelectLine?.(node.lineNumber); }}
            onContextMenu={onMouseContextMenu}
            tabIndex={-1}
            title={`${node.label}: ${node.textDisplay.displayText}`}
            type="button"
          >
            <span className={cx("ui-structure-content")}>
              <StructureTreeRowContent label={node.label} lineLabel={node.lineLabel} textDisplay={node.textDisplay} />
            </span>
          </Button>
        </div>
      </li>
    );
  };

  return (
    <ul
      aria-activedescendant={resolvedActiveId ? `${treeId}-${resolvedActiveId}` : undefined}
      aria-label={ariaLabel}
      aria-multiselectable={onSelectLine && subtreeSelection ? true : undefined}
      className={cx("ui-tree ui-structure-tree", virtual && "ui-virtual-tree", className)}
      data-virtual-row-count={virtual ? visibleRows.length : undefined}
      onKeyDown={onKeyDown}
      ref={hostRef}
      role="tree"
      style={virtual ? { height: `${totalSize}px` } : undefined}
      tabIndex={0}
    >
      {virtual
        ? virtualRows.map((virtualRow) => {
            const row = visibleRows[virtualRow.index];
            return row ? renderRow(row, { height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start - scrollMargin}px)` }, true) : null;
          })
        : visibleRows.map((row) => renderRow(row))}
    </ul>
  );
}

export function StructureTree(props: StructureTreeProps) {
  return <StructureTreeSession {...props} key={props.stateKey} />;
}
