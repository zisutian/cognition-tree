import { useMemo, useState } from "react";
import { BlockMigrationWorkspacePanel } from "../features/migration/BlockMigrationWorkspacePanel";
import { NoteEditorPanel } from "../features/notes/NoteEditorPanel";
import { NoteOutlinePanel } from "../features/notes/NoteOutlinePanel";
import { SyntaxProfileDetailPanel } from "../features/syntax/SyntaxProfileDetailPanel";
import { SyntaxWorkspacePanel } from "../features/syntax/SyntaxWorkspacePanel";
import { NoteReferenceGraphDetailPanel } from "../features/visualization/NoteReferenceGraphDetailPanel";
import { NoteReferenceGraphPanel } from "../features/visualization/NoteReferenceGraphPanel";
import {
  type SidebarActivityId,
  WorkspaceSidebar,
} from "../shell/WorkspaceSidebar";
import "../styles/index.css";
import { createNoteReferenceGraph } from "../workspace/view-model/noteReferenceGraph";
import { resolveParsedNoteView } from "../workspace/view-model/parsedNoteView";
import { useWorkspaceController } from "../workspace/commands/useWorkspaceController";
import { useSyntaxDraftSession } from "../features/syntax/useSyntaxDraftSession";

type EditorFocusRequest = {
  lineNumber: number;
  requestId: number;
};

const emptyNoteReferenceGraph = {
  edges: [],
  nodes: [],
  unresolvedReferences: [],
};

function App() {
  const [activeActivityId, setActiveActivityId] =
    useState<SidebarActivityId>("notes");
  const [editorFocusRequest, setEditorFocusRequest] =
    useState<EditorFocusRequest | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const {
    activeNote,
    canChangeRepositoryPath,
    changeRepositoryPath,
    createFolder,
    createNote,
    deleteFolder,
    deleteNote,
    isWorkspaceLoaded,
    moveNoteBlock,
    moveNote,
    reloadWorkspace,
    repositoryPath,
    renameFolder,
    selectFolder,
    selectNote,
    selectedFolderId,
    storageLabel,
    syntaxFile,
    updateActiveNoteSource,
    updateSyntaxFile,
    workspace,
    workspaceErrorMessage,
    workspaceSaveStatus,
  } = useWorkspaceController();
  const {
    effectiveWorkspace,
    syntaxDraft,
    syntaxDraftResult,
    syntaxFeedback,
    updateSyntaxDraft,
  } = useSyntaxDraftSession({
    isWorkspaceLoaded,
    syntaxProfile: syntaxFile.profile,
    updateSyntaxFile,
    workspace,
  });
  const workspaceSaveStatusLabel = {
    error: "保存失败",
    idle: "等待保存",
    saved: "已保存",
    saving: "保存中",
  }[workspaceSaveStatus];
  const effectiveActiveNote =
    effectiveWorkspace.notes.find(
      (note) => note.id === effectiveWorkspace.activeNoteId,
    ) ?? null;
  const parsedNoteView = useMemo(
    () => resolveParsedNoteView(effectiveWorkspace, effectiveActiveNote),
    [effectiveActiveNote, effectiveWorkspace],
  );
  const documentText = parsedNoteView.source;
  const activeSyntaxProfile = parsedNoteView.profile;
  const parsedDocument = parsedNoteView.document;
  const noteReferenceGraph = useMemo(
    () =>
      activeActivityId === "visualization"
        ? createNoteReferenceGraph(effectiveWorkspace)
        : emptyNoteReferenceGraph,
    [activeActivityId, effectiveWorkspace],
  );

  const handleActivityChange = (activityId: SidebarActivityId) => {
    if (activityId === activeActivityId) {
      setSidebarCollapsed((v) => !v);
      return;
    }

    setActiveActivityId(activityId);
    setSidebarCollapsed(false);
  };

  const focusEditorLine = (lineNumber: number) => {
    setEditorFocusRequest((current) => ({
      lineNumber,
      requestId: (current?.requestId ?? 0) + 1,
    }));
  };
  const appShellClassName = [
    "app-shell",
    `activity-${activeActivityId}`,
    sidebarCollapsed ? "sidebar-collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const renderMainWorkspace = () => {
    if (activeActivityId === "syntax") {
      return (
        <SyntaxWorkspacePanel
          draft={syntaxDraft}
          onDraftChange={updateSyntaxDraft}
        />
      );
    }

    if (activeActivityId === "migration") {
      return (
        <BlockMigrationWorkspacePanel
          activeNoteId={effectiveActiveNote?.id ?? null}
          onMoveNoteBlock={moveNoteBlock}
          workspace={effectiveWorkspace}
        />
      );
    }

    if (activeActivityId === "visualization") {
      return <NoteReferenceGraphPanel graph={noteReferenceGraph} />;
    }

    return (
      <NoteEditorPanel
        currentNoteTitle={activeNote?.title ?? null}
        documentText={documentText}
        focusTarget={editorFocusRequest}
        hasActiveNote={Boolean(activeNote)}
        parsedDocument={parsedDocument}
        syntaxProfile={activeSyntaxProfile}
        workspaceErrorMessage={workspaceErrorMessage}
        onCreateNote={createNote}
        onDocumentTextChange={updateActiveNoteSource}
      />
    );
  };
  const renderDetailWorkspace = () => {
    if (activeActivityId === "syntax") {
      return (
        <SyntaxProfileDetailPanel
          draftResult={syntaxDraftResult}
          feedback={syntaxFeedback}
        />
      );
    }

    if (activeActivityId === "migration") {
      return null;
    }

    if (activeActivityId === "visualization") {
      return (
        <NoteReferenceGraphDetailPanel
          graph={noteReferenceGraph}
        />
      );
    }

    return (
      <NoteOutlinePanel
        nodes={parsedDocument.roots}
        onSelectLine={focusEditorLine}
      />
    );
  };

  return (
    <main className={appShellClassName}>
      <WorkspaceSidebar
        activeActivityId={activeActivityId}
        activeFolderId={selectedFolderId}
        activeNoteId={activeNote?.id ?? null}
        notes={workspace.notes}
        noteTree={workspace.tree}
        repositoryPath={repositoryPath}
        saveStatusLabel={workspaceSaveStatusLabel}
        storageLabel={storageLabel}
        onActivityChange={handleActivityChange}
        canChangeRepositoryPath={canChangeRepositoryPath}
        onChangeRepositoryPath={changeRepositoryPath}
        onCreateFolder={createFolder}
        onCreateNote={createNote}
        onDeleteFolder={deleteFolder}
        onDeleteNote={deleteNote}
        onMoveNote={moveNote}
        onReloadWorkspace={reloadWorkspace}
        onRenameFolder={renameFolder}
        onSelectFolder={selectFolder}
        onSelectNote={selectNote}
      />

      {renderMainWorkspace()}
      {renderDetailWorkspace()}
    </main>
  );
}

export default App;
