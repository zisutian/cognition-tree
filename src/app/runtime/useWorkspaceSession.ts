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
  selectWorkspaceNote as selectWorkspaceNoteAction,
  updateActiveWorkspaceNoteSource as updateActiveWorkspaceNoteSourceAction,
} from "../../workspace/actions/workspaceActions";
import {
  moveWorkspaceBlock as moveWorkspaceBlockAction,
  type WorkspaceBlockMigrationRequest,
} from "../../workspace/actions/blockMigrationActions";
import { createRuntimeWorkspaceRepository } from "../../storage/runtimeWorkspaceRepository";
import type { WorkspaceSyntaxFile } from "../../storage/workspaceRepository";
import { defaultCtnSyntaxProfile } from "../../ctn-syntax/defaultSyntaxProfile";
import {
  createWorkspaceDataSaveQueue,
  type WorkspaceSaveStatus,
} from "./workspaceDataSaveQueue";
import {
  attachWorkspaceSyntaxProfile,
  type WorkspaceRuntime,
} from "../../workspace/runtime/workspaceRuntime";

export type { WorkspaceSaveStatus } from "./workspaceDataSaveQueue";

type CreateWorkspaceNoteCommand = Parameters<typeof createWorkspaceNoteAction>[1];
type CreateWorkspaceFolderCommand = Parameters<
  typeof createWorkspaceFolderAction
>[1];
type WorkspaceBlockMigrationIndex = Parameters<
  typeof moveWorkspaceBlockAction
>[1];
type MoveWorkspaceBlockCommandResult =
  | {
      message: string;
      status: "moved";
      targetNoteId: NoteId;
    }
  | {
      message: string;
      status: "failed";
      targetNoteId?: never;
    };

type WorkspaceSessionCommands = {
  createFolder: (request: CreateWorkspaceFolderCommand) => void;
  createNote: (request: CreateWorkspaceNoteCommand) => void;
  deleteFolder: (folderId: FolderId) => void;
  deleteNote: (noteId: NoteId) => void;
  moveBlock: (
    index: WorkspaceBlockMigrationIndex,
    request: WorkspaceBlockMigrationRequest,
    timestamp: string,
  ) => MoveWorkspaceBlockCommandResult;
  moveNote: (noteId: NoteId, targetFolderId: FolderId) => void;
  renameFolder: (folderId: FolderId, title: string) => void;
  selectNote: (noteId: NoteId) => void;
  updateActiveNoteSource: (source: string, timestamp: string) => void;
};

type UseWorkspaceSessionResult = {
  canChangeRepositoryPath: boolean;
  changeRepositoryPath: (path: string) => Promise<void>;
  isWorkspaceLoaded: boolean;
  reloadWorkspace: () => Promise<void>;
  repositoryPath: string;
  storageLabel: string;
  syntaxFile: WorkspaceSyntaxFile;
  updateSyntaxFile: (source: string) => Promise<void>;
  workspace: WorkspaceRuntime;
  workspaceCommands: WorkspaceSessionCommands;
  workspaceErrorMessage: string;
  workspaceSaveStatus: WorkspaceSaveStatus;
};

function resolveWorkspaceData(workspace: WorkspaceData | null) {
  return workspace ?? createInitialWorkspaceData();
}

function getErrorMessage(error: unknown, fallbackMessage: string) {
  return error instanceof Error ? error.message : fallbackMessage;
}

