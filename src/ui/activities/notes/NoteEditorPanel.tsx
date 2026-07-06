import {
  CtnEditor,
  type CtnEditorFocusTarget,
  type CtnEditorSyntaxProfile,
} from "../../../editor/CtnEditor";
import type { UiEditorDiagnostic } from "../../../application/workspace/viewTypes";

export function NoteEditorPanel({
  diagnostics,
  focusTarget,
  hasActiveNote,
  lineCount,
  rootCount,
  syntaxProfile,
  currentNoteTitle,
  totalBlocks,
  totalDiagnostics,
  value,
  errorMessage,
  onCreateNote,
  onDocumentTextChange,
}: {
  diagnostics: UiEditorDiagnostic[];
  focusTarget: CtnEditorFocusTarget | null;
  hasActiveNote: boolean;
  lineCount: number;
  rootCount: number;
  syntaxProfile: CtnEditorSyntaxProfile;
  currentNoteTitle: string | null;
  totalBlocks: number;
  totalDiagnostics: number;
  value: string;
  errorMessage: string;
  onCreateNote: () => void;
  onDocumentTextChange: (source: string) => void;
}) {
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
          <span>{rootCount} 个根节点</span>
          <span>{totalDiagnostics} 个诊断</span>
        </div>
      </header>

      {hasActiveNote ? (
        <CtnEditor
          focusTarget={focusTarget}
          syntaxProfile={syntaxProfile}
          value={value}
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

      {errorMessage ? (
        <section className="diagnostics-panel" aria-label="工作区状态">
          <h3>工作区</h3>
          <p>{errorMessage}</p>
        </section>
      ) : null}

      {hasActiveNote && diagnostics.length > 0 ? (
        <section className="diagnostics-panel" aria-label="诊断">
          <h3>诊断</h3>
          <ul>
            {diagnostics.map((diagnostic) => (
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
