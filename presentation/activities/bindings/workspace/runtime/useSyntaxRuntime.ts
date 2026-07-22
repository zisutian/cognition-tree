import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildSyntaxProfileDraft,
  createSyntaxProfileDraft,
  type SyntaxProfileDraft,
} from "../../../../../core/ctn/syntax/profileDraft";
import { formatSyntaxProfileToml } from "../../../../../core/ctn/syntax/profileToml";
import type { CtnSyntaxProfile } from "../../../../../core/ctn/syntax/types";
import {
  attachWorkspaceSyntaxProfile,
} from "../../../../../core/workspace/context/workspaceContext";
import { parseWorkspaceSyntax } from "../../../../../core/workspace/context/workspaceSyntax";
import type { WorkspaceStructureIndex } from "../../../../../core/workspace/indexes/workspaceStructureIndex";
import { normalizeWorkspaceSyntaxProfileName } from "../../../../../application/repository/workspaceRepository";

type WorkspaceSyntaxRuntimeFile = {
  id: string;
  name: string;
  source: string;
};

type UseSyntaxRuntimeOptions = {
  activeFileId: string | null;
  activateSyntaxFile: (fileId: string) => Promise<void>;
  activeSyntaxProfile: CtnSyntaxProfile | null;
  createSyntaxFile: (templateFileId: string | null) => Promise<string>;
  deleteSyntaxFile: (fileId: string) => Promise<void>;
  fallbackSyntaxProfile: CtnSyntaxProfile;
  files: WorkspaceSyntaxRuntimeFile[];
  updateSyntaxFileSource: (fileId: string, source: string) => Promise<void>;
  workspace: WorkspaceStructureIndex | null;
};

export function findSyntaxCatalogNameConflict({
  candidateName,
  files,
  selectedFileId,
}: {
  candidateName: string;
  files: Array<{ id: string; name: string }>;
  selectedFileId: string | null;
}) {
  if (selectedFileId === null) {
    return "";
  }

  const candidateKey = normalizeWorkspaceSyntaxProfileName(candidateName);
  const conflict = files.find(
    ({ id, name }) =>
      id !== selectedFileId &&
      normalizeWorkspaceSyntaxProfileName(name) === candidateKey,
  );

  return conflict
    ? `语法名称“${candidateName.trim()}”与“${conflict.name}”重名。`
    : "";
}

export function resolveSyntaxDraftAfterPersistence({
  currentDraft,
  previousPersistedSource,
  syntaxProfile,
  syntaxSource,
}: {
  currentDraft: SyntaxProfileDraft;
  previousPersistedSource: string;
  syntaxProfile: CtnSyntaxProfile;
  syntaxSource: string;
}) {
  const currentDraftResult = buildSyntaxProfileDraft(currentDraft);
  const currentDraftSource = currentDraftResult.profile
    ? formatSyntaxProfileToml(currentDraftResult.profile)
    : null;

  if (currentDraftSource === syntaxSource) {
    return currentDraft;
  }

  return !previousPersistedSource || currentDraftSource === previousPersistedSource
    ? createSyntaxProfileDraft(syntaxProfile)
    : currentDraft;
}

export function isCurrentSyntaxPersistenceCompletion({
  active,
  completedFileId,
  completedSource,
  completedVersion,
  currentFileId,
  currentSource,
  currentVersion,
}: {
  active: boolean;
  completedFileId?: string | null;
  completedSource: string;
  completedVersion: number;
  currentFileId?: string | null;
  currentSource: string | null;
  currentVersion: number;
}) {
  return active &&
    completedFileId === currentFileId &&
    completedVersion === currentVersion &&
    completedSource === currentSource;
}

export function startSyntaxDraftPersistence({
  draft,
  lastPersistedSource,
  persist,
}: {
  draft: SyntaxProfileDraft;
  lastPersistedSource: string;
  persist: (source: string) => Promise<void>;
}) {
  const result = buildSyntaxProfileDraft(draft);
  const source = result.profile
    ? formatSyntaxProfileToml(result.profile)
    : null;

  if (!source || source === lastPersistedSource) {
    return { completion: null, source };
  }

  try {
    return { completion: Promise.resolve(persist(source)), source };
  } catch (error) {
    return { completion: Promise.reject(error), source };
  }
}

