import { useMemo, type DragEvent } from "react";
import {
  flattenUiBlockSubtree,
  type UiBlockNode,
} from "../../../application/workspace/projection/viewBlocks";
import { cx } from "../../shared/primitives";
import type { ContextMenuPosition } from "../../shared/ContextMenu";
import {
  StructureTree,
  type StructureTreeRowProps,
} from "../../shared/tree";
import {
  blockLineDragDataType,
  createBlockLineDragPayload,
  readBlockLineDragPayload,
} from "./blockLineDrag";

export type StructureRowDropPlacement =
  | "inside"
  | "sibling-above"
  | "sibling-below";

export const emptySelectedLineNumbers: ReadonlySet<number> = new Set();

function readDraggedLine(event: DragEvent<HTMLElement>) {
  return readBlockLineDragPayload({
    plainText: event.dataTransfer.getData("text/plain"),
    typedPayload: event.dataTransfer.getData(blockLineDragDataType),
  });
}

function readPositiveLineNumber(value: string | null) {
  const lineNumber = Number(value);

  return Number.isInteger(lineNumber) && lineNumber > 0 ? lineNumber : null;
}

export function canDropStructureBlockOnLine({
  blockedLineNumbers,
  draggingLineNumber,
  targetLineNumber,
}: {
  blockedLineNumbers: ReadonlySet<number>;
  draggingLineNumber: string | null;
  targetLineNumber: number;
}) {
  return (
    readPositiveLineNumber(draggingLineNumber) !== null &&
    !blockedLineNumbers.has(targetLineNumber)
  );
}

export function canDropStructureBlockAtEnd(draggingLineNumber: string | null) {
  return readPositiveLineNumber(draggingLineNumber) !== null;
}

export function getStructureRowDropPlacement({
  clientY,
  height,
  top,
}: {
  clientY: number;
  height: number;
  top: number;
}): StructureRowDropPlacement {
  const rowHeight = Math.max(1, height);
  const offsetY = Math.max(0, Math.min(rowHeight, clientY - top));

  if (offsetY < rowHeight / 3) {
    return "sibling-above";
  }

  if (offsetY > (rowHeight * 2) / 3) {
    return "sibling-below";
  }

  return "inside";
}

export function getStructureBlockDropPosition(
  targetLineNumber: number,
  placement: StructureRowDropPlacement,
) {
  return placement === "inside"
    ? `inside:${targetLineNumber}`
    : `${placement}:${targetLineNumber}`;
}

export function getBlockedStructureDropLineNumbers(block: UiBlockNode | null) {
  return new Set(
    block ? flattenUiBlockSubtree(block).map((node) => node.lineNumber) : [],
  );
}

export function DropTarget({
  activePosition,
  label,
  position,
  onDropLine,
  onSetActivePosition,
}: {
  activePosition: string | null;
  label: string;
  position: string;
  onDropLine: (lineNumber: string, position: string) => void;
  onSetActivePosition: (position: string | null) => void;
}) {
  return (
    <div
      className={cx(
        "structure-operation-drop-target",
        activePosition === position && "is-active",
      )}
      onDragLeave={(event) => {
        const nextTarget = event.relatedTarget;

        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
          return;
        }

        onSetActivePosition(null);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        onSetActivePosition(position);
      }}
      onDrop={(event) => {
        const lineNumber = readDraggedLine(event);

        event.preventDefault();
        event.stopPropagation();
        onSetActivePosition(null);

        if (lineNumber) {
          onDropLine(lineNumber, position);
        }
      }}
    >
      {label}
    </div>
  );
}

function readStructureRowDropPosition(
  event: DragEvent<HTMLButtonElement>,
  targetLineNumber: number,
) {
  const rect = event.currentTarget.getBoundingClientRect();

  return getStructureBlockDropPosition(
    targetLineNumber,
    getStructureRowDropPlacement({
      clientY: event.clientY,
      height: rect.height,
      top: rect.top,
    }),
  );
}