export function useWorkspaceSession(): UseWorkspaceSessionResult {
  const repository = useMemo(() => createRuntimeWorkspaceRepository(), []);
  const [workspaceData, commitWorkspaceDataSnapshot] =
    useState<WorkspaceData>(() => createInitialWorkspaceData());
  const [isWorkspaceLoaded, setIsWorkspaceLoaded] = useState(false);
  const [workspaceErrorMessage, setWorkspaceErrorMessage] = useState("");
  const [workspaceSaveStatus, setWorkspaceSaveStatus] =
    useState<WorkspaceSaveStatus>("idle");
  const [repositoryPath, setRepositoryPath] = useState("");
  const [syntaxFile, setSyntaxFile] = useState<WorkspaceSyntaxFile>({
    fileName: "workspace.toml",
    profile: defaultCtnSyntaxProfile,
    source: "",
  });
  const isMountedRef = useRef(true);
  const workspace = useMemo(
    () => attachWorkspaceSyntaxProfile(workspaceData, syntaxFile.profile),
    [syntaxFile.profile, workspaceData],
  );
  const workspaceCommands = useMemo(
    (): WorkspaceSessionCommands => ({
      createFolder(request) {
        commitWorkspaceDataSnapshot((current) =>
          createWorkspaceFolderAction(current, request),
        );
      },
      createNote(request) {
        commitWorkspaceDataSnapshot((current) =>
          createWorkspaceNoteAction(current, request),
        );
      },
      deleteFolder(folderId) {
        commitWorkspaceDataSnapshot((current) =>
          deleteWorkspaceFolderAction(current, folderId),
        );
      },
      deleteNote(noteId) {
        commitWorkspaceDataSnapshot((current) =>
          deleteWorkspaceNoteAction(current, noteId),
        );
      },
      moveBlock(index, request, timestamp) {
        const result = moveWorkspaceBlockAction(
          workspaceData,
          index,
          request,
          timestamp,
        );

        if (result.status !== "moved") {
          return {
            message: result.message,
            status: "failed",
          };
        }

        commitWorkspaceDataSnapshot(result.workspaceData);

        return {
          message: result.message,
          status: "moved",
          targetNoteId: result.targetNoteId,
        };
      },
      moveNote(noteId, targetFolderId) {
        commitWorkspaceDataSnapshot((current) =>
          moveWorkspaceNoteAction(current, noteId, targetFolderId),
        );
      },
      renameFolder(folderId, title) {
        commitWorkspaceDataSnapshot((current) =>
          renameWorkspaceFolderAction(current, folderId, title),
        );
      },
      selectNote(noteId) {
        commitWorkspaceDataSnapshot((current) =>
          selectWorkspaceNoteAction(current, noteId),
        );
      },
      updateActiveNoteSource(source, timestamp) {
        commitWorkspaceDataSnapshot((current) =>
          updateActiveWorkspaceNoteSourceAction(current, source, timestamp),
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
      createWorkspaceDataSaveQueue({
        onError(error) {
          if (isMountedRef.current) {
            setWorkspaceErrorMessage(
              getErrorMessage(error, "工作区自动保存失败。"),
            );
          }
        },
        onStatusChange(status) {
          if (!isMountedRef.current) {
            return;
          }

          if (status === "saved") {
            setWorkspaceErrorMessage("");
          }

          setWorkspaceSaveStatus(status);
        },
        save: (nextWorkspaceData) => repository.saveWorkspace(nextWorkspaceData),
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
        setSyntaxFile(storedSyntaxFile);
        commitWorkspaceDataSnapshot(resolveWorkspaceData(storedWorkspace));
        setWorkspaceErrorMessage("");
        setWorkspaceSaveStatus("idle");
        setIsWorkspaceLoaded(true);
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        setWorkspaceErrorMessage(getErrorMessage(error, "工作区加载失败。"));
        setWorkspaceSaveStatus("error");
        setIsWorkspaceLoaded(false);
      });

    return () => {
      isActive = false;
    };
  }, [repository]);

  useEffect(() => {
    if (isWorkspaceLoaded) {
      saveQueue.enqueue(workspaceData);
    }
  }, [isWorkspaceLoaded, saveQueue, workspaceData]);

  const reloadWorkspace = async () => {
    setIsWorkspaceLoaded(false);
    setWorkspaceErrorMessage("");
    await saveQueue.waitForIdle();

    try {
      const [storedWorkspace, repositoryInfo, storedSyntaxFile] =
        await Promise.all([
          repository.loadWorkspace(),
          repository.getRepositoryInfo(),
          repository.readSyntaxFile(),
        ]);

      setRepositoryPath(repositoryInfo.path);
      setSyntaxFile(storedSyntaxFile);
      commitWorkspaceDataSnapshot(resolveWorkspaceData(storedWorkspace));
      setWorkspaceSaveStatus("idle");
      setIsWorkspaceLoaded(true);
    } catch (error) {
      setWorkspaceErrorMessage(getErrorMessage(error, "工作区加载失败。"));
      setWorkspaceSaveStatus("error");
    }
  };

  const refreshSyntaxState = async () => {
    const [storedWorkspace, storedSyntaxFile] = await Promise.all([
      repository.loadWorkspace(),
      repository.readSyntaxFile(),
    ]);

    setSyntaxFile(storedSyntaxFile);
    commitWorkspaceDataSnapshot(resolveWorkspaceData(storedWorkspace));
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

    setIsWorkspaceLoaded(false);
    await saveQueue.waitForIdle();

    const storedWorkspace = await repository.setRepositoryPath(nextPath);
    const [repositoryInfo, storedSyntaxFile] = await Promise.all([
      repository.getRepositoryInfo(),
      repository.readSyntaxFile(),
    ]);

    setRepositoryPath(repositoryInfo.path);
    setSyntaxFile(storedSyntaxFile);
    commitWorkspaceDataSnapshot(resolveWorkspaceData(storedWorkspace));
    setWorkspaceErrorMessage("");
    setWorkspaceSaveStatus("idle");
    setIsWorkspaceLoaded(true);
  };

  const updateSyntaxFile = async (source: string) => {
    await repository.saveSyntaxFile(source);
    await refreshSyntaxState();
  };

  return {
    canChangeRepositoryPath: Boolean(repository.canChangeRepositoryPath),
    changeRepositoryPath,
    isWorkspaceLoaded,
    reloadWorkspace,
    repositoryPath,
    storageLabel: repository.label,
    syntaxFile,
    updateSyntaxFile,
    workspace,
    workspaceCommands,
    workspaceErrorMessage,
    workspaceSaveStatus,
  };
}
