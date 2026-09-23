import {
  usePageNavigation,
  pageKey,
  describePage,
} from "../../../navigation/index.ts";
import { EmptyState } from "compact-ui";
import { useEffect, useRef, useState } from "react";
import type { NotesViewModel } from "../../../../application/workspace/index.ts";
import { PortableNameValidationError } from "../../../../core/naming/index.ts";
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
import { createNotesTitleEditSession } from "./notesTitleEditSession.ts";

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
  const [editorDraftSource, setEditorDraftSource] = useState<{
    noteId: string;
    source: string;
  } | null>(null);
  const titleSessionRef = useRef<{
    key: string;
    session: ReturnType<typeof createNotesTitleEditSession>;
  } | null>(null);
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
        <EmptyState title="没有活动笔记" />
      </Page>
    );
  }
  const noteKey = `${pages.getRepositoryId()}:${activeNote.id}`;

  if (titleSessionRef.current?.key !== noteKey) {
    const noteId = activeNote.id;
    const updateSource = view.updateSource;
    const synchronize = (source: string) => {
      setEditorSyncSource({ noteId, source });
      setEditorSyncVersion((current) => current + 1);
    };

    titleSessionRef.current = {
      key: noteKey,
      session: createNotesTitleEditSession({
        initialSource: view.editor.documentText,
        titleLineNumber: view.editor.mode === "raw" ? 2 : 1,
        notify: feedback.notify,
        onDraftChange: (source) => setEditorDraftSource((current) => {
          if (source !== null) return { noteId, source };
          return current?.noteId === noteId ? null : current;
        }),
        submit: (change, authoritativeSource, keepEditorDraft) =>
          submitNotesEditorChange({
            authoritativeSource,
            change,
            onNormalized: () =>
              feedback.notify("笔记标题已按可移植名称规则规范化。"),
            onSynchronize: keepEditorDraft ? () => undefined : synchronize,
            runAction: (action) => feedback.runAction(action),
            updateSource: (change) => {
              try {
                return updateSource(change);
              } catch (error) {
                if (error instanceof PortableNameValidationError) {
                  throw Object.assign(
                    new Error("笔记标题只能使用文字、数字、普通空格、连字符和下划线。"),
                    { cause: error },
                  );
                }
                throw error;
              }
            },
          }),
        synchronize,
      }),
    };
  }
  const titleSession = titleSessionRef.current.session;

  titleSession.observeAuthoritativeSource(view.editor.documentText);
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
  const editorValue = editorDraftSource?.noteId === activeNote.id
    ? editorDraftSource.source
    : editorSyncSource?.noteId === activeNote.id
      ? editorSyncSource.source
      : view.editor.documentText;

  return (
    <CtnEditorPanel ariaLabel="笔记编辑">
      <CtnEditor
        {...editorRuntime}
        key={noteKey}
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
        value={editorValue}
        valueSyncVersion={editorSyncVersion}
        onActiveLineChange={(lineNumber, source, isComposing) => {
          view.editor.onActiveLineChange(lineNumber);
          titleSession.onActiveLineChange(lineNumber, source, isComposing);
        }}
        onBlur={titleSession.onBlur}
        readOnly={view.editor.readOnly}
        onChange={titleSession.onChange}
        onConsumeFocusTarget={view.editor.onConsumeFocusTarget}
        onOpenReference={referenceNavigation.openReference}
      />
      {referenceNavigation.picker}
    </CtnEditorPanel>
  );
}
