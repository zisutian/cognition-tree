import type { DragEvent } from "react";
import {
  useMemo,
  useState,
} from "react";
import {
  flattenUiBlockSubtree,
  type UiBlockNode,
} from "../../../application/workspace/projection/viewBlocks";
import type { UiNoteSummary } from "../../../application/workspace/projection/viewTree";
import { UiSectionTitle } from "../../shared/primitives";
import {
  blockLineDragDataType,
  createBlockLineDragPayload,
  readBlockLineDragPayload,
} from "./blockLineDrag";
import { BlockStructureTree } from "./BlockStructureTree";
import { MigrationDropZone } from "./MigrationTargetTree";

type BlockStructureViewProps = {
  blocks: UiBlockNode[];
  note: UiNoteSummary | null;
  roots: UiBlockNode[];
  onMoveStructureBlock: (
    sourceBlockLineNumberValue: string,
    targetPositionValue: string,
  ) => void;
};

export function BlockStructureView({
  blocks,
  note,
  roots,
  onMoveStructureBlock,
}: BlockStructureViewProps) {
  const [selectedLineNumber, setSelectedLineNumber] = useState("");
  const [draggingLineNumber, setDraggingLineNumber] = useState<string | null>(
    null,
  );
  const [activeDropPositionValue, setActiveDropPositionValue] =
    useState<string | null>(null);
  const [activeTargetBlockLineNumber, setActiveTargetBlockLineNumber] =
    useState<number | null>(null);
  const selectedBlock =
    blocks.find((block) => String(block.lineNumber) === selectedLineNumber) ??
    null;
  const selectedSubtreeBlocks = useMemo(
    () => (selectedBlock ? flattenUiBlockSubtree(selectedBlock) : []),
    [selectedBlock],
  );
  const selectedLineNumbers = useMemo(
    () => new Set(selectedSubtreeBlocks.map((block) => block.lineNumber)),
    [selectedSubtreeBlocks],
  );

  const finishDrag = () => {
    setDraggingLineNumber(null);
    setActiveDropPositionValue(null);
    setActiveTargetBlockLineNumber(null);
  };
  const startDrag = (
    event: DragEvent<HTMLDivElement>,
    lineNumber: number,
  ) => {
    const lineNumberValue = String(lineNumber);
    const payload = createBlockLineDragPayload(lineNumber);

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(blockLineDragDataType, payload);
    event.dataTransfer.setData("text/plain", payload);
    setDraggingLineNumber(lineNumberValue);
    setSelectedLineNumber(lineNumberValue);
  };
  const dragOverTargetBlock = (
    event: DragEvent<HTMLElement>,
    lineNumber: number,
  ) => {
    if (!draggingLineNumber || selectedLineNumbers.has(lineNumber)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setActiveTargetBlockLineNumber(lineNumber);
    setActiveDropPositionValue(null);
  };
  const dragOverPosition = (
    event: DragEvent<HTMLElement>,
    positionValue: string,
  ) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setActiveDropPositionValue(positionValue);
  };
  const dragLeavePosition = (
    event: DragEvent<HTMLElement>,
    positionValue: string,
  ) => {
    const nextTarget = event.relatedTarget;

    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    setActiveDropPositionValue((current) =>
      current === positionValue ? null : current,
    );
  };
  const dropOnPosition = (
    event: DragEvent<HTMLElement>,
    positionValue: string,
  ) => {
    event.preventDefault();

    const lineNumberValue = readBlockLineDragPayload({
      plainText: event.dataTransfer.getData("text/plain"),
      typedPayload: event.dataTransfer.getData(blockLineDragDataType),
    });

    if (lineNumberValue) {
      onMoveStructureBlock(lineNumberValue, positionValue);
      setSelectedLineNumber("");
    }

    finishDrag();
  };

  return (
    <div className="migration-grid migration-structure-grid">
      <section className="migration-column">
        <UiSectionTitle>
          结构 · {note?.title ?? "—"}
        </UiSectionTitle>
        <div className="migration-tree-panel">
          {roots.length > 0 ? (
            <>
              <BlockStructureTree
                activeDropPositionValue={activeDropPositionValue}
                activeTargetBlockLineNumber={activeTargetBlockLineNumber}
                draggingLineNumber={draggingLineNumber}
                nodes={roots}
                selectedLineNumbers={selectedLineNumbers}
                selectedRootLineNumber={selectedBlock?.lineNumber ?? null}
                onDragEnd={finishDrag}
                onDragLeavePosition={dragLeavePosition}
                onDragOverPosition={dragOverPosition}
                onDragOverTargetBlock={dragOverTargetBlock}
                onDragStart={startDrag}
                onDropPosition={dropOnPosition}
                onSelectBlock={(lineNumber) =>
                  setSelectedLineNumber(String(lineNumber))
                }
              />
              {draggingLineNumber ? (
                <MigrationDropZone
                  activeDropPositionValue={activeDropPositionValue}
                  label="文末根块"
                  onDragLeavePosition={dragLeavePosition}
                  onDragOverPosition={dragOverPosition}
                  onDropPosition={dropOnPosition}
                  positionValue="end"
                />
              ) : null}
            </>
          ) : (
            <p className="ui-muted">当前笔记没有可调整块。</p>
          )}
        </div>
      </section>
    </div>
  );
}
