import {
  CtnEditor,
  type CtnEditorFocusTarget,
  type CtnEditorSyntaxProfile,
} from "../../../editor/CtnEditor";
import type { UiEditorDiagnostic } from "../../../application/workspace/projection/viewEditor";
import {
  UiButton,
  UiEmptyState,
  UiList,
  UiListRow,
  UiPanel,
  UiPanelHeader,
  UiStatus,
} from "../../shared/primitives";

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
    <UiPanel className="note-editor-panel" aria-label="原文编辑" variant="editor">
      <UiPanelHeader
        stats={[
          <span className="current-note-chip" key="current">
            {currentNoteTitle ? `当前：${currentNoteTitle}` : "未选择笔记"}
          </span>,
          `${lineCount} 行`,
          `${totalBlocks} 个块`,
          `${rootCount} 个根节点`,
          `${totalDiagnostics} 个诊断`,
        ]}
        title="笔记编辑"
      />

      {hasActiveNote ? (
        <CtnEditor
          focusTarget={focusTarget}
          syntaxProfile={syntaxProfile}
          value={value}
          onChange={onDocumentTextChange}
        />
      ) : (
        <UiEmptyState
          actions={
            <UiButton onClick={onCreateNote} type="button" variant="primary">
              新建笔记
            </UiButton>
          }
          fill
          title="尚无笔记"
        />
      )}

      {errorMessage ? (
        <UiStatus aria-label="工作区状态" tone="error">
          <p>{errorMessage}</p>
        </UiStatus>
      ) : null}

      {hasActiveNote && diagnostics.length > 0 ? (
        <UiStatus aria-label="诊断" tone="error">
          <p>诊断</p>
          <UiList variant="diagnostic">
            {diagnostics.map((diagnostic) => (
              <UiListRow className="note-diagnostic-row" key={diagnostic.id}>
                <span>L{diagnostic.lineNumber}</span>
                <span>{diagnostic.message}</span>
              </UiListRow>
            ))}
          </UiList>
        </UiStatus>
      ) : null}
    </UiPanel>
  );
}
