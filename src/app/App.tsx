import { useEffect, useMemo, useRef, useState } from "react";
import { BlockMigrationWorkspacePanel } from "../features/migration/BlockMigrationWorkspacePanel";
import { NoteEditorPanel } from "../features/notes/NoteEditorPanel";
import { NoteOutlinePanel } from "../features/notes/NoteOutlinePanel";
import {
  SyntaxProfileDetailPanel,
  type WorkspaceFeedback,
} from "../features/syntax/SyntaxProfileDetailPanel";
import { SyntaxWorkspacePanel } from "../features/syntax/SyntaxWorkspacePanel";
import {
  buildSyntaxProfileDraft,
  createSyntaxProfileDraft,
} from "../features/syntax/syntaxProfileDraft";
import { NoteReferenceGraphDetailPanel } from "../features/visualization/NoteReferenceGraphDetailPanel";
import { NoteReferenceGraphPanel } from "../features/visualization/NoteReferenceGraphPanel";
import {
  type SidebarActivityId,
  WorkspaceSidebar,
} from "../shell/WorkspaceSidebar";
import "../styles/index.css";
import { defaultCtnSyntaxProfile } from "../syntax/defaultSyntaxProfile";
import { formatSyntaxProfileToml } from "../syntax/profileToml";
import { createNoteReferenceGraph } from "../workspace/noteReferenceGraph";
import { resolveParsedNoteView } from "../workspace/parsedNoteView";
import { useWorkspaceController } from "../workspace/useWorkspaceController";

type EditorFocusRequest = {
  lineNumber: number;
  requestId: number;
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
  const [syntaxDraft, setSyntaxDraft] = useState(() =>
    createSyntaxProfileDraft(defaultCtnSyntaxProfile),
  );
  const [syntaxFeedback, setSyntaxFeedback] =
    useState<WorkspaceFeedback | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const lastPersistedSyntaxSourceRef = useRef("");
  const updateSyntaxFileRef = useRef<(source: string) => Promise<void>>(
    async () => undefined,
  );
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
  const workspaceSaveStatusLabel = {
    error: "保存失败",
    idle: "等待保存",
    saved: "已保存",
    saving: "保存中",
  }[workspaceSaveStatus];
  const syntaxDraftResult = useMemo(
    () => buildSyntaxProfileDraft(syntaxDraft),
    [syntaxDraft],
  );
  const syntaxDraftSource = useMemo(
    () =>
      syntaxDraftResult.profile
        ? formatSyntaxProfileToml(syntaxDraftResult.profile)
        : null,
    [syntaxDraftResult.profile],
  );
  const effectiveWorkspace = useMemo(
    () =>
      syntaxDraftResult.profile
        ? {
            ...workspace,
            syntaxProfile: syntaxDraftResult.profile,
          }
        : workspace,
    [syntaxDraftResult.profile, workspace],
  );
  const effectiveActiveNote =
    effectiveWorkspace.notes.find(
      (note) => note.id === effectiveWorkspace.activeNoteId,
    ) ?? null;
  const parsedNoteView = useMemo(
    () => resolveParsedNoteView(effectiveWorkspace, effectiveActiveNote),
    [effectiveActiveNote, effectiveWorkspace],
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
        ? createNoteReferenceGraph(effectiveWorkspace)
        : emptyNoteReferenceGraph,
    [activeActivityId, effectiveWorkspace],
  );

  useEffect(() => {
    lastPersistedSyntaxSourceRef.current = formatSyntaxProfileToml(
      syntaxFile.profile,
    );
    setSyntaxDraft(createSyntaxProfileDraft(syntaxFile.profile));
  }, [syntaxFile.profile]);

  useEffect(() => {
    updateSyntaxFileRef.current = updateSyntaxFile;
  }, [updateSyntaxFile]);

  useEffect(() => {
    if (
      !isWorkspaceLoaded ||
      !syntaxDraftSource ||
      syntaxDraftSource === lastPersistedSyntaxSourceRef.current
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const source = syntaxDraftSource;

      void updateSyntaxFileRef.current(source)
        .then(() => {
          lastPersistedSyntaxSourceRef.current = source;
          setSyntaxFeedback({
            message: "仓库语法已自动保存。",
            status: "success",
          });
        })
        .catch((error: unknown) => {
          setSyntaxFeedback({
            message: getErrorMessage(error, "仓库语法自动保存失败。"),
            status: "error",
          });
        });
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [isWorkspaceLoaded, syntaxDraftSource]);

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
  const updateSyntaxDraft = (nextDraft: typeof syntaxDraft) => {
    setSyntaxDraft(nextDraft);
    setSyntaxFeedback(null);
  };
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
        syntaxIssueMessage={syntaxIssueMessage}
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
