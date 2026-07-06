import { useEffect, useMemo, useRef, useState } from "react";
import {
  createInitialWorkspaceData,
  type FolderId,
  type NoteId,
  type WorkspaceData,
} from "../../workspace/model/workspaceData";
import {
  createWorkspaceFolder as createWorkspaceFolderAction,
  createWorkspaceNote as createWorkspaceNoteAction,
  deleteWorkspaceFolder as deleteWorkspaceFolderAction,
  deleteWorkspaceNote as deleteWorkspaceNoteAction,
  moveWorkspaceNote as moveWorkspaceNoteAction,
  renameWorkspaceFolder as renameWorkspaceFolderAction,
  updateWorkspaceNoteSource as updateWorkspaceNoteSourceAction,
} from "../../workspace/commands/workspaceCommands";
import {
  moveWorkspaceBlock as moveWorkspaceBlockAction,
  type MoveWorkspaceBlockFailureReason,
  type WorkspaceBlockMigrationRequest,
} from "../../workspace/commands/blockMigrationCommands";
import {
  createDataSaveQueue,
  type SaveStatus,
} from "./dataSaveQueue";
import type { WorkspaceRepository } from "../../storage/workspaceRepository";
import {
  attachWorkspaceSyntaxProfile,
  type WorkspaceContext,
} from "../../workspace/context/workspaceContext";
import {
  createDefaultSyntaxFile,
  parseSyntaxSource,
  resolveSyntaxFile,
  type SyntaxFile,
  workspaceSyntaxFileName,
} from "../../workspace/context/syntaxFile";

export type { SaveStatus } from "./dataSaveQueue";

type CreateWorkspaceNoteCommand = Parameters<typeof createWorkspaceNoteAction>[1];
type CreateWorkspaceFolderCommand = Parameters<
  typeof createWorkspaceFolderAction
>[1];
type WorkspaceBlockMigrationIndex = Parameters<
  typeof moveWorkspaceBlockAction
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
  defaultSyntaxFile: SyntaxFile;
  syntaxFile: SyntaxFile | null;
  useDefaultSyntaxFile: () => Promise<void>;
  updateSyntaxFile: (source: string) => Promise<void>;
  workspaceData: WorkspaceData;
  context: WorkspaceContext | null;
  commands: SessionCommands;
  errorMessage: string;
  saveStatus: SaveStatus;
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
    useState<SaveStatus>("idle");
  const [repositoryPath, setRepositoryPath] = useState("");
  const [syntaxFile, setSyntaxFile] = useState<SyntaxFile | null>(null);
  const defaultSyntaxFile = useMemo(createDefaultSyntaxFile, []);
  const isMountedRef = useRef(true);
  const context = useMemo(
    () =>
      syntaxFile
        ? attachWorkspaceSyntaxProfile(workspaceData, syntaxFile.profile)
        : null,
    [syntaxFile, workspaceData],
  );
  const commands = useMemo(
    (): SessionCommands => ({
      createFolder(parentFolderId, title) {
        const folderId = createFolderId();

        commitDataSnapshot(
          createWorkspaceFolderAction(workspaceData, {
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
          createWorkspaceNoteAction(workspaceData, {
            folderId,
            noteId,
            timestamp: createTimestamp(),
          }),
        );
        return noteId;
      },
      deleteFolder(folderId) {
        commitDataSnapshot(
          deleteWorkspaceFolderAction(workspaceData, folderId),
        );
      },
      deleteNote(noteId) {
        commitDataSnapshot(
          deleteWorkspaceNoteAction(workspaceData, noteId),
        );
      },
      moveBlock(index, request) {
        const result = moveWorkspaceBlockAction(
          workspaceData,
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
          moveWorkspaceNoteAction(workspaceData, noteId, targetFolderId),
        );
      },
      renameFolder(folderId, title) {
        commitDataSnapshot(
          renameWorkspaceFolderAction(workspaceData, folderId, title),
        );
      },
      updateNoteSource(noteId, source) {
        commitDataSnapshot(
          updateWorkspaceNoteSourceAction(
            workspaceData,
            noteId,
            source,
            createTimestamp(),
          ),
        );
      },
    }),
    [workspaceData],
  );

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const saveQueue = useMemo(
    () =>
      createDataSaveQueue({
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
      repository.readSyntaxFile(),
    ])
      .then(([storedWorkspace, repositoryInfo, storedSyntaxFile]) => {
        if (!isActive) {
          return;
        }

        setRepositoryPath(repositoryInfo.path);
        setSyntaxFile(resolveSyntaxFile(storedSyntaxFile));
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
      const [storedWorkspace, repositoryInfo, storedSyntaxFile] =
        await Promise.all([
          repository.loadWorkspace(),
          repository.getRepositoryInfo(),
          repository.readSyntaxFile(),
        ]);

      setRepositoryPath(repositoryInfo.path);
      setSyntaxFile(resolveSyntaxFile(storedSyntaxFile));
      commitDataSnapshot(resolveWorkspaceData(storedWorkspace));
      setSaveStatus("idle");
      setIsLoaded(true);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "工作区加载失败。"));
      setSaveStatus("error");
    }
  };

  const refreshSyntaxState = async () => {
    const [storedWorkspace, storedSyntaxFile] = await Promise.all([
      repository.loadWorkspace(),
      repository.readSyntaxFile(),
    ]);

    setSyntaxFile(resolveSyntaxFile(storedSyntaxFile));
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
    const [repositoryInfo, storedSyntaxFile] = await Promise.all([
      repository.getRepositoryInfo(),
      repository.readSyntaxFile(),
    ]);

    setRepositoryPath(repositoryInfo.path);
    setSyntaxFile(resolveSyntaxFile(storedSyntaxFile));
    commitDataSnapshot(resolveWorkspaceData(storedWorkspace));
    setErrorMessage("");
    setSaveStatus("idle");
    setIsLoaded(true);
  };

  const updateSyntaxFile = async (source: string) => {
    try {
      parseSyntaxSource(workspaceSyntaxFileName, source);
      await repository.saveSyntaxFile(source);
      await refreshSyntaxState();
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, "仓库语法保存失败。"),
      );
      throw error;
    }
  };
  const useDefaultSyntaxFile = async () => {
    await updateSyntaxFile(defaultSyntaxFile.source);
  };

  return {
    canChangeRepositoryPath: Boolean(repository.canChangeRepositoryPath),
    changeRepositoryPath,
    isLoaded,
    reload,
    repositoryPath,
    storageLabel: repository.label,
    defaultSyntaxFile,
    syntaxFile,
    useDefaultSyntaxFile,
    updateSyntaxFile,
    workspaceData,
    context,
    commands,
    errorMessage,
    saveStatus,
  };
}
