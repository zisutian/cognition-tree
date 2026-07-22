import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type { StructureOperationActivityViewModel } from "../../../../application/workspace/activities/structure-operation/structureOperationViewModel";
import {
  ContextMenu,
  type ContextMenuPosition,
} from "../../../ui/shared/ContextMenu";
import { Section } from "../../../ui/shared/primitives";
import { useFeedback } from "../../../ui/shared/FeedbackProvider";
import {
  findBlockByLineNumber,
  useSelectedBlockLines,
} from "./structureOperationBlocks";
import {
  DropTarget,
  StructureOperationTargetTree,
  canDropStructureBlockAtEnd,
  getBlockedStructureDropLineNumbers,
} from "./structureOperationDropTargets";
import { StructureBlockMoveQuickPick } from "./StructureBlockMoveQuickPick";

export function StructureOperationStructureView({
  view,
}: {
  view: StructureOperationActivityViewModel;
}) {
  const { runAction } = useFeedback();
  const [selectedLineNumber, setSelectedLineNumber] = useState("");
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
  const selectedBlock = findBlockByLineNumber(
    view.structureBlocks,
    draggingLineNumber ?? selectedLineNumber,
  );
  const selectedLineNumbers = useSelectedBlockLines(selectedBlock);
  const blockedLineNumbers = useMemo(
    () => getBlockedStructureDropLineNumbers(selectedBlock),
    [selectedBlock],
  );
  const showEndDropTarget = canDropStructureBlockAtEnd(draggingLineNumber);

  useEffect(() => {
    setSelectedLineNumber("");
    setDraggingLineNumber(null);
    setActiveDropPosition(null);
    setActiveTargetLineNumber(null);
    setMoveContext(null);
    setMoveSourceLineNumber(null);
  }, [view.mode, view.structureNoteId]);

  const finishDrag = () => {
    setDraggingLineNumber(null);
    setActiveDropPosition(null);
    setActiveTargetLineNumber(null);
  };
  const startDrag = (lineNumber: number) => {
    const lineNumberValue = String(lineNumber);

    setDraggingLineNumber(lineNumberValue);
    setSelectedLineNumber(lineNumberValue);
  };
  const dropLine = (lineNumber: string, position: string) => {
    runAction(() => view.onMoveStructureBlockWithinNote(lineNumber, position));
    setSelectedLineNumber("");
    finishDrag();
  };

  return (
    <div className="structure-operation-grid structure-operation-grid-single">
      <Section
        className="structure-operation-column"
        title={`笔记结构 · ${view.structureNote?.title ?? "未选择"}`}
      >
        {showEndDropTarget && view.structureRoots.length === 0 ? (
          <DropTarget
            activePosition={activeDropPosition}
            label="文末根块"
            position="end"
            onDropLine={dropLine}
            onSetActivePosition={setActiveDropPosition}
          />
        ) : null}
        {view.structureRoots.length > 0 ? (
          <>
            <StructureOperationTargetTree
              activeDropPosition={activeDropPosition}
              activeTargetLineNumber={activeTargetLineNumber}
              blockedLineNumbers={blockedLineNumbers}
              draggingLineNumber={draggingLineNumber}
              draggable
              indentUnitCount={view.indentUnitCount}
              nodes={view.structureRoots}
              selectedLineNumbers={selectedLineNumbers}
              selectedRootLineNumber={selectedBlock?.lineNumber ?? null}
              onActivateTarget={setActiveTargetLineNumber}
              onDragEnd={finishDrag}
              onDragStartLine={startDrag}
              onDropLine={dropLine}
              onRequestMoveLine={(lineNumber, position) => {
                setSelectedLineNumber(String(lineNumber));
                setMoveContext({ lineNumber, position });
              }}
              onSelectLine={(lineNumber) =>
                setSelectedLineNumber(String(lineNumber))
              }
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
          <p className="ui-muted">当前笔记结构没有可调整块。</p>
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
        blockedLineNumbers={blockedLineNumbers}
        nodes={view.structureRoots}
        sourceLineNumber={moveSourceLineNumber}
        onClose={() => setMoveSourceLineNumber(null)}
        onMove={dropLine}
      />
    </div>
  );
}
