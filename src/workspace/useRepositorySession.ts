import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  attachWorkspaceSyntaxProfile,
  createInitialWorkspace,
  toWorkspaceData,
  type NoteWorkspace,
  type WorkspaceData,
} from "../domain/notes";
import { createRuntimeWorkspaceRepository } from "../storage/runtimeWorkspaceRepository";
import type { WorkspaceSyntaxFile } from "../storage/workspaceRepository";
import { defaultCtnSyntaxProfile } from "../ctn-syntax/defaultSyntaxProfile";
import {
  createWorkspaceSaveQueue,
  type WorkspaceSaveStatus,
} from "./workspaceSaveQueue";

export type { WorkspaceSaveStatus } from "./workspaceSaveQueue";

type UseRepositorySessionResult = {
  canChangeRepositoryPath: boolean;
  changeRepositoryPath: (path: string) => Promise<void>;
  isWorkspaceLoaded: boolean;
  reloadWorkspace: () => Promise<void>;
  repositoryPath: string;
  setWorkspace: Dispatch<SetStateAction<NoteWorkspace>>;
  storageLabel: string;
  syntaxFile: WorkspaceSyntaxFile;
  updateSyntaxFile: (source: string) => Promise<void>;
  workspace: NoteWorkspace;
  workspaceErrorMessage: string;
  workspaceSaveStatus: WorkspaceSaveStatus;
};

function applySyntaxFileToWorkspace(
  workspace: WorkspaceData | null,
  syntaxFile: WorkspaceSyntaxFile,
) {
  return workspace
    ? attachWorkspaceSyntaxProfile(workspace, syntaxFile.profile)
    : createInitialWorkspace(syntaxFile.profile);
}

function getErrorMessage(error: unknown, fallbackMessage: string) {
  return error instanceof Error ? error.message : fallbackMessage;
}

export function useRepositorySession(): UseRepositorySessionResult {
  const repository = useMemo(() => createRuntimeWorkspaceRepository(), []);
  const [workspace, setWorkspace] = useState<NoteWorkspace>(() =>
    createInitialWorkspace(defaultCtnSyntaxProfile),
  );
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
        save: (nextWorkspace) => repository.saveWorkspace(nextWorkspace),
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
        setWorkspace(
          applySyntaxFileToWorkspace(storedWorkspace, storedSyntaxFile),
        );
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
      saveQueue.enqueue(toWorkspaceData(workspace));
    }
  }, [isWorkspaceLoaded, saveQueue, workspace]);

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
      setWorkspace(
        applySyntaxFileToWorkspace(storedWorkspace, storedSyntaxFile),
      );
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
    setWorkspace(applySyntaxFileToWorkspace(storedWorkspace, storedSyntaxFile));
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
    setWorkspace(applySyntaxFileToWorkspace(storedWorkspace, storedSyntaxFile));
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
    setWorkspace,
    storageLabel: repository.label,
    syntaxFile,
    updateSyntaxFile,
    workspace,
    workspaceErrorMessage,
    workspaceSaveStatus,
  };
}
