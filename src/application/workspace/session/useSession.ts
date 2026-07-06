import { useEffect, useMemo, useRef, useState } from "react";
import {
  createInitialWorkspaceData,
  type FolderId,
  type NoteId,
  type WorkspaceData,
} from "../../../workspace/model/workspaceData";
import {
  createWorkspaceStructureIndex,
  type WorkspaceStructureIndex,
} from "../../../workspace/indexes/workspaceStructureIndex";
import {
  createWorkspaceFolder as createWorkspaceFolderAction,
  createWorkspaceNote as createWorkspaceNoteAction,
  deleteWorkspaceFolder as deleteWorkspaceFolderAction,
  deleteWorkspaceNote as deleteWorkspaceNoteAction,
  moveWorkspaceNote as moveWorkspaceNoteAction,
  moveWorkspaceTreeNode as moveWorkspaceTreeNodeAction,
  renameWorkspaceFolder as renameWorkspaceFolderAction,
  updateWorkspaceNoteSource as updateWorkspaceNoteSourceAction,
} from "../../../workspace/commands/workspaceCommands";
import {
  moveWorkspaceBlock as moveWorkspaceBlockAction,
  type MoveWorkspaceBlockFailureReason,
  type WorkspaceBlockMigrationRequest,
} from "../../../workspace/commands/blockMigrationCommands";
import {
  createWorkspaceSaveQueue,
  type WorkspaceSaveStatus,
} from "./workspaceSaveQueue";
import type { WorkspaceRepository } from "../../../storage/workspaceRepository";
import {
  attachWorkspaceSyntaxProfile,
  type WorkspaceContext,
} from "../../../workspace/context/workspaceContext";
import {
  createDefaultWorkspaceSyntaxFile,
  parseWorkspaceSyntaxSource,
  resolveWorkspaceSyntaxFile,
  type WorkspaceSyntaxFile,
  workspaceSyntaxFileName,
} from "../../../workspace/context/workspaceSyntaxFile";

export type { WorkspaceSaveStatus } from "./workspaceSaveQueue";

type CreateWorkspaceNoteCommand = Parameters<typeof createWorkspaceNoteAction>[1];
type CreateWorkspaceFolderCommand = Parameters<
  typeof createWorkspaceFolderAction
>[1];
type WorkspaceBlockMigrationIndex = Parameters<
  typeof moveWorkspaceBlockAction
>[1];
type MoveWorkspaceTreeNodeCommand = Parameters<
  typeof moveWorkspaceTreeNodeAction
>[1];
type MoveWorkspaceBlockCommandResult =
  | {
      status: "moved";
      targetNoteId: NoteId;
    }
  | {
      reason: MoveWorkspaceBlockFailureReason;
      status: "failed";
      targetNoteId?: never;
    };

export type SessionCommands = {
  createFolder: (
    parentFolderId: CreateWorkspaceFolderCommand["parentFolderId"],
    title: CreateWorkspaceFolderCommand["title"],
  ) => FolderId;
  createNote: (folderId: CreateWorkspaceNoteCommand["folderId"]) => NoteId;
  deleteFolder: (folderId: FolderId) => void;
  deleteNote: (noteId: NoteId) => void;
  moveBlock: (
    index: WorkspaceBlockMigrationIndex,
    request: WorkspaceBlockMigrationRequest,
  ) => MoveWorkspaceBlockCommandResult;
  moveNote: (noteId: NoteId, targetFolderId: FolderId) => void;
  moveTreeNode: (request: MoveWorkspaceTreeNodeCommand) => void;
  renameFolder: (folderId: FolderId, title: string) => void;
  updateNoteSource: (noteId: NoteId, source: string) => void;
};

export type Session = {
  canChangeRepositoryPath: boolean;
  changeRepositoryPath: (path: string) => Promise<void>;
  isLoaded: boolean;
  reload: () => Promise<void>;
  repositoryPath: string;
  storageLabel: string;
  defaultWorkspaceSyntaxFile: WorkspaceSyntaxFile;
  workspaceSyntaxFile: WorkspaceSyntaxFile | null;
  useDefaultWorkspaceSyntaxFile: () => Promise<void>;
  updateWorkspaceSyntaxSource: (source: string) => Promise<void>;
  workspace: WorkspaceStructureIndex;
  context: WorkspaceContext | null;
  commands: SessionCommands;
  errorMessage: string;
  saveStatus: WorkspaceSaveStatus;
};

