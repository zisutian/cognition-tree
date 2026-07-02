import type { CtnDocument } from "../../ctn/parseOutline";
import { CtnEditor, type CtnEditorFocusTarget } from "../../editor/CtnEditor";
import type { CtnSyntaxProfile } from "../../syntax/types";

export function NoteEditorPanel({
  documentText,
  focusTarget,
  hasActiveNote,
  parsedDocument,
  syntaxProfile,
  syntaxIssueMessage,
  currentNoteTitle,
  workspaceErrorMessage,
  onCreateNote,
  onDocumentTextChange,
}: {
  documentText: string;
  focusTarget: CtnEditorFocusTarget | null;
  hasActiveNote: boolean;
  parsedDocument: CtnDocument;
  syntaxProfile: CtnSyntaxProfile | null;
  syntaxIssueMessage: string | null;
  currentNoteTitle: string | null;
  workspaceErrorMessage: string;
  onCreateNote: () => void;
  onDocumentTextChange: (source: string) => void;
}) {
  const lineCount = documentText.split("\n").length;
  const totalBlocks = parsedDocument.blocks.length;
  const outline = parsedDocument.roots;

  return (
    <section className="editor-panel note-editor-panel" aria-label="原文编辑">
      <header className="panel-header">
        <div>
          <h2>笔记编辑</h2>
        </div>
        <div className="stats">
          <span className="current-note-chip">
            {currentNoteTitle ? `当前：${currentNoteTitle}` : "未选择笔记"}
          </span>
          <span>{lineCount} 行</span>
          <span>{totalBlocks} 个块</span>
          <span>{outline.length} 个根节点</span>
          <span>{parsedDocument.diagnostics.length} 个诊断</span>
        </div>
      </header>

      {hasActiveNote && syntaxProfile ? (
        <CtnEditor
          focusTarget={focusTarget}
          syntaxProfile={syntaxProfile}
          value={documentText}
          onChange={onDocumentTextChange}
        />
      ) : hasActiveNote ? (
        <textarea
          className="source-editor-fallback"
          spellCheck={false}
          value={documentText}
          onChange={(event) => onDocumentTextChange(event.target.value)}
        />
      ) : (
        <div className="empty-editor">
          <h3>尚无笔记</h3>
          <button className="primary-action-button" onClick={onCreateNote} type="button">
            新建笔记
          </button>
        </div>
      )}

      {hasActiveNote && syntaxIssueMessage ? (
        <section className="diagnostics-panel" aria-label="语法状态">
          <h3>语法</h3>
          <p>{syntaxIssueMessage}</p>
        </section>
      ) : null}

      {workspaceErrorMessage ? (
        <section className="diagnostics-panel" aria-label="工作区状态">
          <h3>工作区</h3>
          <p>{workspaceErrorMessage}</p>
        </section>
      ) : null}

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
