import type { NotesViewModel } from "../../../../application/workspace/index.ts";
import { CtnDocumentDetailPanel } from "../../../editor/index.ts";

export function NoteDetailPanel({
  repositoryId,
  view,
}: {
  repositoryId: string;
  view: NotesViewModel;
}) {
  if (!view.activeNote) {
    return null;
  }

  const selectedBlock = view.outline.activeBlock;

  return (
    <CtnDocumentDetailPanel
      blockMetadata={selectedBlock?.metadata ?? null}
      documentLabel="笔记"
      documentMetadata={view.activeNote}
      stats={view.editor.stats}
      structure={
        view.editor.mode === "ctn"
          ? {
              ariaLabel: "笔记结构",
              indentUnitCount: view.editor.syntax.tabDisplayWidth,
              nodes: view.outline.nodes,
              onSelectionChange: (ids) => {
                const id = [...ids][0];
                const pending = [...view.outline.nodes];
                while (pending.length) {
                  const node = pending.pop()!;
                  if (node.id === id) { view.outline.onSelectLine(node.lineNumber); break; }
                  pending.push(...node.children);
                }
              },
              selectedIds: new Set(selectedBlock ? [selectedBlock.id] : []),
              selectionMode: "single",
              stateKey: `note:${repositoryId}:${view.activeNote.id}`,
            }
          : null
      }
    />
  );
}
