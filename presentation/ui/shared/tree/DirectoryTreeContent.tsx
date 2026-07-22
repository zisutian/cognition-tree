import type { CSSProperties } from "react";
import { useCallback, useMemo, useRef } from "react";
import { cx } from "../primitives";
import { DirectoryTreeRow } from "./DirectoryTreeRow";
import type { DirectoryTreeRow as DirectoryTreeRowModel } from "./directoryRows";
import {
  isActiveDirectoryTreeNode,
  type DirectoryTreeRenderContext,
} from "./directoryTreeRender";
import { getTreeNodeReference, getTreeNodeReferenceKey } from "./drag";
import type { TreeNode } from "./types";
import { useVirtualTreeRows } from "./virtualTree";

type VirtualDirectoryTreeItemStyle = CSSProperties & {
  "--ui-directory-depth": string;
};

export function DirectoryTreeContent({
  className,
  context,
  nodes,
}: {
  className?: string;
  context: DirectoryTreeRenderContext;
  nodes: TreeNode[];
}) {
  const { collapsedFolderIds } = context.props;

  return (
    <ul className={cx("ui-tree ui-directory-tree", className)}>
      {nodes.map((node) => {
        const isCollapsed = node.kind === "folder" &&
          collapsedFolderIds?.has(node.folderId) === true;

        return (
          <DirectoryTreeRow context={context} key={node.id} node={node}>
            {node.kind === "folder" &&
            node.children.length > 0 &&
            !isCollapsed ? (
              <DirectoryTreeContent context={context} nodes={node.children} />
            ) : null}
          </DirectoryTreeRow>
        );
      })}
    </ul>
  );
}

export function VirtualDirectoryTreeContent({
  className,
  context,
  rows,
}: {
  className?: string;
  context: DirectoryTreeRenderContext;
  rows: DirectoryTreeRowModel[];
}) {
  const hostRef = useRef<HTMLUListElement | null>(null);
  const pinnedIndexes = useMemo(
    () => new Set(
      rows.flatMap((row, index) => {
        const nodeKey = getTreeNodeReferenceKey(
          getTreeNodeReference(row.node),
        );
        const pinned =
          nodeKey === context.dragState?.sourceKey ||
          nodeKey === context.editingNode?.key ||
          isActiveDirectoryTreeNode(context.props.activeNode, row.node) ||
          row.node === context.pendingDeleteNode;

        return pinned ? [index] : [];
      }),
    ),
    [
      context.dragState,
      context.editingNode,
      context.pendingDeleteNode,
      context.props.activeNode,
      rows,
    ],
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
        "ui-tree ui-directory-tree ui-virtual-tree",
        className,
      )}
      data-virtual-row-count={rows.length}
      ref={hostRef}
      style={{ height: `${totalSize}px` }}
    >
      {virtualRows.map((virtualRow) => {
        const row = rows[virtualRow.index];

        if (!row) {
          return null;
        }

        const itemStyle: VirtualDirectoryTreeItemStyle = {
          "--ui-directory-depth": String(row.depth),
          height: `${virtualRow.size}px`,
          transform: `translateY(${virtualRow.start - scrollMargin}px)`,
        };

        return (
          <DirectoryTreeRow
            context={context}
            itemClassName="ui-virtual-tree-row ui-directory-tree-virtual-row"
            itemPosition={virtualRow.index + 1}
            itemSetSize={rows.length}
            itemStyle={itemStyle}
            key={virtualRow.key}
            node={row.node}
          />
        );
      })}
    </ul>
  );
}
