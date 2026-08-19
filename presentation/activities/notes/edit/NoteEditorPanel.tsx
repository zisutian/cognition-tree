import { Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { NotesViewModel } from "../../../../application/workspace/notes/edit/notesViewModel";
import { CtnEditor } from "../../../editor/CtnEditor";
import { rawCtnEditorTabDisplayWidth } from "../../../editor/ctnEditorRuntime";
import {
  Button,
  EmptyState,
  Panel,
  PanelHeader,
} from "../../../ui/shared/primitives";
import { useFeedback } from "../../../ui/shared/FeedbackProvider";
import { useReferenceNavigation } from "../../../ui/shared/useReferenceNavigation";

export function submitNotesEditorChange({
  authoritativeSource,
  change,
  onNormalized,
  onSynchronize,
  runAction,
  updateSource,
}: {
  authoritativeSource: string;
  change: Parameters<NotesViewModel["updateSource"]>[0];
  onNormalized: () => void;
  onSynchronize: (source: string) => void;
  runAction: (
    action: () => ReturnType<NotesViewModel["updateSource"]>,
  ) => ReturnType<NotesViewModel["updateSource"]> | undefined;
  updateSource: NotesViewModel["updateSource"];
}) {
  const result = runAction(() => updateSource(change));

  if (result?.titleNormalized) {
    onNormalized();
  }

  if (!result || result.authoritativeSource !== change.source) {
    onSynchronize(result?.authoritativeSource ?? authoritativeSource);
  }

  return result;
}

export function NoteEditorPanel({
  focusMode,
  onToggleFocusMode,
  view,
}: {
  focusMode: boolean;
  onToggleFocusMode: () => void;
  view: NotesViewModel;
}) {
  const feedback = useFeedback();
  const [editorSyncSource, setEditorSyncSource] = useState<{
    noteId: string;
    source: string;
  } | null>(null);
  const [editorSyncVersion, setEditorSyncVersion] = useState(0);
  const referenceNavigation = useReferenceNavigation(
    view.referenceNavigation,
  );
  const activeNote = view.activeNote;

  useEffect(() => {
    if (
      editorSyncSource &&
      (!activeNote ||
        editorSyncSource.noteId !== activeNote.id ||
        editorSyncSource.source === view.editor.documentText)
    ) {
      setEditorSyncSource(null);
    }
  }, [activeNote, editorSyncSource, view.editor.documentText]);

  if (!activeNote) {
    return (
      <Panel className="note-editor-panel" aria-label="笔记编辑">
        <EmptyState
          action={
            <Button onClick={view.directory.createNote} type="button" variant="primary">
              新建笔记
            </Button>
          }
          description="从左侧目录选择或创建笔记。"
          title="没有活动笔记"
        />
      </Panel>
    );
  }
  const editorRuntime = view.editor.mode === "raw"
    ? {
        contentMode: { kind: "raw" as const },
        syntax: null,
        tabDisplayWidth: rawCtnEditorTabDisplayWidth,
      }
    : {
        contentMode: { kind: "document" as const },
        syntax: view.editor.syntax,
      };

  return (
    <Panel className="note-editor-panel" aria-label="笔记编辑">
      <PanelHeader
        title={activeNote.title}
        actions={
          <Button
            aria-label={focusMode ? "退出专注模式" : "进入专注模式"}
            onClick={onToggleFocusMode}
            title={focusMode ? "退出专注模式" : "进入专注模式"}
            type="button"
            variant="icon"
          >
            {focusMode ? (
              <Minimize2 aria-hidden="true" size={14} />
            ) : (
              <Maximize2 aria-hidden="true" size={14} />
            )}
          </Button>
        }
      />
      <CtnEditor
        {...editorRuntime}
        key={activeNote.id}
        focusTarget={view.editor.focusTarget}
        value={editorSyncSource?.noteId === activeNote.id
          ? editorSyncSource.source
          : view.editor.documentText}
        valueSyncVersion={editorSyncVersion}
        onActiveLineChange={view.editor.onActiveLineChange}
        onChange={(change) => {
          submitNotesEditorChange({
            authoritativeSource: view.editor.documentText,
            change,
            onNormalized: () => feedback.notify(
              "笔记标题已按可移植名称规则规范化。",
            ),
            onSynchronize: (source) => {
              setEditorSyncSource({ noteId: activeNote.id, source });
              setEditorSyncVersion((current) => current + 1);
            },
            runAction: (action) => feedback.runAction(action),
            updateSource: view.updateSource,
          });
        }}
        onConsumeFocusTarget={view.editor.onConsumeFocusTarget}
        onOpenReference={referenceNavigation.openReference}
      />
      {referenceNavigation.picker}
    </Panel>
  );
}
