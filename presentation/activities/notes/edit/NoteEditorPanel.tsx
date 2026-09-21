import {
  usePageNavigation,
  pageKey,
  describePage,
} from "../../../navigation/index.ts";
import { Button, EmptyState } from "compact-ui";
import { useEffect, useState } from "react";
import type { NotesViewModel } from "../../../../application/workspace/index.ts";
import {
  CtnEditor,
  CtnEditorPanel,
  rawCtnEditorTabDisplayWidth,
} from "../../../editor/index.ts";

import {
  Page,
  useFeedback,
  useReferenceNavigation,
} from "../../../ui/index.ts";

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

export function NoteEditorPanel({ view }: { view: NotesViewModel }) {
  const feedback = useFeedback();
  const pages = usePageNavigation();
  const [editorSyncSource, setEditorSyncSource] = useState<{
    noteId: string;
    source: string;
  } | null>(null);
  const [editorSyncVersion, setEditorSyncVersion] = useState(0);
  const referenceNavigation = useReferenceNavigation(view.referenceNavigation);
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
      <Page kind="editor" aria-label="笔记编辑">
        <EmptyState
          action={
            <Button
              onClick={() =>
                feedback.runAction(() =>
                  pages.created("notes", view.directory.createNote),
                )
              }
              type="button"
              variant="normal"
            >
              新建笔记
            </Button>
          }
          title="没有活动笔记"
        />
      </Page>
    );
  }
  const editorRuntime =
    view.editor.mode === "raw"
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
    <CtnEditorPanel ariaLabel="笔记编辑">
      <CtnEditor
        {...editorRuntime}
        key={`${pages.getRepositoryId()}:${activeNote.id}`}
        sessionKey={pageKey(
          describePage(
            "notes",
            "note",
            activeNote.id,
            activeNote.title,
            pages.getRepositoryId(),
          ).target,
        )}
        focusTarget={view.editor.focusTarget}
        value={
          editorSyncSource?.noteId === activeNote.id
            ? editorSyncSource.source
            : view.editor.documentText
        }
        valueSyncVersion={editorSyncVersion}
        onActiveLineChange={view.editor.onActiveLineChange}
        readOnly={view.editor.readOnly}
        onChange={(change) => {
          submitNotesEditorChange({
            authoritativeSource: view.editor.documentText,
            change,
            onNormalized: () =>
              feedback.notify("笔记标题已按可移植名称规则规范化。"),
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
    </CtnEditorPanel>
  );
}
