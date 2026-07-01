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
  const [selectedSyntaxFileName, setSelectedSyntaxFileName] = useState("");
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
    workspaceErrorMessage,
  } = useWorkspaceController();
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
  const selectedSyntaxFile = useMemo(
    () =>
      syntaxFiles.find((file) => file.fileName === selectedSyntaxFileName) ??
      null,
    [selectedSyntaxFileName, syntaxFiles],
  );

  useEffect(() => {
    if (
      selectedSyntaxFileName &&
      syntaxFiles.some((file) => file.fileName === selectedSyntaxFileName)
    ) {
      return;
    }

    setSelectedSyntaxFileName(syntaxFiles[0]?.fileName ?? "");
  }, [selectedSyntaxFileName, syntaxFiles]);

  useEffect(() => {
    if (!selectedSyntaxFile) {
      setSyntaxDraftSource("");
      return;
    }

    setSyntaxDraftSource(selectedSyntaxFile.source);
  }, [selectedSyntaxFile]);

  const focusEditorLine = (lineNumber: number) => {
    setEditorFocusRequest((current) => ({
      lineNumber,
      requestId: (current?.requestId ?? 0) + 1,
    }));
  };
  const selectSyntaxFile = (fileName: string) => {
    setSelectedSyntaxFileName(fileName);
    setSyntaxFeedback(null);
  };
  const createSyntaxFileWithFeedback = (fileName: string) => {
    setSyntaxFeedback(null);

    void Promise.resolve(createSyntaxFile(fileName))
      .then(() => {
        setSelectedSyntaxFileName(fileName);
        setSyntaxFeedback({
          message: "语法文件已创建。",
          status: "success",
        });
      })
      .catch((error: unknown) => {
        setSyntaxFeedback({
          message: getErrorMessage(error, "语法文件创建失败。"),
          status: "error",
        });
      });
  };
  const deleteSyntaxFileWithFeedback = (fileName: string) => {
    setSyntaxFeedback(null);

    void Promise.resolve(deleteSyntaxFile(fileName))
      .then(() => {
        setSyntaxFeedback({
          message: "语法文件已删除。",
          status: "success",
        });
      })
      .catch((error: unknown) => {
        setSyntaxFeedback({
          message: getErrorMessage(error, "语法文件删除失败。"),
          status: "error",
        });
      });
  };
  const saveSelectedSyntaxFile = () => {
    if (!selectedSyntaxFile) {
      return;
    }

    setSyntaxFeedback(null);

    void Promise.resolve(
      updateSyntaxFile(selectedSyntaxFile.fileName, syntaxDraftSource),
    )
      .then(() => {
        setSyntaxFeedback({
          message: "语法文件已保存。",
          status: "success",
        });
      })
      .catch((error: unknown) => {
        setSyntaxFeedback({
          message: getErrorMessage(error, "语法文件保存失败。"),
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
          selectedFile={selectedSyntaxFile}
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
        syntaxProfiles={workspace.syntaxProfiles}
        title={activeNote?.title ?? "本地笔记库"}
        onCreateNote={createNote}
        onDocumentTextChange={updateActiveNoteSource}
        onSyntaxProfileChange={updateActiveNoteSyntaxProfile}
      />
    );
  };
  const renderDetailWorkspace = () => {
    if (activeActivityId === "syntax") {
      return (
        <SyntaxProfileDetailPanel
          draftSource={syntaxDraftSource}
          feedback={syntaxFeedback}
          selectedFile={selectedSyntaxFile}
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
        storageLabel={storageLabel}
        selectedSyntaxFileName={selectedSyntaxFile?.fileName ?? ""}
        syntaxProfiles={workspace.syntaxProfiles}
        syntaxFiles={syntaxFiles}
        onActivityChange={setActiveActivityId}
        canChangeRepositoryPath={canChangeRepositoryPath}
        onChangeRepositoryPath={changeRepositoryPath}
        onCreateFolder={createFolder}
        onCreateNote={createNote}
        onCreateSyntaxFile={createSyntaxFileWithFeedback}
        onDeleteSyntaxFile={deleteSyntaxFileWithFeedback}
        onDeleteFolder={deleteFolder}
        onDeleteNote={deleteNote}
        onMoveNote={moveNote}
        onReloadWorkspace={reloadWorkspace}
        onRenameFolder={renameFolder}
        onSelectFolder={selectFolder}
        onSelectNote={selectNote}
        onSelectSyntaxFile={selectSyntaxFile}
      />

      {renderMainWorkspace()}
      {renderDetailWorkspace()}
    </main>
  );
}

export default App;