function resolveWorkspaceData(workspace: WorkspaceData | null) {
  return workspace ?? createInitialWorkspaceData();
}

function getErrorMessage(error: unknown, fallbackMessage: string) {
  return error instanceof Error ? error.message : fallbackMessage;
}

function createFolderId() {
  return `folder-${globalThis.crypto.randomUUID()}`;
}

function createNoteId() {
  return `note-${globalThis.crypto.randomUUID()}`;
}

function createTimestamp() {
  return new Date().toISOString();
}

export function useSession({
  repository,
}: {
  repository: WorkspaceRepository;
}): Session {
  const [workspaceData, commitDataSnapshot] =
    useState<WorkspaceData>(() => createInitialWorkspaceData());
  const [isLoaded, setIsLoaded] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [saveStatus, setSaveStatus] =
    useState<WorkspaceSaveStatus>("idle");
  const [repositoryPath, setRepositoryPath] = useState("");
  const [workspaceSyntaxFile, setWorkspaceSyntaxFile] =
    useState<WorkspaceSyntaxFile | null>(null);
  const defaultWorkspaceSyntaxFile = useMemo(
    createDefaultWorkspaceSyntaxFile,
    [],
  );
  const isMountedRef = useRef(true);
  const workspace = useMemo(
    () => createWorkspaceStructureIndex(workspaceData),
    [workspaceData],
  );
  const context = useMemo(
    () =>
      workspaceSyntaxFile
        ? attachWorkspaceSyntaxProfile(
            workspace,
            workspaceSyntaxFile.profile,
          )
        : null,
    [workspaceSyntaxFile, workspace],
  );
  const commands = useMemo(
    (): SessionCommands => ({
      createFolder(parentFolderId, title) {
        const folderId = createFolderId();

        commitDataSnapshot(
          createWorkspaceFolderAction(workspace, {
            folderId,
            parentFolderId,
            title,
          }),
        );
        return folderId;
      },
      createNote(folderId) {
        const noteId = createNoteId();

        commitDataSnapshot(
          createWorkspaceNoteAction(workspace, {
            folderId,
            noteId,
            timestamp: createTimestamp(),
          }),
        );
        return noteId;
      },
      deleteFolder(folderId) {
        commitDataSnapshot(
          deleteWorkspaceFolderAction(workspace, folderId),
        );
      },
      deleteNote(noteId) {
        commitDataSnapshot(
          deleteWorkspaceNoteAction(workspace, noteId),
        );
      },
      moveBlock(index, request) {
        const result = moveWorkspaceBlockAction(
          workspace,
          index,
          request,
          createTimestamp(),
        );

        if (result.status !== "moved") {
          return {
            reason: result.reason,
            status: "failed",
          };
        }

        commitDataSnapshot(result.workspaceData);

        return {
          status: "moved",
          targetNoteId: result.targetNoteId,
        };
      },
      moveNote(noteId, targetFolderId) {
        commitDataSnapshot(
          moveWorkspaceNoteAction(workspace, noteId, targetFolderId),
        );
      },
      moveTreeNode(request) {
        commitDataSnapshot(
          moveWorkspaceTreeNodeAction(workspace, request),
        );
      },
      renameFolder(folderId, title) {
        commitDataSnapshot(
          renameWorkspaceFolderAction(workspace, folderId, title),
        );
      },
      updateNoteSource(noteId, source) {
        commitDataSnapshot(
          updateWorkspaceNoteSourceAction(
            workspace,
            noteId,
            source,
            createTimestamp(),
          ),
        );
      },
    }),
    [workspace],
  );

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const saveQueue = useMemo(
    () =>
      createWorkspaceSaveQueue({
        onError(error) {
          if (isMountedRef.current) {
            setErrorMessage(
              getErrorMessage(error, "工作区自动保存失败。"),
            );
          }
        },
        onStatusChange(status) {
          if (!isMountedRef.current) {
            return;
          }

          if (status === "saved") {
            setErrorMessage("");
          }

          setSaveStatus(status);
        },
        save: (nextData) => repository.saveWorkspace(nextData),
      }),
    [repository],
  );

  useEffect(() => {
    let isActive = true;

    void Promise.all([
      repository.loadWorkspace(),
      repository.getRepositoryInfo(),
      repository.readWorkspaceSyntaxSourceFile(),
    ])
      .then(([storedWorkspace, repositoryInfo, storedWorkspaceSyntaxSource]) => {
        if (!isActive) {
          return;
        }

        setRepositoryPath(repositoryInfo.path);
        setWorkspaceSyntaxFile(
          resolveWorkspaceSyntaxFile(storedWorkspaceSyntaxSource),
        );
        commitDataSnapshot(resolveWorkspaceData(storedWorkspace));
        setErrorMessage("");
        setSaveStatus("idle");
        setIsLoaded(true);
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        setErrorMessage(getErrorMessage(error, "工作区加载失败。"));
        setSaveStatus("error");
        setIsLoaded(false);
      });

    return () => {
      isActive = false;
    };
  }, [repository]);

  useEffect(() => {
    if (isLoaded) {
      saveQueue.enqueue(workspaceData);
    }
  }, [isLoaded, saveQueue, workspaceData]);

  const reload = async () => {
    setIsLoaded(false);
    setErrorMessage("");
    await saveQueue.waitForIdle();

    try {
      const [storedWorkspace, repositoryInfo, storedWorkspaceSyntaxSource] =
        await Promise.all([
          repository.loadWorkspace(),
          repository.getRepositoryInfo(),
          repository.readWorkspaceSyntaxSourceFile(),
        ]);

      setRepositoryPath(repositoryInfo.path);
      setWorkspaceSyntaxFile(
        resolveWorkspaceSyntaxFile(storedWorkspaceSyntaxSource),
      );
      commitDataSnapshot(resolveWorkspaceData(storedWorkspace));
      setSaveStatus("idle");
      setIsLoaded(true);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "工作区加载失败。"));
      setSaveStatus("error");
    }
  };

  const refreshSyntaxState = async () => {
    const [storedWorkspace, storedWorkspaceSyntaxSource] = await Promise.all([
      repository.loadWorkspace(),
      repository.readWorkspaceSyntaxSourceFile(),
    ]);

    setWorkspaceSyntaxFile(
      resolveWorkspaceSyntaxFile(storedWorkspaceSyntaxSource),
    );
    commitDataSnapshot(resolveWorkspaceData(storedWorkspace));
  };

  const changeRepositoryPath = async (path: string) => {
    const nextPath = path.trim();

    if (
      !nextPath ||
      nextPath === repositoryPath ||
      !repository.setRepositoryPath
    ) {
      return;
    }

    setIsLoaded(false);
    await saveQueue.waitForIdle();

    const storedWorkspace = await repository.setRepositoryPath(nextPath);
    const [repositoryInfo, storedWorkspaceSyntaxSource] = await Promise.all([
      repository.getRepositoryInfo(),
      repository.readWorkspaceSyntaxSourceFile(),
    ]);

    setRepositoryPath(repositoryInfo.path);
    setWorkspaceSyntaxFile(
      resolveWorkspaceSyntaxFile(storedWorkspaceSyntaxSource),
    );
    commitDataSnapshot(resolveWorkspaceData(storedWorkspace));
    setErrorMessage("");
    setSaveStatus("idle");
    setIsLoaded(true);
  };

  const updateWorkspaceSyntaxSource = async (source: string) => {
    try {
      parseWorkspaceSyntaxSource(workspaceSyntaxFileName, source);
      await repository.saveWorkspaceSyntaxSource(source);
      await refreshSyntaxState();
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, "仓库语法保存失败。"),
      );
      throw error;
    }
  };
  const useDefaultWorkspaceSyntaxFile = async () => {
    await updateWorkspaceSyntaxSource(defaultWorkspaceSyntaxFile.source);
  };

  return {
    canChangeRepositoryPath: Boolean(repository.canChangeRepositoryPath),
    changeRepositoryPath,
    isLoaded,
    reload,
    repositoryPath,
    storageLabel: repository.label,
    defaultWorkspaceSyntaxFile,
    workspaceSyntaxFile,
    useDefaultWorkspaceSyntaxFile,
    updateWorkspaceSyntaxSource,
    workspace,
    context,
    commands,
    errorMessage,
    saveStatus,
  };
}