export function startSyntaxFileDraftPersistence({
  draft,
  files,
  lastPersistedSource,
  persist,
  selectedFileId,
}: {
  draft: SyntaxProfileDraft;
  files: Array<{ id: string; name: string }>;
  lastPersistedSource: string;
  persist: (source: string) => Promise<void>;
  selectedFileId: string | null;
}) {
  const result = buildSyntaxProfileDraft(draft);
  const catalogNameConflictMessage = result.profile
    ? findSyntaxCatalogNameConflict({
        candidateName: result.profile.name,
        files,
        selectedFileId,
      })
    : "";

  if (selectedFileId === null || catalogNameConflictMessage) {
    return {
      catalogNameConflictMessage,
      completion: null,
      source: null,
    };
  }

  return {
    catalogNameConflictMessage,
    ...startSyntaxDraftPersistence({ draft, lastPersistedSource, persist }),
  };
}

export function startSyntaxCatalogMutation<T>({
  draftIsValid,
  mutate,
}: {
  draftIsValid: boolean;
  mutate: () => Promise<T>;
}) {
  if (!draftIsValid) {
    return Promise.reject(
      new Error("请先修复或撤销当前语法文件中的无效更改。"),
    );
  }

  try {
    return Promise.resolve(mutate());
  } catch (error) {
    return Promise.reject(error);
  }
}

function selectExistingFileId(
  requestedId: string | null,
  activeFileId: string | null,
  files: WorkspaceSyntaxRuntimeFile[],
) {
  return files.some(({ id }) => id === requestedId)
    ? requestedId
    : files.some(({ id }) => id === activeFileId)
      ? activeFileId
      : files[0]?.id ?? null;
}

