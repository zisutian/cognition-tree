import { ArrowLeftRight } from "lucide-react";
import {
  useEffect,
  useState,
  type MouseEvent,
} from "react";
import type { StructureOperationActivityViewModel } from "../../../application/workspace/activities/structure-operation/structureOperationViewModel";
import { Button, Section } from "../../shared/primitives";
import {
  ContextMenu,
  type ContextMenuPosition,
} from "../../shared/ContextMenu";
import { StructureTree } from "../../shared/tree";
import {
  blockLineDragDataType,
  createBlockLineDragPayload,
} from "./blockLineDrag";
import {
  findBlockByLineNumber,
  useSelectedBlockLines,
} from "./structureOperationBlocks";
import {
  DropTarget,
  StructureOperationTargetTree,
  canDropStructureBlockAtEnd,
  emptySelectedLineNumbers,
} from "./structureOperationDropTargets";
import { StructureBlockMoveQuickPick } from "./StructureBlockMoveQuickPick";

export function StructureOperationPairView({
  view,
}: {
  view: StructureOperationActivityViewModel;
}) {
  const [sourceLineNumber, setSourceLineNumber] = useState("");
  const [draggingLineNumber, setDraggingLineNumber] = useState<string | null>(
    null,
  );
  const [activeDropPosition, setActiveDropPosition] = useState<string | null>(
    null,
  );
  const [activeTargetLineNumber, setActiveTargetLineNumber] = useState<
    number | null
  >(null);
  const [moveContext, setMoveContext] = useState<{
    lineNumber: number;
    position: ContextMenuPosition;
  } | null>(null);
  const [moveSourceLineNumber, setMoveSourceLineNumber] = useState<
    number | null
  >(null);
  const sourceBlock = findBlockByLineNumber(
    view.sourceBlocks,
    sourceLineNumber,
  );
  const selectedLineNumbers = useSelectedBlockLines(sourceBlock);
  const showEndDropTarget = canDropStructureBlockAtEnd(draggingLineNumber);

  useEffect(() => {
    setSourceLineNumber("");
    setDraggingLineNumber(null);
    setActiveDropPosition(null);
    setActiveTargetLineNumber(null);
    setMoveContext(null);
    setMoveSourceLineNumber(null);
  }, [view.sourceNoteId, view.targetNoteId]);

  const finishDrag = () => {
    setDraggingLineNumber(null);
    setActiveDropPosition(null);
    setActiveTargetLineNumber(null);
  };
  const startDrag = (lineNumber: number) => {
    const lineNumberValue = String(lineNumber);

    setDraggingLineNumber(lineNumberValue);
    setSourceLineNumber(lineNumberValue);
  };
  const dropLine = (lineNumber: string, position: string) => {
    setSourceLineNumber(lineNumber);
    view.onMoveStructureBlockBetweenNotes(lineNumber, position);
    finishDrag();
  };
  const openMoveContext = (
    event: MouseEvent<HTMLButtonElement>,
    lineNumber: number,
  ) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();

    setSourceLineNumber(String(lineNumber));
    setMoveContext({
      lineNumber,
      position: {
        x: event.clientX || rect.left + rect.width / 2,
        y: event.clientY || rect.bottom,
      },
    });
  };

  return (
    <div className="structure-operation-grid">
      <Section
        className="structure-operation-column"
        title={`源笔记 · ${view.sourceNote?.title ?? "未选择"}`}
      >
        {view.sourceRoots.length > 0 ? (
          <StructureTree
            getRowProps={(node) => ({
              className:
                draggingLineNumber === String(node.lineNumber)
                  ? "is-dragging"
                  : undefined,
              draggable: true,
              onDragEnd: finishDrag,
              onDragStart: (event) => {
                const payload = createBlockLineDragPayload(node.lineNumber);

                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData(blockLineDragDataType, payload);
                event.dataTransfer.setData("text/plain", payload);
                startDrag(node.lineNumber);
              },
              onContextMenu: (event) =>
                openMoveContext(event, node.lineNumber),
            })}
            indentUnitCount={view.indentUnitCount}
            nodes={view.sourceRoots}
            selectedLineNumbers={selectedLineNumbers}
            selectedRootLineNumber={sourceBlock?.lineNumber ?? null}
            onSelectLine={(lineNumber) => setSourceLineNumber(String(lineNumber))}
          />
        ) : (
          <p className="ui-muted">源笔记没有可移动块。</p>
        )}
      </Section>
      <div className="structure-operation-pair-swap">
        <Button
          aria-label="交换源笔记和目标笔记"
          disabled={
            !view.sourceNote ||
            !view.targetNote ||
            view.sourceNote.id === view.targetNote.id
          }
          onClick={view.onSwapSourceAndTargetNotes}
          title="交换源笔记和目标笔记"
          type="button"
          variant="icon"
        >
          <ArrowLeftRight aria-hidden="true" size={14} />
        </Button>
      </div>
      <Section
        className="structure-operation-column"
        title={`目标笔记 · ${view.targetNote?.title ?? "未选择"}`}
      >
        {showEndDropTarget && view.targetRoots.length === 0 ? (
          <DropTarget
            activePosition={activeDropPosition}
            label="文末根块"
            position="end"
            onDropLine={dropLine}
            onSetActivePosition={setActiveDropPosition}
          />
        ) : null}
        {view.targetRoots.length > 0 ? (
          <>
            <StructureOperationTargetTree
              activeDropPosition={activeDropPosition}
              activeTargetLineNumber={activeTargetLineNumber}
              blockedLineNumbers={emptySelectedLineNumbers}
              draggingLineNumber={draggingLineNumber}
              indentUnitCount={view.indentUnitCount}
              nodes={view.targetRoots}
              selectedLineNumbers={emptySelectedLineNumbers}
              selectedRootLineNumber={null}
              onActivateTarget={setActiveTargetLineNumber}
              onDropLine={dropLine}
              onSetActiveDropPosition={setActiveDropPosition}
            />
            {showEndDropTarget ? (
              <DropTarget
                activePosition={activeDropPosition}
                label="文末根块"
                position="end"
                onDropLine={dropLine}
                onSetActivePosition={setActiveDropPosition}
              />
            ) : null}
          </>
        ) : (
          <p className="ui-muted">目标笔记没有结构。</p>
        )}
      </Section>
      <ContextMenu
        ariaLabel="结构块操作"
        items={moveContext
          ? [
              {
                id: "move-to",
                label: "移动到…",
                onSelect: () =>
                  setMoveSourceLineNumber(moveContext.lineNumber),
              },
            ]
          : []}
        position={moveContext?.position ?? null}
        onClose={() => setMoveContext(null)}
      />
      <StructureBlockMoveQuickPick
        blockedLineNumbers={emptySelectedLineNumbers}
        nodes={view.targetRoots}
        sourceLineNumber={moveSourceLineNumber}
        onClose={() => setMoveSourceLineNumber(null)}
        onMove={dropLine}
      />
    </div>
  );
}
