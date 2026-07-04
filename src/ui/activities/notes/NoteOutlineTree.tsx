import { ChevronDown, ChevronRight } from "lucide-react";
import type { OutlineNode } from "../../../ctn/parser/types";
import { CtnBlockTree } from "../../shared/blocks/CtnBlockTree";
import { OutlineNodeText } from "../../shared/blocks/OutlineNodeText";
import { getOutlineDisplayText } from "../../shared/blocks/outlineTextSegments";

export function NoteOutlineTree({
  collapsedNodeIds,
  nodes,
  onSelectLine,
  onToggleNode,
  depth = 0,
}: {
  collapsedNodeIds: Set<string>;
  nodes: OutlineNode[];
  onSelectLine: (lineNumber: number) => void;
  onToggleNode: (nodeId: string) => void;
  depth?: number;
}) {
  return (
    <CtnBlockTree
      className="ctn-tree-list outline-list"
      depth={depth}
      nodes={nodes}
      renderBlock={({ block, children, hasChildren }) => {
        const isCollapsed = collapsedNodeIds.has(block.id);
        const displayText = getOutlineDisplayText(block);

        return (
          <>
            <div
              className={
                block.diagnostics.length > 0
                  ? "ctn-tree-row ctn-tree-row-with-toggle outline-node has-diagnostics"
                  : "ctn-tree-row ctn-tree-row-with-toggle outline-node"
              }
            >
              <button
                aria-label={
                  isCollapsed ? `展开 ${displayText}` : `折叠 ${displayText}`
                }
                className="ctn-tree-toggle outline-toggle-button"
                disabled={!hasChildren}
                onClick={() => onToggleNode(block.id)}
                title={isCollapsed ? "展开节点" : "折叠节点"}
                type="button"
              >
                {hasChildren ? (
                  isCollapsed ? (
                    <ChevronRight
                      aria-hidden="true"
                      size={13}
                      strokeWidth={2}
                    />
                  ) : (
                    <ChevronDown
                      aria-hidden="true"
                      size={13}
                      strokeWidth={2}
                    />
                  )
                ) : (
                  <span aria-hidden="true" />
                )}
              </button>
              <button
                className="ctn-tree-main ctn-tree-main-label ctn-tree-main-compact outline-node-content"
                onClick={() => onSelectLine(block.lineNumber)}
                title={`${block.label}: ${displayText}`}
                type="button"
              >
                <span className="ctn-tree-kind node-kind">{block.label}</span>
                <OutlineNodeText
                  className="ctn-tree-text node-text"
                  node={block}
                />
              </button>
            </div>
            {hasChildren && !isCollapsed ? children : null}
          </>
        );
      }}
    />
  );
}
