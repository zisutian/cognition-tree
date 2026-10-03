import { Button, ContextMenu, EmptyState, Section, Stack, Toolbar, TreeDragScope } from "compact-ui";
import { ArrowLeftRight } from "lucide-react";
import type { StructureOperationActivityViewModel } from "../../../../application/workspace/index.ts";
import { StructureTree, createClassNames } from "../../../ui/index.ts";
import { StructureBlockMoveQuickPick } from "./StructureBlockMoveQuickPick.tsx";
import { findBlockById, useStructureBlockSelection } from "./structureOperationBlocks.ts";
import { structureContentKey, type StructureMoveContext } from "./structureMoveIntent.ts";
import { useStructureMoveInteraction } from "./useStructureMoveInteraction.ts";
import structureStyles from "./structure.module.css";

const cx = createClassNames(structureStyles);
const sourceTreeId = "structure-source";
const targetTreeId = "structure-target";
export function StructureOperationPairView({ view }: { view: StructureOperationActivityViewModel }) {
  const { selectedIds, setSelectedIds } = useStructureBlockSelection(view.sourceRoots);
  const sourceKey = structureContentKey(view.repositoryId, view.sourceNote?.id ?? null);
  const targetKey = structureContentKey(view.repositoryId, view.targetNote?.id ?? null);
  const canMove = view.canMutate && !!view.sourceNote && !!view.targetNote && view.sourceNote.id !== view.targetNote.id;
  const context: StructureMoveContext = {
    repositoryId: view.repositoryId, canMutate: canMove,
    sourceNoteId: view.sourceNote?.id ?? null, targetNoteId: view.targetNote?.id ?? null,
    sourceRoots: view.sourceRoots, targetRoots: view.targetRoots, sourceTreeId, targetTreeId,
  };
  const move = useStructureMoveInteraction(context, view.onMoveStructureBlockBetweenNotes, () => setSelectedIds(new Set()));
  return <TreeDragScope ref={move.scopeRef} onMoveRequest={move.performMove}>
    <Stack>
      <Toolbar aria-label="结构迁移操作">
        <Button aria-label="交换源笔记和目标笔记" disabled={!view.sourceNote || !view.targetNote || view.sourceNote.id === view.targetNote.id}
          onClick={view.onSwapSourceAndTargetNotes} title="交换源笔记和目标笔记" type="button" iconOnly>
          <ArrowLeftRight aria-hidden="true" size={14} />
        </Button>
        <Button type="button" appearance="plain" disabled={!canMove || selectedIds.size === 0}
          onClick={move.beginMove}>移动选中项…</Button>
      </Toolbar>
      <Stack direction="row" wrap align="start">
        <section className={cx("structure-operation-column")} aria-label={`源笔记 · ${view.sourceNote?.title ?? "未选择"}`}>
          <Section title={`源笔记 · ${view.sourceNote?.title ?? "未选择"}`}>
            {view.sourceRoots.length > 0 ? <StructureTree ariaLabel="源笔记结构"
              dragDrop={{ treeId: sourceTreeId, contentKey: sourceKey,
                canDrag: (id) => canMove && findBlockById(view.sourceRoots, id) !== null,
              }} indentUnitCount={view.indentUnitCount} nodes={view.sourceRoots}
              selectedIds={selectedIds} onSelectionChange={setSelectedIds} selectionMode="multiple"
              stateKey={sourceKey} onRequestContextMenu={move.openMenu}
            /> : <EmptyState title="源笔记没有可移动块。" />}
          </Section>
        </section>
        <section className={cx("structure-operation-column")} aria-label={`目标笔记 · ${view.targetNote?.title ?? "未选择"}`}>
          <Section title={`目标笔记 · ${view.targetNote?.title ?? "未选择"}`}>
            {view.targetNote ? <StructureTree ariaLabel="目标笔记结构"
              dragDrop={{ treeId: targetTreeId, contentKey: targetKey, endDropLabel: "文末根块", canDrop: move.canDrop }}
              indentUnitCount={view.indentUnitCount} nodes={view.targetRoots}
              selectionMode="none" stateKey={targetKey}
            /> : <EmptyState title="尚未选择目标笔记。" />}
          </Section>
        </section>
      </Stack>
      {move.menu && <ContextMenu aria-label="结构块操作" position={move.menu.position}
        items={[{ id: "move-to", label: "移动到…", disabled: !move.menu.moveSession, onSelect: move.openPickerFromMenu }]}
        onClose={move.closeMenu} />}
      <StructureBlockMoveQuickPick nodes={view.targetRoots}
        session={move.pickerSession} targetTreeId={targetTreeId} targetContentKey={targetKey}
        canDrop={move.canDrop} onClose={move.closePicker} onMove={move.requestMove} />
    </Stack>
  </TreeDragScope>;
}
