import { ChevronDown, ChevronRight } from "lucide-react";
import type { UiOutlineNode } from "../../../application/workspace/projection/viewBlocks";
import { BlockTree } from "../../shared/blocks/BlockTree";
import { BlockTextDisplay } from "../../shared/blocks/BlockTextDisplay";

export function NoteOutlineTree({
  collapsedNodeIds,
  nodes,
  onSelectLine,
  onToggleNode,
  depth = 0,
}: {
  collapsedNodeIds: Set<string>;
  nodes: UiOutlineNode[];
  onSelectLine: (lineNumber: number) => void;
  onToggleNode: (nodeId: string) => void;
  depth?: number;
}) {
  return (
    <BlockTree
      className="ctn-tree-list outline-list"
      depth={depth}
      nodes={nodes}
      renderBlock={({ block, children, hasChildren }) => {
        const isCollapsed = collapsedNodeIds.has(block.id);

        return (
          <>
            <div
              className={
                block.hasDiagnostics
                  ? "ctn-tree-row ctn-tree-row-with-toggle outline-node has-diagnostics"
                  : "ctn-tree-row ctn-tree-row-with-toggle outline-node"
              }
            >
              <button
                aria-label={
                  isCollapsed
                    ? `展开 ${block.textDisplay.displayText}`
                    : `折叠 ${block.textDisplay.displayText}`
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
                      size="1em"
                      strokeWidth={2}
                    />
                  ) : (
                    <ChevronDown
                      aria-hidden="true"
                      size="1em"
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
                title={`${block.label}: ${block.textDisplay.displayText}`}
                type="button"
              >
                <span className="ctn-tree-kind node-kind">{block.label}</span>
                <BlockTextDisplay
                  className="ctn-tree-text node-text"
                  text={block.textDisplay}
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
