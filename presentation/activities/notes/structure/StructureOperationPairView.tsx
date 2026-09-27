import {
  Button,
  ContentTreeDragScope,
  ContextMenu,
  EmptyState,
  Section,
  Stack,
  Toolbar,
  type ContentTreeMoveRequest,
} from "compact-ui";
import { ArrowLeftRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { StructureOperationActivityViewModel } from "../../../../application/workspace/index.ts";
import { StructureTree, useFeedback } from "../../../ui/index.ts";
import { StructureBlockMoveQuickPick } from "./StructureBlockMoveQuickPick.tsx";
import { findBlockById, useSelectedBlockIds } from "./structureOperationBlocks.ts";
import {
  requireStructureMoveIntent,
  resolveStructureMoveIntent,
  type StructureMoveContext,
  type StructureMoveIdentity,
} from "./structureMoveIntent.ts";
import structureStyles from "./structure.module.css";
import { createClassNames } from "../../../ui/index.ts";

const cx = createClassNames(structureStyles);
const sourceTreeId = "structure-source";
const targetTreeId = "structure-target";
const emptySelection: ReadonlySet<string> = new Set();

type MoveSource = {
  nodeId: string;
  identity: StructureMoveIdentity;
};

export function StructureOperationPairView({
  view,
}: {
  view: StructureOperationActivityViewModel;
}) {
  const { runAction } = useFeedback();
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [moveContext, setMoveContext] = useState<{
    source: MoveSource;
    position: { x: number; y: number };
  } | null>(null);
  const [moveSource, setMoveSource] = useState<MoveSource | null>(null);
  const sourceBlock = findBlockById(view.sourceRoots, sourceId);
  const selectedIds = useSelectedBlockIds(sourceBlock);
  const identity: StructureMoveIdentity = {
    repositoryId: view.repositoryId,
    sourceNoteId: view.sourceNote?.id ?? null,
    targetNoteId: view.targetNote?.id ?? null,
  };
  const context: StructureMoveContext = {
    ...identity,
    canMutate: view.canMutate,
    sourceRoots: view.sourceRoots,
    sourceTreeId,
    targetRoots: view.targetRoots,
    targetTreeId,
  };
  const dragSource = useMemo(() => ({
    treeId: sourceTreeId,
    contentKey: `${view.repositoryId}:${view.sourceNoteId}`,
    canDrag: (nodeId: string) => view.canMutate &&
      Boolean(view.sourceNote && view.targetNote && view.sourceNote.id !== view.targetNote.id) &&
      findBlockById(view.sourceRoots, nodeId) !== null,
  }), [view.canMutate, view.repositoryId, view.sourceNoteId, view.sourceNote, view.targetNote, view.sourceRoots]);
  const dragTarget = useMemo(() => ({
    treeId: targetTreeId,
    contentKey: `${view.repositoryId}:${view.targetNoteId}`,
    endDropLabel: "文末根块",
    canDrop: (request: ContentTreeMoveRequest) =>
      resolveStructureMoveIntent(request, context, identity) !== null,
  }), [view]);

  useEffect(() => {
    setSourceId(null);
    setMoveContext(null);
    setMoveSource(null);
  }, [view.repositoryId, view.sourceNoteId, view.targetNoteId]);

  const performMove = (
    request: ContentTreeMoveRequest,
    expected: StructureMoveIdentity,
  ) => {
    const { sourceLine, targetPosition } = requireStructureMoveIntent(
      request,
      context,
      expected,
    );
    setSourceId(request.source.nodeId);
    view.onMoveStructureBlockBetweenNotes(sourceLine, targetPosition);
  };

  return (
    <ContentTreeDragScope
      onMoveRequest={(request) => runAction(() => performMove(request, identity))}
    >
      <Stack>
        <Toolbar aria-label="结构迁移操作">
          <Button
            aria-label="交换源笔记和目标笔记"
            disabled={!view.sourceNote || !view.targetNote || view.sourceNote.id === view.targetNote.id}
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
                  dragDrop={dragSource}
                  indentUnitCount={view.indentUnitCount}
                  nodes={view.sourceRoots}
                  selectedIds={selectedIds}
                  selectedRootId={sourceBlock?.id ?? null}
                  selectionMode="collection"
                  stateKey={`structure-source:${view.repositoryId}:${view.sourceNoteId}`}
                  onRequestContextMenu={(nodeId, position) => {
                    setSourceId(nodeId);
                    setMoveContext({ source: { nodeId, identity }, position });
                  }}
                  onSelectNode={(node) => setSourceId(node.id)}
                />
              ) : <EmptyState title="源笔记没有可移动块。" />}
            </Section>
          </section>
          <section
            className={cx("structure-operation-column")}
            aria-label={`目标笔记 · ${view.targetNote?.title ?? "未选择"}`}
          >
            <Section title={`目标笔记 · ${view.targetNote?.title ?? "未选择"}`}>
              {view.targetNote ? (
                <StructureTree
                  ariaLabel="目标笔记结构"
                  dragDrop={dragTarget}
                  indentUnitCount={view.indentUnitCount}
                  nodes={view.targetRoots}
                  selectionMode="none"
                  stateKey={`structure-target:${view.repositoryId}:${view.targetNoteId}`}
                />
              ) : <EmptyState title="尚未选择目标笔记。" />}
            </Section>
          </section>
        </Stack>
        {moveContext && (
          <ContextMenu
            aria-label="结构块操作"
            items={[{
              id: "move-to",
              label: "移动到…",
              onSelect: () => setMoveSource(moveContext.source),
            }]}
            position={moveContext.position}
            onClose={() => setMoveContext(null)}
          />
        )}
        <StructureBlockMoveQuickPick
          blockedIds={emptySelection}
          nodes={view.targetRoots}
          sourceId={moveSource?.nodeId ?? null}
          targetTreeId={targetTreeId}
          onClose={() => setMoveSource(null)}
          onMove={(target) => {
            if (!moveSource) throw new Error("无法移动结构块：源结构块已失效。");
            performMove({ source: { treeId: sourceTreeId, nodeId: moveSource.nodeId }, target }, moveSource.identity);
          }}
        />
      </Stack>
    </ContentTreeDragScope>
  );
}
