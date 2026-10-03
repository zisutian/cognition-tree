import { Button, ContextMenu, EmptyState, Section, Stack, Toolbar, TreeDragScope } from "compact-ui";
import type { StructureOperationActivityViewModel } from "../../../../application/workspace/index.ts";
import { StructureTree } from "../../../ui/index.ts";
import { StructureBlockMoveQuickPick } from "./StructureBlockMoveQuickPick.tsx";
import { findBlockById, useStructureBlockSelection } from "./structureOperationBlocks.ts";
import { structureContentKey, type StructureMoveContext } from "./structureMoveIntent.ts";
import { useStructureMoveInteraction } from "./useStructureMoveInteraction.ts";

const treeId = "structure-within";
export function StructureOperationStructureView({ view }: { view: StructureOperationActivityViewModel }) {
  const { selectedIds, setSelectedIds } = useStructureBlockSelection(view.structureRoots);
  const contentKey = structureContentKey(view.repositoryId, view.structureNote?.id ?? null);
  const context: StructureMoveContext = {
    repositoryId: view.repositoryId, canMutate: view.canMutate,
    sourceNoteId: view.structureNote?.id ?? null, targetNoteId: view.structureNote?.id ?? null,
    sourceRoots: view.structureRoots, targetRoots: view.structureRoots,
    sourceTreeId: treeId, targetTreeId: treeId,
  };
  const move = useStructureMoveInteraction(context, view.onMoveStructureBlockWithinNote, () => setSelectedIds(new Set()));
  return <TreeDragScope ref={move.scopeRef} onMoveRequest={move.performMove}>
    <Stack>
      <Toolbar aria-label="结构移动操作">
        <Button type="button" appearance="plain" disabled={!view.canMutate || !view.structureNote || selectedIds.size === 0}
          onClick={move.beginMove}>移动选中项…</Button>
      </Toolbar>
      <section aria-label={`笔记结构 · ${view.structureNote?.title ?? "未选择"}`}>
        <Section title={`笔记结构 · ${view.structureNote?.title ?? "未选择"}`}>
          {view.structureNote ? <StructureTree ariaLabel="笔记结构操作"
            dragDrop={{ treeId, contentKey, endDropLabel: "文末根块",
              canDrag: (id) => view.canMutate && findBlockById(view.structureRoots, id) !== null,
              canDrop: move.canDrop,
            }}
            indentUnitCount={view.indentUnitCount} nodes={view.structureRoots}
            selectedIds={selectedIds} onSelectionChange={setSelectedIds} selectionMode="multiple"
            stateKey={contentKey} onRequestContextMenu={move.openMenu}
          /> : <EmptyState title="尚未选择笔记。" />}
        </Section>
      </section>
      {move.menu && <ContextMenu aria-label="结构块操作" position={move.menu.position}
        items={[{ id: "move-to", label: "移动到…", disabled: !move.menu.moveSession, onSelect: move.openPickerFromMenu }]}
        onClose={move.closeMenu} />}
      <StructureBlockMoveQuickPick nodes={view.structureRoots}
        session={move.pickerSession} targetTreeId={treeId} targetContentKey={contentKey}
        canDrop={move.canDrop} onClose={move.closePicker} onMove={move.requestMove} />
    </Stack>
  </TreeDragScope>;
}
