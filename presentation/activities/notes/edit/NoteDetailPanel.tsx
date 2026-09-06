import type { NotesViewModel } from "../../../../application/workspace/index.ts";
import { CtnDocumentDetailPanel } from "../../../editor/index.ts";

export function NoteDetailPanel({
  onCollapseDetail,
  view,
}: {
  onCollapseDetail: () => void;
  view: NotesViewModel;
}) {
  if (!view.activeNote) {
    return null;
  }

  const selectedBlock = view.outline.activeBlock;
  const selectedLineNumbers = selectedBlock
    ? new Set([selectedBlock.lineNumber])
    : undefined;

  return (
    <CtnDocumentDetailPanel
      blockMetadata={selectedBlock?.metadata ?? null}
      documentLabel="笔记"
      documentMetadata={view.activeNote}
      onCollapseDetail={onCollapseDetail}
      stats={view.editor.stats}
      structure={view.editor.mode === "ctn"
        ? {
            indentUnitCount: view.editor.syntax.tabDisplayWidth,
            nodes: view.outline.nodes,
            onSelectLine: view.outline.onSelectLine,
            selectedLineNumbers,
          }
        : null}
    />
  );
}
