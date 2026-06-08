import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  createInitialWorkspace,
  createWorkspaceWithSyntaxProfiles,
  type NoteWorkspace,
} from "../domain/notes";
import { defaultCtnSyntaxProfile } from "../syntax/defaultSyntaxProfile";
import { formatSyntaxProfileToml } from "../syntax/profileToml";
import type { SyntaxProfileFile } from "../storage/workspaceRepository";
import { createRuntimeWorkspaceRepository } from "../storage/runtimeWorkspaceRepository";

type UseRepositorySessionResult = {
  canChangeRepositoryPath: boolean;
  changeRepositoryPath: (path: string) => Promise<void>;
  createSyntaxFile: (fileName: string) => Promise<void>;
  deleteSyntaxFile: (fileName: string) => Promise<void>;
  isWorkspaceLoaded: boolean;
  reloadWorkspace: () => Promise<void>;
  repositoryPath: string;
  setWorkspace: Dispatch<SetStateAction<NoteWorkspace>>;
  storageLabel: string;
  syntaxFiles: SyntaxProfileFile[];
  updateSyntaxFile: (fileName: string, source: string) => Promise<void>;
  workspace: NoteWorkspace;
  workspaceErrorMessage: string;
};

function applySyntaxFilesToWorkspace(
  workspace: NoteWorkspace | null,
  syntaxFiles: SyntaxProfileFile[],
) {
  const syntaxProfiles = syntaxFiles.map((file) => file.profile);

  if (!workspace) {
    return createWorkspaceWithSyntaxProfiles(syntaxProfiles);
  }

  return {
    ...workspace,
    syntaxProfiles,
  };
}

function createSyntaxTemplateSource(fileName: string) {
  const id =
    fileName
      .replace(/\.toml$/i, "")
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, "-") || "ctn-custom";

  return formatSyntaxProfileToml({
    ...defaultCtnSyntaxProfile,
    id,
    name: id,
  });
}

function getErrorMessage(error: unknown, fallbackMessage: string) {
  return error instanceof Error ? error.message : fallbackMessage;
}

export function useRepositorySession(): UseRepositorySessionResult {
  const repository = useMemo(() => createRuntimeWorkspaceRepository(), []);
  const [workspace, setWorkspace] = useState<NoteWorkspace>(() => {
    return createInitialWorkspace([defaultCtnSyntaxProfile]);
  });
  const [isWorkspaceLoaded, setIsWorkspaceLoaded] = useState(false);
  const [workspaceErrorMessage, setWorkspaceErrorMessage] = useState("");
  const [repositoryPath, setRepositoryPath] = useState("");
  const [syntaxFiles, setSyntaxFiles] = useState<SyntaxProfileFile[]>([]);

  useEffect(() => {
    let isActive = true;

    void Promise.all([
      repository.loadWorkspace(),
      repository.getRepositoryInfo(),
      repository.listSyntaxFiles(),
    ])
      .then(([storedWorkspace, repositoryInfo, storedSyntaxFiles]) => {
        if (!isActive) {
          return;
        }

        setRepositoryPath(repositoryInfo.path);
        setSyntaxFiles(storedSyntaxFiles);
        setWorkspace(
          applySyntaxFilesToWorkspace(storedWorkspace, storedSyntaxFiles),
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
      const [storedWorkspace, repositoryInfo, storedSyntaxFiles] =
        await Promise.all([
          repository.loadWorkspace(),
          repository.getRepositoryInfo(),
          repository.listSyntaxFiles(),
        ]);

      setRepositoryPath(repositoryInfo.path);
      setSyntaxFiles(storedSyntaxFiles);
      setWorkspace(
        applySyntaxFilesToWorkspace(storedWorkspace, storedSyntaxFiles),
      );
      setIsWorkspaceLoaded(true);
    } catch (error) {
      setWorkspaceErrorMessage(getErrorMessage(error, "工作区加载失败。"));
    }
  };

  const refreshSyntaxState = async () => {
    const [storedWorkspace, storedSyntaxFiles] = await Promise.all([
      repository.loadWorkspace(),
      repository.listSyntaxFiles(),
    ]);

    setSyntaxFiles(storedSyntaxFiles);
    setWorkspace(applySyntaxFilesToWorkspace(storedWorkspace, storedSyntaxFiles));
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

    const [storedWorkspace, repositoryInfo, storedSyntaxFiles] = await Promise.all([
      repository.setRepositoryPath(nextPath),
      repository.getRepositoryInfo(),
      repository.listSyntaxFiles(),
    ]);

    setRepositoryPath(repositoryInfo.path);
    setSyntaxFiles(storedSyntaxFiles);
    setWorkspace(applySyntaxFilesToWorkspace(storedWorkspace, storedSyntaxFiles));
    setWorkspaceErrorMessage("");
    setIsWorkspaceLoaded(true);
  };

  const createSyntaxFile = async (fileName: string) => {
    const nextFileName = fileName.trim();

    if (!nextFileName) {
      return;
    }

    await repository.saveSyntaxFile(
      nextFileName,
      createSyntaxTemplateSource(nextFileName),
    );
    await refreshSyntaxState();
  };

  const updateSyntaxFile = async (fileName: string, source: string) => {
    await repository.saveSyntaxFile(fileName, source);
    await refreshSyntaxState();
  };

  const deleteSyntaxFile = async (fileName: string) => {
    await repository.deleteSyntaxFile(fileName);
    await refreshSyntaxState();
  };

  return {
    canChangeRepositoryPath: Boolean(repository.canChangeRepositoryPath),
    changeRepositoryPath,
    createSyntaxFile,
    deleteSyntaxFile,
    isWorkspaceLoaded,
    reloadWorkspace,
    repositoryPath,
    setWorkspace,
    storageLabel: repository.label,
    syntaxFiles,
    updateSyntaxFile,
    workspace,
    workspaceErrorMessage,
  };
}
