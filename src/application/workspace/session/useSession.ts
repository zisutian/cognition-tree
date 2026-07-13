import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createInitialWorkspaceData,
  type WorkspaceData,
} from "../../../workspace/model/workspaceData";
import {
  createWorkspaceStructureIndex,
  type WorkspaceStructureIndex,
} from "../../../workspace/indexes/workspaceStructureIndex";
import {
  createWorkspaceSessionSaveQueue,
  type WorkspaceSessionSaveStatus,
} from "./workspaceSessionSaveQueue";
import {
  createSessionCommands,
  type SessionCommands,
} from "./sessionCommands";
import {
  WorkspaceRepositoryConflictError,
  type WorkspaceRepository,
  type WorkspaceRepositoryContent,
} from "../../../storage/workspaceRepository";
import {
  attachWorkspaceSyntaxProfile,
  type WorkspaceContext,
} from "../../../workspace/context/workspaceContext";
import {
  createDefaultWorkspaceSyntaxFile,
  parseWorkspaceSyntaxSource,
  type WorkspaceSyntaxSourceFile,
  type WorkspaceSyntaxFile,
  workspaceSyntaxFileName,
} from "../../../workspace/context/workspaceSyntaxFile";
import { loadWorkspaceSessionSnapshot } from "./sessionRepositorySnapshot";

export type { WorkspaceSessionSaveStatus } from "./workspaceSessionSaveQueue";
export type { SessionCommands } from "./sessionCommands";

export type Session = {
  canChangeRepositoryPath: boolean;
  changeRepositoryPath: (path: string) => Promise<void>;
  discardPendingChangesAndReload: () => Promise<void>;
  hasSaveConflict: boolean;
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
  saveStatus: WorkspaceSessionSaveStatus;
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
    useState<WorkspaceSessionSaveStatus>("idle");
  const [repositoryPath, setRepositoryPath] = useState("");
  const [workspaceSyntaxFile, setWorkspaceSyntaxFile] =
    useState<WorkspaceSyntaxFile | null>(null);
  const [hasSaveConflict, setHasSaveConflict] = useState(false);
  const defaultWorkspaceSyntaxFile = useMemo(
    createDefaultWorkspaceSyntaxFile,
    [],
  );
  const isMountedRef = useRef(true);
  const repositoryRevisionRef = useRef("");
  const workspaceDataRef = useRef(workspaceData);
  const syntaxSourceFileRef = useRef<WorkspaceSyntaxSourceFile | null>(null);
  const latestSyntaxFileRef = useRef<WorkspaceSyntaxFile | null>(null);
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
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const saveQueue = useMemo(
    () =>
      createWorkspaceSessionSaveQueue({
        onError(error) {
          if (isMountedRef.current) {
            const isConflict =
              error instanceof WorkspaceRepositoryConflictError;

            setHasSaveConflict(isConflict);
            setErrorMessage(
              isConflict
                ? "磁盘中的仓库内容已更改，本地修改尚未保存。"
                : getErrorMessage(error, "工作区自动保存失败。"),
            );
          }
        },
        onStatusChange(status) {
          if (!isMountedRef.current) {
            return;
          }

          if (status === "saved") {
            setErrorMessage("");
            setHasSaveConflict(false);
          }

          setSaveStatus(status);
        },
        onContentSaved(content) {
          if (
            isMountedRef.current &&
            latestSyntaxFileRef.current?.source ===
              content.syntaxSourceFile?.source
          ) {
            setWorkspaceSyntaxFile(latestSyntaxFileRef.current);
          }
        },
        async save(content) {
          const result = await repository.commitSnapshot({
            ...content,
            baseRevision: repositoryRevisionRef.current,
          });

          repositoryRevisionRef.current = result.revision;
        },
      }),
    [repository],
  );
  const applySessionSnapshot = useCallback(
    (snapshot: Awaited<ReturnType<typeof loadWorkspaceSessionSnapshot>>) => {
      repositoryRevisionRef.current = snapshot.revision;
      workspaceDataRef.current = snapshot.workspaceData;
      syntaxSourceFileRef.current = snapshot.syntaxSourceFile;
      latestSyntaxFileRef.current = snapshot.workspaceSyntaxFile;
      setRepositoryPath(snapshot.repositoryPath);
      setWorkspaceSyntaxFile(snapshot.workspaceSyntaxFile);
      commitDataSnapshot(snapshot.workspaceData);
      setErrorMessage("");
      setHasSaveConflict(false);
      setSaveStatus("idle");
      setIsLoaded(true);
    },
    [],
  );
  const commitWorkspaceData = useCallback(
    (nextData: WorkspaceData) => {
      const content: WorkspaceRepositoryContent = {
        syntaxSourceFile: syntaxSourceFileRef.current,
        workspace: nextData,
      };

      workspaceDataRef.current = nextData;
      commitDataSnapshot(nextData);
      saveQueue.enqueue(content);
    },
    [saveQueue],
  );
  const commands = useMemo(
    (): SessionCommands => createSessionCommands({
      commitDataSnapshot: commitWorkspaceData,
      workspace,
    }),
    [commitWorkspaceData, workspace],
  );

  useEffect(() => {
    let isActive = true;

    void loadWorkspaceSessionSnapshot(repository)
      .then((snapshot) => {
        if (!isActive) {
          return;
        }

        applySessionSnapshot(snapshot);
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
  }, [applySessionSnapshot, repository]);

  const reload = async () => {
    setErrorMessage("");

    try {
      await saveQueue.flush();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "工作区保存失败，无法重新加载。"));
      return;
    }

    setIsLoaded(false);

    try {
      const snapshot = await loadWorkspaceSessionSnapshot(repository);

      applySessionSnapshot(snapshot);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "工作区加载失败。"));
      setSaveStatus("error");
    }
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

    try {
      await saveQueue.flush();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "工作区保存失败，无法切换仓库。"));
      return;
    }

    setIsLoaded(false);

    try {
      await repository.setRepositoryPath(nextPath);

      const snapshot = await loadWorkspaceSessionSnapshot(repository);

      applySessionSnapshot(snapshot);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "仓库切换失败。"));
      setSaveStatus("error");
    }
  };

  const updateWorkspaceSyntaxSource = async (source: string) => {
    try {
      const syntaxFile = parseWorkspaceSyntaxSource(
        workspaceSyntaxFileName,
        source,
      );
      const syntaxSourceFile = {
        fileName: syntaxFile.fileName,
        source: syntaxFile.source,
      };

      latestSyntaxFileRef.current = syntaxFile;
      syntaxSourceFileRef.current = syntaxSourceFile;
      await saveQueue.enqueueAndWait({
        syntaxSourceFile,
        workspace: workspaceDataRef.current,
      });
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
  const discardPendingChangesAndReload = async () => {
    setIsLoaded(false);

    try {
      await saveQueue.discardPendingChanges();
      applySessionSnapshot(await loadWorkspaceSessionSnapshot(repository));
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "工作区加载失败。"));
      setSaveStatus("error");
    }
  };

  return {
    canChangeRepositoryPath: Boolean(repository.setRepositoryPath),
    changeRepositoryPath,
    discardPendingChangesAndReload,
    hasSaveConflict,
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
