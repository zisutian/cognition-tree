import type { NotesViewModel } from "../../../../application/workspace/notes/edit/notesViewModel";
import {
  DetailPanel,
  PanelBody,
} from "../../../ui/shared/primitives";
import { StructureTree } from "../../../ui/shared/tree";
import { NoteTimeDetails } from "./NoteTimeDetails";

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
    <DetailPanel
      className="note-detail-panel"
      aria-label="笔记详情"
      onCollapse={onCollapseDetail}
      title="结构"
    >
      <PanelBody className="detail-panel-stack" scroll>
        <dl
          aria-label="笔记统计"
          className="detail-summary-strip"
        >
          <div>
            <dd>{view.editor.stats.lineCount}</dd>
            <dt>行</dt>
          </div>
          <div>
            <dd>{view.editor.stats.totalBlocks}</dd>
            <dt>块</dt>
          </div>
          <div>
            <dd>{view.editor.stats.rootCount}</dd>
            <dt>根</dt>
          </div>
        </dl>
        <NoteTimeDetails
          blockMetadata={selectedBlock?.metadata ?? null}
          noteMetadata={view.activeNote}
        />
        {view.editor.mode === "ctn" && view.outline.nodes.length > 0 ? (
          <StructureTree
            indentUnitCount={view.editor.syntax.tabDisplayWidth}
            nodes={view.outline.nodes}
            selectedLineNumbers={selectedLineNumbers}
            onSelectLine={view.outline.onSelectLine}
          />
        ) : (
          <p className="ui-muted">没有可解析结构。</p>
        )}
      </PanelBody>
    </DetailPanel>
  );
}
