import { useEffect, useMemo, useState } from "react";
import {
  BlockMigrationStatusPanel,
  type BlockMigrationPanelStatus,
} from "../features/migration/BlockMigrationStatusPanel";
import { BlockMigrationWorkspacePanel } from "../features/migration/BlockMigrationWorkspacePanel";
import { NoteEditorPanel } from "../features/notes/NoteEditorPanel";
import { NoteOutlinePanel } from "../features/notes/NoteOutlinePanel";
import {
  SyntaxProfileDetailPanel,
  type WorkspaceFeedback,
} from "../features/syntax/SyntaxProfileDetailPanel";
import { SyntaxWorkspacePanel } from "../features/syntax/SyntaxWorkspacePanel";
import { NoteReferenceGraphDetailPanel } from "../features/visualization/NoteReferenceGraphDetailPanel";
import { NoteReferenceGraphPanel } from "../features/visualization/NoteReferenceGraphPanel";
import {
  type SidebarActivityId,
  WorkspaceSidebar,
} from "../shell/WorkspaceSidebar";
import "../styles/index.css";
import { createNoteReferenceGraph } from "../workspace/noteReferenceGraph";
import { resolveParsedNoteView } from "../workspace/parsedNoteView";
import { useWorkspaceController } from "../workspace/useWorkspaceController";

type EditorFocusRequest = {
  lineNumber: number;
  requestId: number;
};

const initialMigrationSelectionStatus: BlockMigrationPanelStatus = {
  message: "源笔记或目标笔记未选定。",
  status: "idle",
};

const emptyNoteReferenceGraph = {
  edges: [],
  issues: [],
  nodes: [],
  unresolvedReferences: [],
};

function getErrorMessage(error: unknown, fallbackMessage: string) {
  return error instanceof Error ? error.message : fallbackMessage;
}

function App() {
  const [activeActivityId, setActiveActivityId] =
    useState<SidebarActivityId>("notes");
  const [editorFocusRequest, setEditorFocusRequest] =
    useState<EditorFocusRequest | null>(null);
  const [syntaxDraftSource, setSyntaxDraftSource] = useState("");
  const [syntaxFeedback, setSyntaxFeedback] =
    useState<WorkspaceFeedback | null>(null);
  const [migrationSelectionStatus, setMigrationSelectionStatus] =
    useState<BlockMigrationPanelStatus>(initialMigrationSelectionStatus);
  const [migrationResultStatus, setMigrationResultStatus] =
    useState<BlockMigrationPanelStatus | null>(null);
  const {
    activeNote,
    canChangeRepositoryPath,
    changeRepositoryPath,
    createFolder,
    createNote,
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
    syntaxFile,
    updateActiveNoteSource,
    updateSyntaxFile,
    workspace,
    workspaceErrorMessage,
    workspaceSaveStatus,
  } = useWorkspaceController();
  const workspaceSaveStatusLabel = {
    error: "保存失败",
    idle: "等待保存",
    saved: "已保存",
    saving: "保存中",
  }[workspaceSaveStatus];
  const parsedNoteView = useMemo(
    () => resolveParsedNoteView(workspace, activeNote),
    [activeNote, workspace],
  );
  const documentText = parsedNoteView.source;
  const activeSyntaxProfile =
    parsedNoteView.status === "parsed" ? parsedNoteView.profile : null;
  const syntaxIssueMessage =
    parsedNoteView.status === "parsed" ? null : parsedNoteView.message;
  const parsedDocument = parsedNoteView.document;
  const noteReferenceGraph = useMemo(
    () =>
      activeActivityId === "visualization"
        ? createNoteReferenceGraph(workspace)
        : emptyNoteReferenceGraph,
    [activeActivityId, workspace],
  );
  useEffect(() => {
    setSyntaxDraftSource(syntaxFile.source);
  }, [syntaxFile.source]);

  const focusEditorLine = (lineNumber: number) => {
    setEditorFocusRequest((current) => ({
      lineNumber,
      requestId: (current?.requestId ?? 0) + 1,
    }));
  };
  const saveSelectedSyntaxFile = () => {
    setSyntaxFeedback(null);

    void Promise.resolve(updateSyntaxFile(syntaxDraftSource))
      .then(() => {
        setSyntaxFeedback({
          message: "仓库语法已保存。",
          status: "success",
        });
      })
      .catch((error: unknown) => {
        setSyntaxFeedback({
          message: getErrorMessage(error, "仓库语法保存失败。"),
          status: "error",
        });
      });
  };
  const updateSyntaxDraftSource = (source: string) => {
    setSyntaxDraftSource(source);
    setSyntaxFeedback(null);
  };
  const renderMainWorkspace = () => {
    if (activeActivityId === "syntax") {
      return (
        <SyntaxWorkspacePanel
          draftSource={syntaxDraftSource}
          syntaxFile={syntaxFile}
          onDraftSourceChange={updateSyntaxDraftSource}
          onSaveSyntaxFile={saveSelectedSyntaxFile}
        />
      );
    }

    if (activeActivityId === "migration") {
      return (
        <BlockMigrationWorkspacePanel
          activeNoteId={activeNote?.id ?? null}
          onMoveNoteBlock={moveNoteBlock}
          onResultStatusChange={setMigrationResultStatus}
          onSelectionStatusChange={setMigrationSelectionStatus}
          workspace={workspace}
        />
      );
    }

    if (activeActivityId === "visualization") {
      return <NoteReferenceGraphPanel graph={noteReferenceGraph} />;
    }

    return (
      <NoteEditorPanel
        documentText={documentText}
        focusTarget={editorFocusRequest}
        hasActiveNote={Boolean(activeNote)}
        parsedDocument={parsedDocument}
        syntaxProfile={activeSyntaxProfile}
        syntaxIssueMessage={syntaxIssueMessage}
        workspaceErrorMessage={workspaceErrorMessage}
        syntaxProfileName={workspace.syntaxProfile.name}
        title={activeNote?.title ?? "本地笔记库"}
        onCreateNote={createNote}
        onDocumentTextChange={updateActiveNoteSource}
      />
    );
  };
  const renderDetailWorkspace = () => {
    if (activeActivityId === "syntax") {
      return (
        <SyntaxProfileDetailPanel
          draftSource={syntaxDraftSource}
          feedback={syntaxFeedback}
          syntaxFile={syntaxFile}
        />
      );
    }

    if (activeActivityId === "migration") {
      return (
        <BlockMigrationStatusPanel
          resultStatus={migrationResultStatus}
          selectionStatus={migrationSelectionStatus}
        />
      );
    }

    if (activeActivityId === "visualization") {
      return (
        <NoteReferenceGraphDetailPanel
          graph={noteReferenceGraph}
          workspace={workspace}
        />
      );
    }

    return (
      <NoteOutlinePanel
        diagnosticsCount={parsedDocument.diagnostics.length}
        nodes={parsedDocument.roots}
        totalBlocks={parsedDocument.blocks.length}
        onSelectLine={focusEditorLine}
      />
    );
  };

  return (
    <main className="app-shell">
      <WorkspaceSidebar
        activeActivityId={activeActivityId}
        activeFolderId={selectedFolderId}
        activeNoteId={activeNote?.id ?? null}
        notes={workspace.notes}
        noteTree={workspace.tree}
        referenceGraph={noteReferenceGraph}
        repositoryPath={repositoryPath}
        saveStatusLabel={workspaceSaveStatusLabel}
        storageLabel={storageLabel}
        syntaxFile={syntaxFile}
        onActivityChange={setActiveActivityId}
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
