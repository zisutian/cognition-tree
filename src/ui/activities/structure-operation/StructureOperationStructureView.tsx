import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type { StructureOperationActivityViewModel } from "../../../application/workspace/view-model/activityViewModels";
import { Section } from "../../shared/primitives";
import {
  findBlockByLineNumber,
  useSelectedBlockLines,
} from "./structureOperationBlocks";
import {
  DropTarget,
  MovingTargetTree,
  canDropStructureBlockAtEnd,
  getBlockedStructureDropLineNumbers,
} from "./structureOperationDropTargets";

export function StructureOperationStructureView({
  view,
}: {
  view: StructureOperationActivityViewModel;
}) {
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
    view.onMoveStructureBlockWithinNote(lineNumber, position);
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
            <MovingTargetTree
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
    </div>
  );
}
