import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  createInitialWorkspace,
  type NoteWorkspace,
} from "../domain/notes";
import { defaultCtnSyntaxProfile } from "../syntax/defaultSyntaxProfile";
import type { WorkspaceSyntaxFile } from "../storage/workspaceRepository";
import { createRuntimeWorkspaceRepository } from "../storage/runtimeWorkspaceRepository";

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
};

function applySyntaxFileToWorkspace(
  workspace: NoteWorkspace | null,
  syntaxFile: WorkspaceSyntaxFile,
) {
  if (!workspace) {
    return createInitialWorkspace(syntaxFile.profile);
  }

  return {
    ...workspace,
    syntaxProfile: syntaxFile.profile,
  };
}

function assertWorkspaceSyntaxFile(value: unknown): WorkspaceSyntaxFile {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    typeof (value as Partial<WorkspaceSyntaxFile>).fileName !== "string" ||
    typeof (value as Partial<WorkspaceSyntaxFile>).source !== "string" ||
    typeof (value as Partial<WorkspaceSyntaxFile>).profile !== "object" ||
    (value as Partial<WorkspaceSyntaxFile>).profile === null
  ) {
    throw new Error("仓库语法响应格式无效。");
  }

  return value as WorkspaceSyntaxFile;
}

function getErrorMessage(error: unknown, fallbackMessage: string) {
  return error instanceof Error ? error.message : fallbackMessage;
}

export function useRepositorySession(): UseRepositorySessionResult {
  const repository = useMemo(() => createRuntimeWorkspaceRepository(), []);
  const [workspace, setWorkspace] = useState<NoteWorkspace>(() => {
    return createInitialWorkspace(defaultCtnSyntaxProfile);
  });
  const [isWorkspaceLoaded, setIsWorkspaceLoaded] = useState(false);
  const [workspaceErrorMessage, setWorkspaceErrorMessage] = useState("");
  const [repositoryPath, setRepositoryPath] = useState("");
  const [syntaxFile, setSyntaxFile] = useState<WorkspaceSyntaxFile>({
    fileName: "workspace.toml",
    profile: defaultCtnSyntaxProfile,
    source: "",
  });

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

        const nextSyntaxFile = assertWorkspaceSyntaxFile(storedSyntaxFile);

        setRepositoryPath(repositoryInfo.path);
        setSyntaxFile(nextSyntaxFile);
        setWorkspace(
          applySyntaxFileToWorkspace(storedWorkspace, nextSyntaxFile),
        );
        setWorkspaceErrorMessage("");
        setIsWorkspaceLoaded(true);
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        setWorkspaceErrorMessage(getErrorMessage(error, "工作区加载失败。"));
        setIsWorkspaceLoaded(false);
      });

    return () => {
      isActive = false;
    };
  }, [repository]);

  useEffect(() => {
    if (!isWorkspaceLoaded) {
      return;
    }

    void repository.saveWorkspace(workspace);
  }, [isWorkspaceLoaded, repository, workspace]);

  const reloadWorkspace = async () => {
    setIsWorkspaceLoaded(false);
    setWorkspaceErrorMessage("");

    try {
      const [storedWorkspace, repositoryInfo, storedSyntaxFile] =
        await Promise.all([
          repository.loadWorkspace(),
          repository.getRepositoryInfo(),
          repository.readSyntaxFile(),
        ]);

      setRepositoryPath(repositoryInfo.path);
      const nextSyntaxFile = assertWorkspaceSyntaxFile(storedSyntaxFile);

      setSyntaxFile(nextSyntaxFile);
      setWorkspace(
        applySyntaxFileToWorkspace(storedWorkspace, nextSyntaxFile),
      );
      setIsWorkspaceLoaded(true);
    } catch (error) {
      setWorkspaceErrorMessage(getErrorMessage(error, "工作区加载失败。"));
    }
  };

  const refreshSyntaxState = async () => {
    const [storedWorkspace, storedSyntaxFile] = await Promise.all([
      repository.loadWorkspace(),
      repository.readSyntaxFile(),
    ]);

    const nextSyntaxFile = assertWorkspaceSyntaxFile(storedSyntaxFile);

    setSyntaxFile(nextSyntaxFile);
    setWorkspace(applySyntaxFileToWorkspace(storedWorkspace, nextSyntaxFile));
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

    const [storedWorkspace, repositoryInfo, storedSyntaxFile] = await Promise.all([
      repository.setRepositoryPath(nextPath),
      repository.getRepositoryInfo(),
      repository.readSyntaxFile(),
    ]);

    setRepositoryPath(repositoryInfo.path);
    const nextSyntaxFile = assertWorkspaceSyntaxFile(storedSyntaxFile);

    setSyntaxFile(nextSyntaxFile);
    setWorkspace(applySyntaxFileToWorkspace(storedWorkspace, nextSyntaxFile));
    setWorkspaceErrorMessage("");
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
  };
}
