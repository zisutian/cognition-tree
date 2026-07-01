import type { DragEvent } from "react";
import type { CtnBlock } from "../../ctn/parseOutline";
import {
  getBlockLineLabel,
  getBlockTitle,
} from "./blockMigrationView";

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
    <ul className="migration-tree">
      {nodes.map((node) => {
        const insidePositionValue = `inside:${node.lineNumber}`;
        const isActiveTarget =
          isDropMode && activeTargetBlockLineNumber === node.lineNumber;
        const hasChildren = node.children.length > 0;

        return (
          <li key={node.id}>
            {isActiveTarget ? (
              <MigrationDropZone
                activeDropPositionValue={activeDropPositionValue}
                label="上方并列"
                onDragLeavePosition={onDragLeavePosition}
                onDragOverPosition={onDragOverPosition}
                onDropPosition={onDropPosition}
                positionValue={`sibling-above:${node.lineNumber}`}
              />
            ) : null}
            <div
              className={
                [
                  "migration-tree-node target-node",
                  isActiveTarget ? "is-position-source" : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              }
              onDragOver={(event) => onDragOverTargetBlock(event, node.lineNumber)}
            >
              <span className="migration-node-kind">{node.label}</span>
              <span className="migration-node-text">{getBlockTitle(node)}</span>
              <span className="migration-node-lines">{getBlockLineLabel(node)}</span>
            </div>
            {hasChildren ? (
              <MigrationTargetTree
                activeDropPositionValue={activeDropPositionValue}
                activeTargetBlockLineNumber={activeTargetBlockLineNumber}
                isDropMode={isDropMode}
                nodes={node.children}
                onDragLeavePosition={onDragLeavePosition}
                onDragOverPosition={onDragOverPosition}
                onDragOverTargetBlock={onDragOverTargetBlock}
                onDropPosition={onDropPosition}
              />
            ) : null}
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
                positionValue={`sibling-below:${node.lineNumber}`}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
