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
  findActiveWorkspaceNote,
  findWorkspaceFolderIdContainingNote,
  getDefaultWorkspaceFolderId,
  getParsedWorkspaceNote,
  getWorkspaceTree,
  getWorkspaceNoteReferenceGraph,
  listWorkspaceNotes,
  resolveExistingWorkspaceFolderId,
} from "../workspace/queries/workspaceQueries";
import { useWorkspaceIndex } from "./runtime/useWorkspaceIndex";
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

function SyntaxSetupPanel({
  onConfigureSyntax,
  onUseDefaultSyntax,
  workspaceErrorMessage,
}: {
  onConfigureSyntax: () => void;
  onUseDefaultSyntax: () => void;
  workspaceErrorMessage: string;
}) {
  return (
    <section
      aria-label="仓库语法未配置"
      className="workspace-main-panel migration-full-width syntax-setup-panel"
    >
      <div className="syntax-setup-empty">
        <h2>仓库语法未配置</h2>
        <p>需要先配置仓库语法，才能解析、编辑和迁移 CTN 笔记。</p>
        <div className="syntax-setup-actions">
          <button
            className="primary-action-button"
            onClick={onConfigureSyntax}
            type="button"
          >
            配置语法
          </button>
          <button
            className="secondary-action-button"
            onClick={onUseDefaultSyntax}
            type="button"
          >
            使用默认配置
          </button>
        </div>
        {workspaceErrorMessage ? (
          <p className="syntax-setup-error">{workspaceErrorMessage}</p>
        ) : null}
      </div>
    </section>
  );
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
    storageLabel,
    defaultSyntaxFile,
    syntaxFile,
    useDefaultSyntaxFile,
    updateSyntaxFile,
    workspaceData,
    workspaceRuntime,
    workspaceCommands,
    workspaceErrorMessage,
    workspaceSaveStatus,
  } = useWorkspaceSession();
  const [selectedFolderId, setSelectedFolderId] =
    useState<FolderId>(getDefaultWorkspaceFolderId);
  const activeNote = findActiveWorkspaceNote(workspaceData);

  useEffect(() => {
    setSelectedFolderId((currentFolderId) =>
      resolveExistingWorkspaceFolderId(workspaceData, currentFolderId),
    );
  }, [workspaceData]);

  const selectNote = (noteId: NoteId) => {
    const folderId = findWorkspaceFolderIdContainingNote(workspaceData, noteId);

    if (folderId) {
      setSelectedFolderId(folderId);
    }

    workspaceCommands.selectNote(noteId);
  };

  const selectFolder = (folderId: FolderId) => {
    setSelectedFolderId(
      resolveExistingWorkspaceFolderId(workspaceData, folderId),
    );
  };

  const createNote = () => {
    const timestamp = new Date().toISOString();
    const noteId = createLocalNoteId();

    workspaceCommands.createNote({
      folderId: selectedFolderId,
      noteId,
      timestamp,
    });
  };

  const createFolder = (parentFolderId: FolderId, title: string) => {
    const folderId = createLocalFolderId();

    workspaceCommands.createFolder({
      folderId,
      parentFolderId,
      title,
    });
    setSelectedFolderId(folderId);
  };

  const renameFolder = (folderId: FolderId, title: string) => {
    workspaceCommands.renameFolder(folderId, title);
    setSelectedFolderId(folderId);
  };

  const deleteNote = (noteId: NoteId) => {
    workspaceCommands.deleteNote(noteId);
  };

  const deleteFolder = (folderId: FolderId) => {
    workspaceCommands.deleteFolder(folderId);
    setSelectedFolderId(getDefaultWorkspaceFolderId());
  };

  const moveNote = (noteId: NoteId, targetFolderId: FolderId) => {
    workspaceCommands.moveNote(noteId, targetFolderId);
    setSelectedFolderId(targetFolderId);
  };

  const updateActiveNoteSource = (source: string) => {
    const timestamp = new Date().toISOString();

    workspaceCommands.updateActiveNoteSource(source, timestamp);
  };

  const {
    effectiveWorkspace,
    syntaxDraft,
    syntaxDraftResult,
    syntaxFeedback,
    updateSyntaxDraft,
  } = useSyntaxDraftSession({
    isWorkspaceLoaded,
    syntaxProfile: syntaxFile?.profile ?? defaultSyntaxFile.profile,
    updateSyntaxFile,
    workspace: workspaceRuntime,
  });
  const workspaceSaveStatusLabel = {
    error: "保存失败",
    idle: "等待保存",
    saved: "已保存",
    saving: "保存中",
  }[workspaceSaveStatus];
  const effectiveActiveNote = effectiveWorkspace
    ? findActiveWorkspaceNote(effectiveWorkspace)
    : null;
  const workspaceIndex = useWorkspaceIndex(effectiveWorkspace);
  const parsedWorkspaceNote = useMemo(
    () =>
      workspaceIndex
        ? getParsedWorkspaceNote(workspaceIndex, effectiveActiveNote?.id ?? null)
        : null,
    [effectiveActiveNote, workspaceIndex],
  );
  const documentText = parsedWorkspaceNote?.source ?? "";
  const activeSyntaxProfile =
    parsedWorkspaceNote?.profile ?? defaultSyntaxFile.profile;
  const parsedDocument = parsedWorkspaceNote?.document ?? null;
  const noteReferenceGraph = useMemo(
    () =>
      activeActivityId === "visualization" && workspaceIndex
        ? getWorkspaceNoteReferenceGraph(workspaceIndex)
        : emptyNoteReferenceGraph,
    [activeActivityId, workspaceIndex],
  );
  const moveNoteBlock = (
    request: Parameters<typeof workspaceCommands.moveBlock>[1],
  ): MoveWorkspaceBlockActionResult => {
    if (!workspaceIndex || !effectiveWorkspace) {
      return {
        message: "需要先配置仓库语法。",
        status: "failed",
      };
    }

    const result = workspaceCommands.moveBlock(
      workspaceIndex,
      request,
      new Date().toISOString(),
    );

    if (result.status !== "moved") {
      return {
        message: result.message,
        status: "failed",
      };
    }

    setSelectedFolderId(
      findWorkspaceFolderIdContainingNote(
        effectiveWorkspace,
        result.targetNoteId,
      ) ??
        selectedFolderId,
    );

    return {
      message: result.message,
      status: "moved",
    };
  };

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
  const configureSyntax = () => {
    setActiveActivityId("syntax");
    setSidebarCollapsed(false);
  };
  const useDefaultSyntax = () => {
    void useDefaultSyntaxFile();
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

    if (!syntaxFile || !effectiveWorkspace || !workspaceIndex) {
      return (
        <SyntaxSetupPanel
          workspaceErrorMessage={workspaceErrorMessage}
          onConfigureSyntax={configureSyntax}
          onUseDefaultSyntax={useDefaultSyntax}
        />
      );
    }

    if (activeActivityId === "migration") {
      return (
        <BlockMigrationWorkspacePanel
          activeNoteId={effectiveActiveNote?.id ?? null}
          onMoveNoteBlock={moveNoteBlock}
          workspace={effectiveWorkspace}
          workspaceIndex={workspaceIndex}
        />
      );
    }

    if (activeActivityId === "visualization") {
      return <NoteReferenceGraphPanel graph={noteReferenceGraph} />;
    }

    if (!parsedDocument) {
      return (
        <SyntaxSetupPanel
          workspaceErrorMessage={workspaceErrorMessage}
          onConfigureSyntax={configureSyntax}
          onUseDefaultSyntax={useDefaultSyntax}
        />
      );
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

    if (
      activeActivityId === "migration" ||
      !syntaxFile ||
      !workspaceIndex ||
      !parsedDocument
    ) {
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
        notes={listWorkspaceNotes(workspaceData)}
        noteTree={getWorkspaceTree(workspaceData)}
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