export function useSyntaxRuntime({
  activeFileId,
  activateSyntaxFile,
  activeSyntaxProfile,
  createSyntaxFile,
  deleteSyntaxFile,
  fallbackSyntaxProfile,
  files,
  updateSyntaxFileSource,
  workspace,
}: UseSyntaxRuntimeOptions) {
  const [selectedFileId, setSelectedFileId] = useState<string | null>(() =>
    selectExistingFileId(activeFileId, activeFileId, files)
  );
  const selectedFile = files.find(({ id }) => id === selectedFileId) ?? null;
  const selectedSyntax = selectedFile
    ? parseWorkspaceSyntax(selectedFile.source)
    : null;
  const [syntaxDraft, setSyntaxDraft] = useState(() =>
    createSyntaxProfileDraft(selectedSyntax?.profile ?? fallbackSyntaxProfile)
  );
  const draftEditVersionRef = useRef(0);
  const lastPersistedSyntaxSourceRef = useRef(selectedFile?.source ?? "");
  const latestDraftSourceRef = useRef<string | null>(selectedFile?.source ?? null);
  const selectedFileIdRef = useRef(selectedFileId);
  const filesRef = useRef(files);
  const lastSelectedFileIdRef = useRef(selectedFileId);
  const updateSyntaxFileSourceRef = useRef(updateSyntaxFileSource);
  const persistenceActiveRef = useRef(false);
  const syntaxDraftResult = useMemo(
    () => buildSyntaxProfileDraft(syntaxDraft),
    [syntaxDraft],
  );
  const catalogNameConflictMessage = useMemo(
    () => syntaxDraftResult.profile
      ? findSyntaxCatalogNameConflict({
          candidateName: syntaxDraftResult.profile.name,
          files,
          selectedFileId,
        })
      : "",
    [files, selectedFileId, syntaxDraftResult.profile],
  );
  const syntaxDraftSource = useMemo(
    () => syntaxDraftResult.profile
      ? formatSyntaxProfileToml(syntaxDraftResult.profile)
      : null,
    [syntaxDraftResult.profile],
  );
  latestDraftSourceRef.current = syntaxDraftSource;
  selectedFileIdRef.current = selectedFileId;
  filesRef.current = files;
  updateSyntaxFileSourceRef.current = updateSyntaxFileSource;

  useEffect(() => {
    const resolved = selectExistingFileId(selectedFileId, activeFileId, files);

    if (resolved !== selectedFileId) {
      setSelectedFileId(resolved);
    }
  }, [activeFileId, files, selectedFileId]);

  useEffect(() => {
    if (!selectedFile || !selectedSyntax) {
      return;
    }
    const previousPersistedSource = lastPersistedSyntaxSourceRef.current;

    if (lastSelectedFileIdRef.current !== selectedFile.id) {
      draftEditVersionRef.current += 1;
      lastSelectedFileIdRef.current = selectedFile.id;
      latestDraftSourceRef.current = selectedFile.source;
      lastPersistedSyntaxSourceRef.current = selectedFile.source;
      setSyntaxDraft(createSyntaxProfileDraft(selectedSyntax.profile));
      return;
    }

    lastPersistedSyntaxSourceRef.current = selectedFile.source;
    setSyntaxDraft((currentDraft) =>
      resolveSyntaxDraftAfterPersistence({
        currentDraft,
        previousPersistedSource,
        syntaxProfile: selectedSyntax.profile,
        syntaxSource: selectedFile.source,
      })
    );
  }, [selectedFile?.id, selectedFile?.source, selectedSyntax?.profile]);

  useEffect(() => {
    persistenceActiveRef.current = true;
    return () => {
      persistenceActiveRef.current = false;
    };
  }, []);

  const updateSyntaxDraft = useCallback((nextDraft: SyntaxProfileDraft) => {
    draftEditVersionRef.current += 1;
    const version = draftEditVersionRef.current;
    const completedFileId = selectedFileIdRef.current;
    const persistence = startSyntaxFileDraftPersistence({
      draft: nextDraft,
      files: filesRef.current,
      lastPersistedSource: lastPersistedSyntaxSourceRef.current,
      persist: (source) => {
        if (!completedFileId) {
          return Promise.resolve();
        }
        return updateSyntaxFileSourceRef.current(completedFileId, source);
      },
      selectedFileId: completedFileId,
    });

    latestDraftSourceRef.current = persistence.source;
    setSyntaxDraft(nextDraft);

    if (persistence.completion && persistence.source) {
      const source = persistence.source;

      void persistence.completion.then(() => {
        if (isCurrentSyntaxPersistenceCompletion({
          active: persistenceActiveRef.current,
          completedFileId,
          completedSource: source,
          completedVersion: version,
          currentFileId: selectedFileIdRef.current,
          currentSource: latestDraftSourceRef.current,
          currentVersion: draftEditVersionRef.current,
        })) {
          lastPersistedSyntaxSourceRef.current = source;
        }
      }).catch(() => undefined);
    }
  }, []);

  const draftIsValid = syntaxDraftResult.profile !== null &&
    !catalogNameConflictMessage;
  const requireValidDraft = useCallback(
    <T,>(mutation: () => Promise<T>) =>
      startSyntaxCatalogMutation({
        draftIsValid,
        mutate: mutation,
      }),
    [draftIsValid],
  );
  const selectFile = useCallback(
    (fileId: string) => requireValidDraft(async () => {
      if (!filesRef.current.some(({ id }) => id === fileId)) {
        throw new Error(`Workspace syntax file does not exist: ${fileId}`);
      }
      setSelectedFileId(fileId);
    }),
    [requireValidDraft],
  );
  const createFile = useCallback(
    () => requireValidDraft(async () => {
      const fileId = await createSyntaxFile(selectedFileIdRef.current);
      setSelectedFileId(fileId);
      return fileId;
    }),
    [createSyntaxFile, requireValidDraft],
  );
  const deleteFile = useCallback(
    (fileId: string) => requireValidDraft(async () => {
      const currentFiles = filesRef.current;
      const fileIndex = currentFiles.findIndex(({ id }) => id === fileId);
      const nextSelection = currentFiles[fileIndex + 1]?.id ??
        currentFiles[fileIndex - 1]?.id ?? null;

      await deleteSyntaxFile(fileId);
      if (selectedFileIdRef.current === fileId) {
        setSelectedFileId(nextSelection);
      }
    }),
    [deleteSyntaxFile, requireValidDraft],
  );
  const enableFile = useCallback(
    (fileId: string) => requireValidDraft(() => activateSyntaxFile(fileId)),
    [activateSyntaxFile, requireValidDraft],
  );
  const revertDraft = useCallback(() => {
    const currentFile = filesRef.current.find(
      ({ id }) => id === selectedFileIdRef.current,
    );

    if (!currentFile) {
      return;
    }
    draftEditVersionRef.current += 1;
    lastPersistedSyntaxSourceRef.current = currentFile.source;
    latestDraftSourceRef.current = currentFile.source;
    setSyntaxDraft(createSyntaxProfileDraft(
      parseWorkspaceSyntax(currentFile.source).profile,
    ));
  }, []);
  const effectiveContext = useMemo(
    () => workspace && activeSyntaxProfile
      ? attachWorkspaceSyntaxProfile(workspace, activeSyntaxProfile)
      : null,
    [activeSyntaxProfile, workspace],
  );

  return {
    activeFileId,
    catalogNameConflictMessage,
    createSyntaxFile: createFile,
    deleteSyntaxFile: deleteFile,
    effectiveContext,
    enableSyntaxFile: enableFile,
    files,
    hasDraftErrors: !draftIsValid,
    isConfigured: activeFileId !== null,
    revertSyntaxDraft: revertDraft,
    selectedFileId,
    selectSyntaxFile: selectFile,
    syntaxDraft,
    syntaxDraftResult,
    updateSyntaxDraft,
  };
}

export type SyntaxRuntime = ReturnType<typeof useSyntaxRuntime>;
