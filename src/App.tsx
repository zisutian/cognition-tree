import { useMemo, useState } from "react";
import { NoteEditorPanel } from "./components/NoteEditorPanel";
import { NoteOutlinePanel } from "./components/NoteOutlinePanel";
import {
  type SidebarActivityId,
  WorkspaceSidebar,
} from "./components/WorkspaceSidebar";
import { parseCtnDocument, type CtnDocument } from "./ctn/parseOutline";
import {
  resolveNoteSyntaxProfile,
  resolveWorkspaceSyntaxProfile,
} from "./domain/notes";
import { useNoteWorkspace } from "./hooks/useNoteWorkspace";
import "./styles/index.css";

type EditorFocusRequest = {
  lineNumber: number;
  requestId: number;
};

const emptyCtnDocument: CtnDocument = {
  blocks: [],
  diagnostics: [],
  roots: [],
};

function App() {
  const [activeActivityId, setActiveActivityId] =
    useState<SidebarActivityId>("notes");
  const [editorFocusRequest, setEditorFocusRequest] =
    useState<EditorFocusRequest | null>(null);
  const {
    activeNote,
    canChangeRepositoryPath,
    changeRepositoryPath,
    createFolder,
    createNote,
    createSyntaxFile,
    deleteSyntaxFile,
    deleteFolder,
    deleteNote,
    moveNoteBlock,
    moveNote,
    reloadWorkspace,
    repositoryPath,
    renameFolder,
    selectFolder,
    selectNote,
    selectedFolderId,
    storageLabel,
    syntaxFiles,
    updateActiveNoteSource,
    updateActiveNoteSyntaxProfile,
    updateSyntaxFile,
    workspace,
  } = useNoteWorkspace();
  const documentText = activeNote?.source ?? "";
  const activeSyntaxProfileResolution = useMemo(
    () =>
      activeNote
        ? resolveNoteSyntaxProfile(workspace, activeNote)
        : resolveWorkspaceSyntaxProfile(workspace),
    [activeNote, workspace],
  );
  const activeSyntaxProfile =
    activeSyntaxProfileResolution.status === "resolved"
      ? activeSyntaxProfileResolution.profile
      : null;
  const syntaxIssueMessage =
    activeSyntaxProfileResolution.status === "missing-profile"
      ? activeSyntaxProfileResolution.message
      : null;
  const parsedDocument = useMemo(
    () => {
      if (!activeSyntaxProfile) {
        return emptyCtnDocument;
      }

      return parseCtnDocument(documentText, {
        syntaxProfile: activeSyntaxProfile,
      });
    },
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
        syntaxProfiles={workspace.syntaxProfiles}
        syntaxFiles={syntaxFiles}
        totalBlocks={parsedDocument.blocks.length}
        onActivityChange={setActiveActivityId}
        canChangeRepositoryPath={canChangeRepositoryPath}
        onChangeRepositoryPath={changeRepositoryPath}
        onCreateFolder={createFolder}
        onCreateNote={createNote}
        onCreateSyntaxFile={createSyntaxFile}
        onDeleteSyntaxFile={deleteSyntaxFile}
        onDeleteFolder={deleteFolder}
        onDeleteNote={deleteNote}
        onMoveNoteBlock={moveNoteBlock}
        onMoveNote={moveNote}
        onReloadWorkspace={reloadWorkspace}
        onRenameFolder={renameFolder}
        onSelectFolder={selectFolder}
        onSelectLine={focusEditorLine}
        onSelectNote={selectNote}
        onUpdateSyntaxFile={updateSyntaxFile}
      />

      <NoteEditorPanel
        documentText={documentText}
        focusTarget={editorFocusRequest}
        hasActiveNote={Boolean(activeNote)}
        parsedDocument={parsedDocument}
        syntaxProfile={activeSyntaxProfile}
        syntaxIssueMessage={syntaxIssueMessage}
        syntaxProfiles={workspace.syntaxProfiles}
        title={activeNote?.title ?? "本地笔记库"}
        onCreateNote={createNote}
        onDocumentTextChange={updateActiveNoteSource}
        onSyntaxProfileChange={updateActiveNoteSyntaxProfile}
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
