import { CtnEditor, type CtnEditorFocusTarget } from "../editor/CtnEditor";
import type { CtnDocument, CtnSyntaxProfile } from "../ctn/parseOutline";

export function NoteEditorPanel({
  documentText,
  focusTarget,
  hasActiveNote,
  parsedDocument,
  syntaxProfile,
  title,
  onCreateNote,
  onDocumentTextChange,
}: {
  documentText: string;
  focusTarget: CtnEditorFocusTarget | null;
  hasActiveNote: boolean;
  parsedDocument: CtnDocument;
  syntaxProfile: CtnSyntaxProfile;
  title: string;
  onCreateNote: () => void;
  onDocumentTextChange: (source: string) => void;
}) {
  const lineCount = documentText.split("\n").length;
  const totalBlocks = parsedDocument.blocks.length;
  const outline = parsedDocument.roots;

  return (
    <section className="editor-panel" aria-label="原文编辑">
      <header className="panel-header">
        <div>
          <p className="eyebrow">CTN Source</p>
          <h2>{title}</h2>
        </div>
        <div className="stats">
          <span>{lineCount} 行</span>
          <span>{totalBlocks} 个块</span>
          <span>{outline.length} 个根节点</span>
          <span>{parsedDocument.diagnostics.length} 个诊断</span>
          <span>{syntaxProfile.name}</span>
        </div>
      </header>

      {hasActiveNote ? (
        <CtnEditor
          focusTarget={focusTarget}
          syntaxProfile={syntaxProfile}
          value={documentText}
          onChange={onDocumentTextChange}
        />
      ) : (
        <div className="empty-editor">
          <h3>尚无笔记</h3>
          <button className="primary-action-button" onClick={onCreateNote} type="button">
            新建笔记
          </button>
        </div>
      )}

      {hasActiveNote && parsedDocument.diagnostics.length > 0 ? (
        <section className="diagnostics-panel" aria-label="诊断">
          <h3>诊断</h3>
          <ul>
            {parsedDocument.diagnostics.map((diagnostic) => (
              <li key={diagnostic.id}>
                <span className="diagnostic-location">
                  L{diagnostic.lineNumber}
                </span>
                <span>{diagnostic.message}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
