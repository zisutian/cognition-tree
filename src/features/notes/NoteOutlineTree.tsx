import type { CSSProperties } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { OutlineNode } from "../../ctn/parseOutline";
import { isCustomSyntaxTone } from "../../syntax/tones";
import type { CtnSyntaxTone } from "../../syntax/types";
import {
  createOutlineTextSegments,
  getOutlineDisplayText,
} from "./outlineTextSegments";

function getOutlineInlineClass(tone: CtnSyntaxTone) {
  return isCustomSyntaxTone(tone)
    ? "outline-inline ctn-tone-custom"
    : `outline-inline ctn-tone-${tone}`;
}

function getOutlineInlineStyle(tone: CtnSyntaxTone): CSSProperties | undefined {
  return isCustomSyntaxTone(tone)
    ? ({ "--ctn-tone-color": tone } as CSSProperties)
    : undefined;
}

function OutlineNodeText({ node }: { node: OutlineNode }) {
  return (
    <span className="node-text">
      {createOutlineTextSegments(node).map((segment) =>
        segment.kind === "inline" ? (
          <span
            className={getOutlineInlineClass(segment.tone)}
            key={segment.id}
            style={getOutlineInlineStyle(segment.tone)}
          >
            {segment.text}
          </span>
        ) : (
          <span key={segment.id}>{segment.text}</span>
        ),
      )}
    </span>
  );
}

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
        const displayText = getOutlineDisplayText(node);

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
                  isCollapsed ? `展开 ${displayText}` : `折叠 ${displayText}`
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
                title={`${node.label}: ${displayText}`}
                type="button"
              >
                <div className="node-main">
                  <span className="node-kind">{node.label}</span>
                  <OutlineNodeText node={node} />
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
