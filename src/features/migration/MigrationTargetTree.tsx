import type { DragEvent } from "react";
import type { CtnBlock } from "../../ctn-parser/types";
import { CtnBlockTree } from "../blocks/CtnBlockTree";
import { OutlineNodeText } from "../blocks/OutlineNodeText";
import { getBlockLineLabel } from "./blockMigrationView";

type MigrationDropZoneProps = {
  activeDropPositionValue: string | null;
  isChildZone?: boolean;
  label: string;
  onDragLeavePosition: (
    event: DragEvent<HTMLElement>,
    positionValue: string,
  ) => void;
  onDragOverPosition: (
    event: DragEvent<HTMLElement>,
    positionValue: string,
  ) => void;
  onDropPosition: (
    event: DragEvent<HTMLElement>,
    positionValue: string,
  ) => void;
  positionValue: string;
};

export function MigrationDropZone({
  activeDropPositionValue,
  isChildZone = false,
  label,
  onDragLeavePosition,
  onDragOverPosition,
  onDropPosition,
  positionValue,
}: MigrationDropZoneProps) {
  return (
    <div
      className={
        [
          "migration-drop-zone",
          isChildZone ? "child-zone" : "",
          activeDropPositionValue === positionValue ? "is-drop-target" : "",
        ]
          .filter(Boolean)
          .join(" ")
      }
      onDragLeave={(event) => onDragLeavePosition(event, positionValue)}
      onDragOver={(event) => onDragOverPosition(event, positionValue)}
      onDrop={(event) => onDropPosition(event, positionValue)}
    >
      {label}
    </div>
  );
}

type MigrationTargetTreeProps = {
  activeDropPositionValue: string | null;
  activeTargetBlockLineNumber: number | null;
  isDropMode: boolean;
  nodes: CtnBlock[];
  onDragLeavePosition: (
    event: DragEvent<HTMLElement>,
    positionValue: string,
  ) => void;
  onDragOverPosition: (
    event: DragEvent<HTMLElement>,
    positionValue: string,
  ) => void;
  onDragOverTargetBlock: (
    event: DragEvent<HTMLElement>,
    lineNumber: number,
  ) => void;
  onDropPosition: (
    event: DragEvent<HTMLElement>,
    positionValue: string,
  ) => void;
};

export function MigrationTargetTree({
  activeDropPositionValue,
  activeTargetBlockLineNumber,
  isDropMode,
  nodes,
  onDragLeavePosition,
  onDragOverPosition,
  onDragOverTargetBlock,
  onDropPosition,
}: MigrationTargetTreeProps) {
  return (
    <CtnBlockTree
      className="ctn-tree-list migration-tree"
      nodes={nodes}
      renderBlock={({ block, children }) => {
        const insidePositionValue = `inside:${block.lineNumber}`;
        const isActiveTarget =
          isDropMode && activeTargetBlockLineNumber === block.lineNumber;

        return (
          <>
            {isActiveTarget ? (
              <MigrationDropZone
                activeDropPositionValue={activeDropPositionValue}
                label="上方并列"
                onDragLeavePosition={onDragLeavePosition}
                onDragOverPosition={onDragOverPosition}
                onDropPosition={onDropPosition}
                positionValue={`sibling-above:${block.lineNumber}`}
              />
            ) : null}
            <div
              className={
                [
                  "ctn-tree-main",
                  "ctn-tree-main-with-meta",
                  "migration-tree-node target-node",
                  isActiveTarget ? "is-position-source is-active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              }
              onDragOver={(event) =>
                onDragOverTargetBlock(event, block.lineNumber)
              }
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
            {isActiveTarget ? (
              <MigrationDropZone
                activeDropPositionValue={activeDropPositionValue}
                isChildZone
                label="作为子结点"
                onDragLeavePosition={onDragLeavePosition}
                onDragOverPosition={onDragOverPosition}
                onDropPosition={onDropPosition}
                positionValue={insidePositionValue}
              />
            ) : null}
            {isActiveTarget ? (
              <MigrationDropZone
                activeDropPositionValue={activeDropPositionValue}
                label="下方并列"
                onDragLeavePosition={onDragLeavePosition}
                onDragOverPosition={onDragOverPosition}
                onDropPosition={onDropPosition}
                positionValue={`sibling-below:${block.lineNumber}`}
              />
            ) : null}
          </>
        );
      }}
    />
  );
}
