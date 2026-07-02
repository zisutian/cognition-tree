import type { DragEvent } from "react";
import type { CtnBlock } from "../../ctn/parseOutline";
import { OutlineNodeText } from "../notes/OutlineNodeText";
import { getOutlineDisplayText } from "../notes/outlineTextSegments";
import {
  getBlockLineLabel,
} from "./blockMigrationView";

type MigrationSourceTreeProps = {
  draggingLineNumber: string | null;
  nodes: CtnBlock[];
  onDragEnd: () => void;
  onDragStart: (
    event: DragEvent<HTMLDivElement>,
    lineNumber: number,
  ) => void;
};

export function MigrationSourceTree({
  draggingLineNumber,
  onDragEnd,
  onDragStart,
  nodes,
}: MigrationSourceTreeProps) {
  return (
    <ul className="migration-tree">
      {nodes.map((node) => {
        const isDragging = draggingLineNumber === String(node.lineNumber);
        const hasChildren = node.children.length > 0;

        return (
          <li key={node.id}>
            <div
              className={
                [
                  "migration-tree-node",
                  "source-node",
                  isDragging ? "is-dragging" : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              }
              draggable
              onDragEnd={onDragEnd}
              onDragStart={(event) => onDragStart(event, node.lineNumber)}
              title={`${node.label}: ${getOutlineDisplayText(node)}`}
            >
              <span className="migration-node-kind">{node.label}</span>
              <OutlineNodeText className="migration-node-text" node={node} />
              <span className="migration-node-lines">{getBlockLineLabel(node)}</span>
            </div>
            {hasChildren ? (
              <MigrationSourceTree
                draggingLineNumber={draggingLineNumber}
                nodes={node.children}
                onDragEnd={onDragEnd}
                onDragStart={onDragStart}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
