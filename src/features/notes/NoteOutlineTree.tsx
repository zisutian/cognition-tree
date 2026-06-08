import { ChevronDown, ChevronRight } from "lucide-react";
import type { OutlineNode } from "../../ctn/parseOutline";

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
    <ul className="outline-list" data-depth={depth}>
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0;
        const isCollapsed = collapsedNodeIds.has(node.id);

        return (
          <li key={node.id}>
            <div
              className={
                node.diagnostics.length > 0
                  ? "outline-node has-diagnostics"
                  : "outline-node"
              }
            >
              <button
                aria-label={
                  isCollapsed ? `展开 ${node.text}` : `折叠 ${node.text}`
                }
                className="outline-toggle-button"
                disabled={!hasChildren}
                onClick={() => onToggleNode(node.id)}
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
                className="outline-node-content"
                onClick={() => onSelectLine(node.lineNumber)}
                title={`${node.label}: ${node.text}`}
                type="button"
              >
                <div className="node-main">
                  <span className="node-kind">{node.label}</span>
                  <span className="node-text">{node.text}</span>
                </div>
              </button>
            </div>
            {hasChildren && !isCollapsed ? (
              <NoteOutlineTree
                collapsedNodeIds={collapsedNodeIds}
                nodes={node.children}
                onSelectLine={onSelectLine}
                onToggleNode={onToggleNode}
                depth={depth + 1}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
