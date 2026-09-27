import {
  ContentTreeDragScope,
  ContextMenu,
  EmptyState,
  Section,
  Stack,
  type ContentTreeMoveRequest,
} from "compact-ui";
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

const treeId = "structure-within";

type MoveSource = {
  nodeId: string;
  identity: StructureMoveIdentity;
};

export function StructureOperationStructureView({
  view,
}: {
  view: StructureOperationActivityViewModel;
}) {
  const { runAction } = useFeedback();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [moveContext, setMoveContext] = useState<{
    source: MoveSource;
    position: { x: number; y: number };
  } | null>(null);
  const [moveSource, setMoveSource] = useState<MoveSource | null>(null);
  const selectedBlock = findBlockById(view.structureRoots, selectedId);
  const selectedIds = useSelectedBlockIds(selectedBlock);
  const identity: StructureMoveIdentity = {
    repositoryId: view.repositoryId,
    sourceNoteId: view.structureNote?.id ?? null,
    targetNoteId: view.structureNote?.id ?? null,
  };
  const context: StructureMoveContext = {
    ...identity,
    canMutate: view.canMutate,
    sourceRoots: view.structureRoots,
    sourceTreeId: treeId,
    targetRoots: view.structureRoots,
    targetTreeId: treeId,
  };
  const dragDrop = useMemo(() => ({
    treeId,
    contentKey: `${view.repositoryId}:${view.structureNoteId}`,
    endDropLabel: "文末根块",
    canDrag: (nodeId: string) => view.canMutate &&
      Boolean(view.structureNote) && findBlockById(view.structureRoots, nodeId) !== null,
    canDrop: (request: ContentTreeMoveRequest) =>
      resolveStructureMoveIntent(request, context, identity) !== null,
  }), [view]);

  useEffect(() => {
    setSelectedId(null);
    setMoveContext(null);
    setMoveSource(null);
  }, [view.repositoryId, view.mode, view.structureNoteId]);

  const performMove = (
    request: ContentTreeMoveRequest,
    expected: StructureMoveIdentity,
  ) => {
    const { sourceLine, targetPosition } = requireStructureMoveIntent(
      request,
      context,
      expected,
    );
    view.onMoveStructureBlockWithinNote(sourceLine, targetPosition);
    setSelectedId(null);
  };
  const blockedIds = selectedIds;

  return (
    <ContentTreeDragScope
      onMoveRequest={(request) => runAction(() => performMove(request, identity))}
    >
      <Stack>
        <section aria-label={`笔记结构 · ${view.structureNote?.title ?? "未选择"}`}>
          <Section title={`笔记结构 · ${view.structureNote?.title ?? "未选择"}`}>
            {view.structureNote ? (
              <StructureTree
                ariaLabel="笔记结构操作"
                dragDrop={dragDrop}
                indentUnitCount={view.indentUnitCount}
                nodes={view.structureRoots}
                selectedIds={selectedIds}
                selectedRootId={selectedBlock?.id ?? null}
                selectionMode="collection"
                stateKey={`structure-within:${view.repositoryId}:${view.structureNoteId}`}
                onRequestContextMenu={(nodeId, position) => {
                  setSelectedId(nodeId);
                  setMoveContext({ source: { nodeId, identity }, position });
                }}
                onSelectNode={(node) => setSelectedId(node.id)}
              />
            ) : <EmptyState title="尚未选择笔记。" />}
          </Section>
        </section>
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
          blockedIds={blockedIds}
          nodes={view.structureRoots}
          sourceId={moveSource?.nodeId ?? null}
          targetTreeId={treeId}
          onClose={() => setMoveSource(null)}
          onMove={(target) => {
            if (!moveSource) throw new Error("无法移动结构块：源结构块已失效。");
            performMove({ source: { treeId, nodeId: moveSource.nodeId }, target }, moveSource.identity);
          }}
        />
      </Stack>
    </ContentTreeDragScope>
  );
}
