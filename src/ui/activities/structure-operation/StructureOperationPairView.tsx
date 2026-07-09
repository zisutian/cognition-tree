import {
  useEffect,
  useState,
} from "react";
import type { ViewModel } from "../../../application/workspace/view-model/useViewModel";
import { Section } from "../../shared/primitives";
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
  MovingTargetTree,
  canDropStructureBlockAtEnd,
  emptySelectedLineNumbers,
} from "./structureOperationDropTargets";

export function StructureOperationPairView({ view }: { view: ViewModel }) {
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
  const sourceBlock = findBlockByLineNumber(
    view.structureOperation.sourceBlocks,
    sourceLineNumber,
  );
  const selectedLineNumbers = useSelectedBlockLines(sourceBlock);
  const showEndDropTarget = canDropStructureBlockAtEnd(draggingLineNumber);

  useEffect(() => {
    setSourceLineNumber("");
    setDraggingLineNumber(null);
    setActiveDropPosition(null);
    setActiveTargetLineNumber(null);
  }, [view.structureOperation.sourceNoteId, view.structureOperation.targetNoteId]);

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
    view.structureOperation.onMoveStructureBlockBetweenNotes(lineNumber, position);
    finishDrag();
  };

  return (
    <div className="structure-operation-grid">
      <Section
        className="structure-operation-column"
        title={`源笔记 · ${view.structureOperation.sourceNote?.title ?? "未选择"}`}
      >
        {view.structureOperation.sourceRoots.length > 0 ? (
          <StructureTree
            activeLineNumbers={selectedLineNumbers}
            dragDataType={blockLineDragDataType}
            draggingLineNumber={draggingLineNumber}
            draggable
            getDragPayload={createBlockLineDragPayload}
            indentUnitCount={view.editor.syntaxProfile.tabDisplayWidth}
            nodes={view.structureOperation.sourceRoots}
            selectedRootLineNumber={sourceBlock?.lineNumber ?? null}
            onDragEnd={finishDrag}
            onDragStart={startDrag}
            onSelectLine={(lineNumber) => setSourceLineNumber(String(lineNumber))}
          />
        ) : (
          <p className="ui-muted">源笔记没有可移动块。</p>
        )}
      </Section>
      <Section
        className="structure-operation-column"
        title={`目标笔记 · ${view.structureOperation.targetNote?.title ?? "未选择"}`}
      >
        {showEndDropTarget && view.structureOperation.targetRoots.length === 0 ? (
          <DropTarget
            activePosition={activeDropPosition}
            label="文末根块"
            position="end"
            onDropLine={dropLine}
            onSetActivePosition={setActiveDropPosition}
          />
        ) : null}
        {view.structureOperation.targetRoots.length > 0 ? (
          <>
            <MovingTargetTree
              activeDropPosition={activeDropPosition}
              activeTargetLineNumber={activeTargetLineNumber}
              blockedLineNumbers={emptySelectedLineNumbers}
              draggingLineNumber={draggingLineNumber}
              indentUnitCount={view.editor.syntaxProfile.tabDisplayWidth}
              nodes={view.structureOperation.targetRoots}
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
    </div>
  );
}
