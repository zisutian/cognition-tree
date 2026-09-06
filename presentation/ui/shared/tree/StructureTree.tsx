import {
  useCallback,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  BlockText,
  type DisplayText,
} from "../blockText.tsx";
import { cx } from "../primitives.tsx";
import { shouldVirtualizeUiRows } from "../virtualListMetrics.ts";
import { getStructureTreeRowStyle } from "./structureIndent.ts";
import {
  flattenStructureTreeRows,
  type StructureTreeRow as FlatStructureTreeRow,
} from "./structureRows.ts";
import type {
  StructureTreeProps,
} from "./types.ts";
import {
  useVirtualTreeRows,
} from "./virtualTree.ts";

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
      <span className="ui-structure-prefix">
        <span className="ui-structure-marker">{label}</span>
      </span>
      <BlockText text={textDisplay} />
      <span className="ui-tree-meta">{lineLabel}</span>
    </>
  );
}

function StructureTreeRow({
  children,
  depth,
  getRowProps,
  indentUnitCount,
  itemClassName,
  itemPosition,
  itemSetSize,
  itemStyle,
  node,
  selectedLineNumbers,
  selectedRootLineNumber,
  onSelectLine,
}: Omit<StructureTreeProps, "className" | "nodes"> & {
  children?: ReactNode;
  depth: number;
  itemClassName?: string;
  itemPosition?: number;
  itemSetSize?: number;
  itemStyle?: CSSProperties;
  node: StructureTreeProps["nodes"][number];
}) {
  const isSelected = selectedLineNumbers?.has(node.lineNumber) === true;
  const isSelectedRoot = selectedRootLineNumber === node.lineNumber;
  const rowProps = getRowProps?.(node, {
    depth,
    isSelected,
    isSelectedRoot,
  });
  const { className: rowClassName, ...rowAttributes } = rowProps ?? {};

  return (
    <li
      aria-expanded={node.children.length > 0 ? true : undefined}
      aria-level={depth + 1}
      aria-posinset={itemPosition}
      aria-selected={isSelected}
      aria-setsize={itemSetSize}
      className={cx(
        "ui-structure-tree-item",
        isSelected && "is-selected-subtree",
        isSelectedRoot && "is-selected-root",
        itemClassName,
      )}
      role="treeitem"
      style={itemStyle}
    >
      <button
        {...rowAttributes}
        className={cx(
          "ui-tree-row ui-structure-tree-row",
          isSelected && "is-selected",
          node.hasDiagnostics && "has-diagnostics",
          rowClassName,
        )}
        style={getStructureTreeRowStyle({ depth, indentUnitCount })}
        onClick={() => onSelectLine?.(node.lineNumber)}
        title={`${node.label}: ${node.textDisplay.displayText}`}
        type="button"
      >
        <StructureTreeRowContent
          label={node.label}
          lineLabel={node.lineLabel}
          textDisplay={node.textDisplay}
        />
      </button>
      {children}
    </li>
  );
}

function StructureTreeContent({
  className,
  depth,
  getRowProps,
  indentUnitCount,
  nodes,
  selectedLineNumbers,
  selectedRootLineNumber,
  onSelectLine,
}: StructureTreeProps & { depth: number }) {
  return (
    <ul
      className={cx("ui-tree ui-structure-tree", className)}
      role={depth === 0 ? "tree" : "group"}
    >
      {nodes.map((node) => (
        <StructureTreeRow
          depth={depth}
          getRowProps={getRowProps}
          indentUnitCount={indentUnitCount}
          key={node.id}
          node={node}
          selectedLineNumbers={selectedLineNumbers}
          selectedRootLineNumber={selectedRootLineNumber}
          onSelectLine={onSelectLine}
        >
          {node.children.length > 0 ? (
              <StructureTreeContent
                depth={depth + 1}
                getRowProps={getRowProps}
                indentUnitCount={indentUnitCount}
                nodes={node.children}
                selectedLineNumbers={selectedLineNumbers}
                selectedRootLineNumber={selectedRootLineNumber}
                onSelectLine={onSelectLine}
              />
          ) : null}
        </StructureTreeRow>
      ))}
    </ul>
  );
}

function VirtualStructureTree({
  className,
  keepMountedLineNumbers = emptyKeepMountedLineNumbers,
  rows,
  ...props
}: Omit<StructureTreeProps, "nodes"> & {
  rows: FlatStructureTreeRow[];
}) {
  const hostRef = useRef<HTMLUListElement | null>(null);
  const pinnedIndexes = useMemo(
    () => new Set(
      rows.flatMap((row, index) =>
        keepMountedLineNumbers.has(row.node.lineNumber) ||
        props.selectedRootLineNumber === row.node.lineNumber
          ? [index]
          : [],
      ),
    ),
    [keepMountedLineNumbers, props.selectedRootLineNumber, rows],
  );
  const getItemKey = useCallback(
    (index: number) => rows[index]?.node.id ?? index.toString(),
    [rows],
  );
  const { scrollMargin, totalSize, virtualRows } = useVirtualTreeRows({
    count: rows.length,
    getItemKey,
    hostRef,
    pinnedIndexes,
  });

  return (
    <ul
      className={cx(
        "ui-tree ui-structure-tree ui-virtual-tree",
        className,
      )}
      data-virtual-row-count={rows.length}
      ref={hostRef}
      role="tree"
      style={{ height: `${totalSize}px` }}
    >
      {virtualRows.map((virtualRow) => {
        const row = rows[virtualRow.index];

        return row ? (
          <StructureTreeRow
            {...props}
            depth={row.depth}
            itemClassName="ui-virtual-tree-row"
            itemPosition={virtualRow.index + 1}
            itemSetSize={rows.length}
            itemStyle={{
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start - scrollMargin}px)`,
            }}
            key={virtualRow.key}
            node={row.node}
          />
        ) : null;
      })}
    </ul>
  );
}

export function StructureTree(props: StructureTreeProps) {
  const rows = useMemo(
    () => flattenStructureTreeRows(props.nodes),
    [props.nodes],
  );

  if (shouldVirtualizeUiRows(rows.length)) {
    return <VirtualStructureTree {...props} rows={rows} />;
  }

  return <StructureTreeContent {...props} depth={0} />;
}
