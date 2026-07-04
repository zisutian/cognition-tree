import { useEffect, useMemo, useState } from "react";
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
import { useSyntaxDraftSession } from "../features/syntax/useSyntaxDraftSession";
import type { FolderId, NoteId } from "../workspace/model/workspaceData";
import {
  createWorkspaceFolder,
  createWorkspaceNote,
  deleteWorkspaceFolder,
  deleteWorkspaceNote,
  moveWorkspaceNote,
  renameWorkspaceFolder,
  selectWorkspaceNote,
  updateActiveWorkspaceNoteSource,
} from "../workspace/actions/workspaceActions";
import {
  createWorkspaceNoteReferenceGraph,
  findActiveWorkspaceNote,
  findWorkspaceFolderIdContainingNote,
  getDefaultWorkspaceFolderId,
  getWorkspaceTree,
  listWorkspaceNotes,
  resolveExistingWorkspaceFolderId,
  resolveParsedWorkspaceNote,
} from "../workspace/queries/workspaceQueries";
import {
  moveWorkspaceBlock,
  type WorkspaceBlockMigrationRequest,
} from "../workspace/actions/blockMigrationActions";
import { useWorkspaceSession } from "./runtime/useWorkspaceSession";

type EditorFocusRequest = {
  lineNumber: number;
  requestId: number;
};

type MoveWorkspaceBlockActionResult =
  | {
      message: string;
      status: "moved";
    }
  | {
      message: string;
      status: "failed";
    };

const emptyNoteReferenceGraph = {
  edges: [],
  nodes: [],
  unresolvedReferences: [],
};

function createLocalFolderId() {
  return `folder-${globalThis.crypto.randomUUID()}`;
}

function createLocalNoteId() {
  return `note-${Date.now()}`;
}

function App() {
  const [activeActivityId, setActiveActivityId] =
    useState<SidebarActivityId>("notes");
  const [editorFocusRequest, setEditorFocusRequest] =
    useState<EditorFocusRequest | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const {
    canChangeRepositoryPath,
    changeRepositoryPath,
    isWorkspaceLoaded,
    reloadWorkspace,
    repositoryPath,
    setWorkspaceData,
    storageLabel,
    syntaxFile,
    updateSyntaxFile,
    workspace,
    workspaceErrorMessage,
    workspaceSaveStatus,
  } = useWorkspaceSession();
  const [selectedFolderId, setSelectedFolderId] =
    useState<FolderId>(getDefaultWorkspaceFolderId);
  const activeNote = findActiveWorkspaceNote(workspace);

  useEffect(() => {
    setSelectedFolderId((currentFolderId) =>
      resolveExistingWorkspaceFolderId(workspace, currentFolderId),
    );
  }, [workspace]);

  const selectNote = (noteId: NoteId) => {
    const folderId = findWorkspaceFolderIdContainingNote(workspace, noteId);

    if (folderId) {
      setSelectedFolderId(folderId);
    }

    setWorkspaceData((current) => selectWorkspaceNote(current, noteId));
  };

  const selectFolder = (folderId: FolderId) => {
    setSelectedFolderId(resolveExistingWorkspaceFolderId(workspace, folderId));
  };

  const createNote = () => {
    const timestamp = new Date().toISOString();
    const noteId = createLocalNoteId();

    setWorkspaceData((current) =>
      createWorkspaceNote(current, {
        folderId: selectedFolderId,
        noteId,
        timestamp,
      }),
    );
  };

  const createFolder = (parentFolderId: FolderId, title: string) => {
    const folderId = createLocalFolderId();

    setWorkspaceData((current) =>
      createWorkspaceFolder(current, {
        folderId,
        parentFolderId,
        title,
      }),
    );
    setSelectedFolderId(folderId);
  };

  const renameFolder = (folderId: FolderId, title: string) => {
    setWorkspaceData((current) =>
      renameWorkspaceFolder(current, folderId, title),
    );
    setSelectedFolderId(folderId);
  };

  const deleteNote = (noteId: NoteId) => {
    setWorkspaceData((current) => deleteWorkspaceNote(current, noteId));
  };

  const deleteFolder = (folderId: FolderId) => {
    setWorkspaceData((current) => deleteWorkspaceFolder(current, folderId));
    setSelectedFolderId(getDefaultWorkspaceFolderId());
  };

  const moveNote = (noteId: NoteId, targetFolderId: FolderId) => {
    setWorkspaceData((current) =>
      moveWorkspaceNote(current, noteId, targetFolderId),
    );
    setSelectedFolderId(targetFolderId);
  };

  const updateActiveNoteSource = (source: string) => {
    const timestamp = new Date().toISOString();

    setWorkspaceData((current) =>
      updateActiveWorkspaceNoteSource(current, source, timestamp),
    );
  };

  const moveNoteBlock = (
    request: WorkspaceBlockMigrationRequest,
  ): MoveWorkspaceBlockActionResult => {
    const result = moveWorkspaceBlock(
      workspace,
      request,
      new Date().toISOString(),
    );

    if (result.status !== "moved") {
      return {
        message: result.message,
        status: "failed",
      };
    }

    setWorkspaceData(result.workspaceData);
    setSelectedFolderId(
      findWorkspaceFolderIdContainingNote(
        result.workspaceData,
        result.targetNoteId,
      ) ??
        selectedFolderId,
    );

    return {
      message: result.message,
      status: "moved",
    };
  };
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
  const effectiveActiveNote = findActiveWorkspaceNote(effectiveWorkspace);
  const parsedWorkspaceNote = useMemo(
    () =>
      resolveParsedWorkspaceNote(effectiveWorkspace, effectiveActiveNote),
    [effectiveActiveNote, effectiveWorkspace],
  );
  const documentText = parsedWorkspaceNote.source;
  const activeSyntaxProfile = parsedWorkspaceNote.profile;
  const parsedDocument = parsedWorkspaceNote.document;
  const noteReferenceGraph = useMemo(
    () =>
      activeActivityId === "visualization"
        ? createWorkspaceNoteReferenceGraph(effectiveWorkspace)
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
        notes={listWorkspaceNotes(workspace)}
        noteTree={getWorkspaceTree(workspace)}
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
