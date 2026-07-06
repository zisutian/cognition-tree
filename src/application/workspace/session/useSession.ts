import { useEffect, useMemo, useRef, useState } from "react";
import {
  createInitialWorkspaceData,
  type WorkspaceData,
} from "../../../workspace/model/workspaceData";
import {
  createWorkspaceStructureIndex,
  type WorkspaceStructureIndex,
} from "../../../workspace/indexes/workspaceStructureIndex";
import {
  createWorkspaceSaveQueue,
  type WorkspaceSaveStatus,
} from "./workspaceSaveQueue";
import {
  createSessionCommands,
  type SessionCommands,
} from "./sessionCommands";
import type { WorkspaceRepository } from "../../../storage/workspaceRepository";
import {
  attachWorkspaceSyntaxProfile,
  type WorkspaceContext,
} from "../../../workspace/context/workspaceContext";
import {
  createDefaultWorkspaceSyntaxFile,
  parseWorkspaceSyntaxSource,
  type WorkspaceSyntaxFile,
  workspaceSyntaxFileName,
} from "../../../workspace/context/workspaceSyntaxFile";
import {
  loadWorkspaceSessionSnapshot,
  loadWorkspaceSyntaxSessionSnapshot,
} from "./sessionRepositorySnapshot";

export type { WorkspaceSaveStatus } from "./workspaceSaveQueue";
export type { SessionCommands } from "./sessionCommands";

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

function getErrorMessage(error: unknown, fallbackMessage: string) {
  return error instanceof Error ? error.message : fallbackMessage;
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
    (): SessionCommands => createSessionCommands({
      commitDataSnapshot,
      workspace,
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

    void loadWorkspaceSessionSnapshot(repository)
      .then((snapshot) => {
        if (!isActive) {
          return;
        }

        setRepositoryPath(snapshot.repositoryPath);
        setWorkspaceSyntaxFile(snapshot.workspaceSyntaxFile);
        commitDataSnapshot(snapshot.workspaceData);
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
      const snapshot = await loadWorkspaceSessionSnapshot(repository);

      setRepositoryPath(snapshot.repositoryPath);
      setWorkspaceSyntaxFile(snapshot.workspaceSyntaxFile);
      commitDataSnapshot(snapshot.workspaceData);
      setSaveStatus("idle");
      setIsLoaded(true);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "工作区加载失败。"));
      setSaveStatus("error");
    }
  };

  const refreshSyntaxState = async () => {
    const snapshot = await loadWorkspaceSyntaxSessionSnapshot(repository);

    setWorkspaceSyntaxFile(snapshot.workspaceSyntaxFile);
    commitDataSnapshot(snapshot.workspaceData);
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

    await repository.setRepositoryPath(nextPath);

    const snapshot = await loadWorkspaceSessionSnapshot(repository);

    setRepositoryPath(snapshot.repositoryPath);
    setWorkspaceSyntaxFile(snapshot.workspaceSyntaxFile);
    commitDataSnapshot(snapshot.workspaceData);
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
