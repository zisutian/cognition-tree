import type { DragEvent } from "react";
import type { CtnBlock } from "../../ctn-parser/types";
import { CtnBlockTree } from "../blocks/CtnBlockTree";
import { OutlineNodeText } from "../blocks/OutlineNodeText";
import { getOutlineDisplayText } from "../blocks/outlineTextSegments";
import { getBlockLineLabel } from "./blockMigrationView";

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
    <CtnBlockTree
      className="ctn-tree-list migration-tree"
      nodes={nodes}
      renderBlock={({ block, children }) => {
        const isDragging = draggingLineNumber === String(block.lineNumber);

        return (
          <>
            <div
              className={
                [
                  "migration-tree-node",
                  "ctn-tree-main",
                  "ctn-tree-main-with-meta",
                  "source-node",
                  isDragging ? "is-dragging" : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              }
              draggable
              onDragEnd={onDragEnd}
              onDragStart={(event) => onDragStart(event, block.lineNumber)}
              title={`${block.label}: ${getOutlineDisplayText(block)}`}
            >
              <span className="ctn-tree-kind migration-node-kind">
                {block.label}
              </span>
              <OutlineNodeText
                className="ctn-tree-text migration-node-text"
                node={block}
              />
              <span className="ctn-tree-meta migration-node-lines">
                {getBlockLineLabel(block)}
              </span>
            </div>
            {children}
          </>
        );
      }}
    />
  );
}
