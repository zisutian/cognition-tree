import { useMemo, useState } from "react";
import { NoteEditorPanel } from "./components/NoteEditorPanel";
import { NoteOutlinePanel } from "./components/NoteOutlinePanel";
import {
  type SidebarActivityId,
  WorkspaceSidebar,
} from "./components/WorkspaceSidebar";
import { defaultCtnSyntaxProfile, parseCtnDocument } from "./ctn/parseOutline";
import {
  resolveNoteSyntaxProfile,
  resolveWorkspaceSyntaxProfile,
} from "./domain/notes";
import { useNoteWorkspace } from "./hooks/useNoteWorkspace";
import "./App.css";

type EditorFocusRequest = {
  lineNumber: number;
  requestId: number;
};

function App() {
  const [activeActivityId, setActiveActivityId] =
    useState<SidebarActivityId>("notes");
  const [editorFocusRequest, setEditorFocusRequest] =
    useState<EditorFocusRequest | null>(null);
  const {
    activeNote,
    changeRepositoryPath,
    createNote,
    deleteNote,
    reloadWorkspace,
    repositoryPath,
    selectFolder,
    selectNote,
    selectedFolderId,
    storageLabel,
    updateActiveNoteSource,
    workspace,
  } = useNoteWorkspace();
  const documentText = activeNote?.source ?? "";
  const activeSyntaxProfile = useMemo(
    () =>
      activeNote
        ? resolveNoteSyntaxProfile(workspace, activeNote)
        : (resolveWorkspaceSyntaxProfile(workspace) ?? defaultCtnSyntaxProfile),
    [activeNote, workspace],
  );
  const parsedDocument = useMemo(
    () =>
      parseCtnDocument(documentText, {
        syntaxProfile: activeSyntaxProfile,
      }),
    [activeSyntaxProfile, documentText],
  );
  const focusEditorLine = (lineNumber: number) => {
    setEditorFocusRequest((current) => ({
      lineNumber,
      requestId: (current?.requestId ?? 0) + 1,
    }));
  };

  return (
    <main className="app-shell">
      <WorkspaceSidebar
        activeActivityId={activeActivityId}
        activeFolderId={selectedFolderId}
        activeNoteId={activeNote?.id ?? null}
        diagnosticsCount={parsedDocument.diagnostics.length}
        notes={workspace.notes}
        noteTree={workspace.tree}
        outline={parsedDocument.roots}
        repositoryPath={repositoryPath}
        storageLabel={storageLabel}
        totalBlocks={parsedDocument.blocks.length}
        onActivityChange={setActiveActivityId}
        onChangeRepositoryPath={changeRepositoryPath}
        onCreateNote={createNote}
        onDeleteNote={deleteNote}
        onReloadWorkspace={reloadWorkspace}
        onSelectFolder={selectFolder}
        onSelectLine={focusEditorLine}
        onSelectNote={selectNote}
      />

      <NoteEditorPanel
        documentText={documentText}
        focusTarget={editorFocusRequest}
        hasActiveNote={Boolean(activeNote)}
        parsedDocument={parsedDocument}
        syntaxProfile={activeSyntaxProfile}
        title={activeNote?.title ?? "本地笔记库"}
        onCreateNote={createNote}
        onDocumentTextChange={updateActiveNoteSource}
      />

      <NoteOutlinePanel
        diagnosticsCount={parsedDocument.diagnostics.length}
        nodes={parsedDocument.roots}
        totalBlocks={parsedDocument.blocks.length}
        onSelectLine={focusEditorLine}
      />
    </main>
  );
}

export default App;