export function StructureOperationTargetTree({
  activeDropPosition,
  activeTargetLineNumber,
  blockedLineNumbers,
  draggingLineNumber,
  draggable = false,
  indentUnitCount,
  nodes,
  selectedLineNumbers,
  selectedRootLineNumber,
  onActivateTarget,
  onDragEnd,
  onDragStartLine,
  onDropLine,
  onRequestMoveLine,
  onSelectLine,
  onSetActiveDropPosition,
}: {
  activeDropPosition: string | null;
  activeTargetLineNumber: number | null;
  blockedLineNumbers: ReadonlySet<number>;
  draggingLineNumber: string | null;
  draggable?: boolean;
  indentUnitCount?: number;
  nodes: UiBlockNode[];
  selectedLineNumbers: ReadonlySet<number>;
  selectedRootLineNumber: number | null;
  onActivateTarget: (lineNumber: number | null) => void;
  onDragEnd?: () => void;
  onDragStartLine?: (lineNumber: number) => void;
  onDropLine: (lineNumber: string, position: string) => void;
  onRequestMoveLine?: (
    lineNumber: number,
    position: ContextMenuPosition,
  ) => void;
  onSelectLine?: (lineNumber: number) => void;
  onSetActiveDropPosition: (position: string | null) => void;
}) {
  const draggedLineNumber = readPositiveLineNumber(draggingLineNumber);
  const keepMountedLineNumbers = useMemo(
    () => draggedLineNumber ? new Set([draggedLineNumber]) : undefined,
    [draggedLineNumber],
  );
  const getRowProps = (node: UiBlockNode): StructureTreeRowProps => {
    const isActiveTarget =
      draggingLineNumber !== null &&
      activeTargetLineNumber === node.lineNumber &&
      canDropStructureBlockOnLine({
        blockedLineNumbers,
        draggingLineNumber,
        targetLineNumber: node.lineNumber,
      });
    const activePlacement = isActiveTarget
      ? activeDropPosition?.split(":")[0]
      : null;

    return {
      className: cx(
        "structure-operation-target-node",
        draggingLineNumber === String(node.lineNumber) && "is-dragging",
        isActiveTarget && "is-position-source is-drop-target",
        activePlacement === "sibling-above" && "is-drop-above",
        activePlacement === "inside" && "is-drop-inside",
        activePlacement === "sibling-below" && "is-drop-below",
      ),
      "data-structure-row-drop": "true",
      draggable,
      onDragEnd,
      onContextMenu: onRequestMoveLine
        ? (event) => {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();

            onRequestMoveLine(node.lineNumber, {
              x: event.clientX || rect.left + rect.width / 2,
              y: event.clientY || rect.bottom,
            });
          }
        : undefined,
      onDragLeave: (event) => {
        const nextTarget = event.relatedTarget;

        if (
          nextTarget instanceof Node &&
          event.currentTarget.contains(nextTarget)
        ) {
          return;
        }

        onActivateTarget(null);
        onSetActiveDropPosition(null);
      },
      onDragOver: (event) => {
        const canDropOnNode = canDropStructureBlockOnLine({
          blockedLineNumbers,
          draggingLineNumber,
          targetLineNumber: node.lineNumber,
        });

        if (!canDropOnNode) {
          event.dataTransfer.dropEffect = "none";
          return;
        }

        const dropPosition = readStructureRowDropPosition(
          event,
          node.lineNumber,
        );

        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        onActivateTarget(node.lineNumber);
        onSetActiveDropPosition(dropPosition);
      },
      onDrop: (event) => {
        if (
          !canDropStructureBlockOnLine({
            blockedLineNumbers,
            draggingLineNumber,
            targetLineNumber: node.lineNumber,
          })
        ) {
          return;
        }

        const lineNumber = readDraggedLine(event);
        const dropPosition = readStructureRowDropPosition(
          event,
          node.lineNumber,
        );

        event.preventDefault();
        event.stopPropagation();
        onActivateTarget(null);
        onSetActiveDropPosition(null);

        if (lineNumber) {
          onDropLine(lineNumber, dropPosition);
        }
      },
      onDragStart: draggable
        ? (event) => {
            const payload = createBlockLineDragPayload(node.lineNumber);

            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData(blockLineDragDataType, payload);
            event.dataTransfer.setData("text/plain", payload);
            onDragStartLine?.(node.lineNumber);
          }
        : undefined,
    };
  };

  return (
    <StructureTree
      className="structure-operation-target-tree"
      getRowProps={getRowProps}
      indentUnitCount={indentUnitCount}
      keepMountedLineNumbers={keepMountedLineNumbers}
      nodes={nodes}
      selectedLineNumbers={selectedLineNumbers}
      selectedRootLineNumber={selectedRootLineNumber}
      onSelectLine={onSelectLine}
    />
  );
}
