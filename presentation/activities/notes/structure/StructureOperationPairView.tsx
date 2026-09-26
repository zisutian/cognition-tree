import { EmptyState } from "compact-ui";
import { ContextMenu } from "compact-ui";
import type { ComponentProps } from "react";
type ContextMenuPosition = ComponentProps<typeof ContextMenu>["position"];
import { Button, Section, Stack, Toolbar } from "compact-ui";
import { ArrowLeftRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { StructureOperationActivityViewModel } from "../../../../application/workspace/index.ts";
import {
  StructureTree,
  createClassNames,
  useFeedback,
} from "../../../ui/index.ts";
import structureStyles from "./structure.module.css";
const cx = createClassNames(structureStyles);

import {
  blockLineDragDataType,
  createBlockLineDragPayload,
} from "./blockLineDrag.ts";
import { StructureBlockMoveQuickPick } from "./StructureBlockMoveQuickPick.tsx";
import {
  findBlockByLineNumber,
  useSelectedBlockLines,
} from "./structureOperationBlocks.ts";
import {
  DropTarget,
  StructureOperationTargetTree,
  canDropStructureBlockAtEnd,
  emptySelectedLineNumbers,
} from "./structureOperationDropTargets.tsx";

export function StructureOperationPairView({
  view,
}: {
  view: StructureOperationActivityViewModel;
}) {
  const { runAction } = useFeedback();
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
  const keepMountedLineNumbers = useMemo(
    () =>
      draggingLineNumber ? new Set([Number(draggingLineNumber)]) : undefined,
    [draggingLineNumber],
  );
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
    runAction(() =>
      view.onMoveStructureBlockBetweenNotes(lineNumber, position),
    );
    finishDrag();
  };
  const openMoveContext = (
    lineNumber: number,
    position: ContextMenuPosition,
  ) => {
    setSourceLineNumber(String(lineNumber));
    setMoveContext({ lineNumber, position });
  };

  return (
    <Stack>
      <Toolbar aria-label="结构迁移操作">
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
          iconOnly
        >
          <ArrowLeftRight aria-hidden="true" size={14} />
        </Button>
      </Toolbar>
      <Stack direction="row" wrap align="start">
        <section
          className={cx("structure-operation-column")}
          aria-label={`源笔记 · ${view.sourceNote?.title ?? "未选择"}`}
        >
          <Section title={`源笔记 · ${view.sourceNote?.title ?? "未选择"}`}>
            {view.sourceRoots.length > 0 ? (
              <StructureTree
                ariaLabel="源笔记结构"
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
                })}
                indentUnitCount={view.indentUnitCount}
                keepMountedLineNumbers={keepMountedLineNumbers}
                nodes={view.sourceRoots}
                selectedLineNumbers={selectedLineNumbers}
                selectedRootLineNumber={sourceBlock?.lineNumber ?? null}
                stateKey={`structure-source:${view.sourceNoteId}`}
                subtreeSelection
                onRequestContextMenu={(node, position) =>
                  openMoveContext(node.lineNumber, position)
                }
                onSelectLine={(lineNumber) =>
                  setSourceLineNumber(String(lineNumber))
                }
              />
            ) : (
              <EmptyState title="源笔记没有可移动块。" />
            )}
          </Section>
        </section>

        <section
          className={cx("structure-operation-column")}
          aria-label={`目标笔记 · ${view.targetNote?.title ?? "未选择"}`}
        >
          <Section title={`目标笔记 · ${view.targetNote?.title ?? "未选择"}`}>
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
                  stateKey={`structure-target:${view.targetNoteId}`}
                  ariaLabel="目标笔记结构"
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
              <EmptyState title="目标笔记没有结构。" />
            )}
          </Section>
        </section>
      </Stack>
      {moveContext ? (
        <ContextMenu
          aria-label="结构块操作"
          items={
            moveContext
              ? [
                  {
                    id: "move-to",
                    label: "移动到…",
                    onSelect: () =>
                      setMoveSourceLineNumber(moveContext.lineNumber),
                  },
                ]
              : []
          }
          position={moveContext.position}
          onClose={() => setMoveContext(null)}
        />
      ) : null}
      <StructureBlockMoveQuickPick
        blockedLineNumbers={emptySelectedLineNumbers}
        nodes={view.targetRoots}
        sourceLineNumber={moveSourceLineNumber}
        onClose={() => setMoveSourceLineNumber(null)}
        onMove={dropLine}
      />
    </Stack>
  );
}
