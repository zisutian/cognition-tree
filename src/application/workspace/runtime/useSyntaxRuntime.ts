import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildSyntaxProfileDraft,
  createSyntaxProfileDraft,
  type SyntaxProfileDraft,
} from "../../../../ctn/syntax/profileDraft";
import { formatSyntaxProfileToml } from "../../../../ctn/syntax/profileToml";
import type { CtnSyntaxProfile } from "../../../../ctn/syntax/types";
import {
  attachWorkspaceSyntaxProfile,
} from "../../../workspace/context/workspaceContext";
import type { WorkspaceStructureIndex } from "../../../workspace/indexes/workspaceStructureIndex";
import { normalizeWorkspaceSyntaxProfileName } from "../../../storage/repository/workspaceRepository";

type UseSyntaxRuntimeOptions = {
  activeFileId: string | null;
  createSyntaxFile: () => Promise<void>;
  deleteSyntaxFile: (fileId: string) => Promise<void>;
  files: Array<{ id: string; name: string; source: string }>;
  selectSyntaxFile: (fileId: string) => Promise<void>;
  syntaxProfile: CtnSyntaxProfile;
  syntaxSource: string;
  updateActiveSyntaxFileSource: (source: string) => Promise<void>;
  workspace: WorkspaceStructureIndex | null;
};

export function findSyntaxCatalogNameConflict({
  activeFileId,
  candidateName,
  files,
}: {
  activeFileId: string | null;
  candidateName: string;
  files: Array<{ id: string; name: string }>;
}) {
  if (activeFileId === null) {
    return "";
  }

  const candidateKey = normalizeWorkspaceSyntaxProfileName(candidateName);
  const conflict = files.find(
    ({ id, name }) =>
      id !== activeFileId &&
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
  activeFileId,
  draft,
  files,
  lastPersistedSource,
  persist,
}: {
  activeFileId: string | null;
  draft: SyntaxProfileDraft;
  files: Array<{ id: string; name: string }>;
  lastPersistedSource: string;
  persist: (source: string) => Promise<void>;
}) {
  const result = buildSyntaxProfileDraft(draft);
  const catalogNameConflictMessage = result.profile
    ? findSyntaxCatalogNameConflict({
        activeFileId,
        candidateName: result.profile.name,
        files,
      })
    : "";

  if (activeFileId === null || catalogNameConflictMessage) {
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

export function startSyntaxCatalogMutation({
  draftIsValid,
  mutate,
}: {
  draftIsValid: boolean;
  mutate: () => Promise<void>;
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

export function useSyntaxRuntime({
  activeFileId,
  createSyntaxFile,
  deleteSyntaxFile,
  files,
  selectSyntaxFile,
  syntaxProfile,
  syntaxSource,
  updateActiveSyntaxFileSource,
  workspace,
}: UseSyntaxRuntimeOptions) {
  const [syntaxDraft, setSyntaxDraft] = useState(() =>
    createSyntaxProfileDraft(syntaxProfile),
  );
  const draftEditVersionRef = useRef(0);
  const lastPersistedSyntaxSourceRef = useRef("");
  const latestDraftSourceRef = useRef<string | null>(null);
  const activeFileIdRef = useRef(activeFileId);
  const filesRef = useRef(files);
  const lastActiveFileIdRef = useRef(activeFileId);
  const updateActiveSyntaxFileSourceRef = useRef(updateActiveSyntaxFileSource);
  const persistenceActiveRef = useRef(false);
  const syntaxDraftResult = useMemo(
    () => buildSyntaxProfileDraft(syntaxDraft),
    [syntaxDraft],
  );
  const catalogNameConflictMessage = useMemo(
    () => syntaxDraftResult.profile
      ? findSyntaxCatalogNameConflict({
          activeFileId,
          candidateName: syntaxDraftResult.profile.name,
          files,
        })
      : "",
    [activeFileId, files, syntaxDraftResult.profile],
  );
  const syntaxDraftSource = useMemo(
    () =>
      syntaxDraftResult.profile
        ? formatSyntaxProfileToml(syntaxDraftResult.profile)
        : null,
    [syntaxDraftResult.profile],
  );
  latestDraftSourceRef.current = syntaxDraftSource;
  activeFileIdRef.current = activeFileId;
  filesRef.current = files;
  updateActiveSyntaxFileSourceRef.current = updateActiveSyntaxFileSource;
  const effectiveContext = useMemo(
    () =>
      workspace
        ? attachWorkspaceSyntaxProfile(
            workspace,
            syntaxDraftResult.profile ?? syntaxProfile,
          )
        : null,
    [syntaxDraftResult.profile, syntaxProfile, workspace],
  );

  useEffect(() => {
    const previousPersistedSource = lastPersistedSyntaxSourceRef.current;

    if (lastActiveFileIdRef.current !== activeFileId) {
      draftEditVersionRef.current += 1;
      lastActiveFileIdRef.current = activeFileId;
      latestDraftSourceRef.current = syntaxSource;
    }

    lastPersistedSyntaxSourceRef.current = syntaxSource;
    setSyntaxDraft((currentDraft) =>
      resolveSyntaxDraftAfterPersistence({
        currentDraft,
        previousPersistedSource,
        syntaxProfile,
        syntaxSource,
      }),
    );
  }, [activeFileId, syntaxProfile, syntaxSource]);

  useEffect(() => {
    persistenceActiveRef.current = true;

    return () => {
      persistenceActiveRef.current = false;
    };
  }, []);

  const updateSyntaxDraft = useCallback((nextDraft: SyntaxProfileDraft) => {
    draftEditVersionRef.current += 1;
    const version = draftEditVersionRef.current;
    const completedFileId = activeFileIdRef.current;
    const persistence = startSyntaxFileDraftPersistence({
      activeFileId: completedFileId,
      draft: nextDraft,
      files: filesRef.current,
      lastPersistedSource: lastPersistedSyntaxSourceRef.current,
      persist: (source) => updateActiveSyntaxFileSourceRef.current(source),
    });

    latestDraftSourceRef.current = persistence.source;
    setSyntaxDraft(nextDraft);

    if (persistence.completion && persistence.source) {
      const source = persistence.source;

      void persistence.completion
        .then(() => {
          if (isCurrentSyntaxPersistenceCompletion({
            active: persistenceActiveRef.current,
            completedFileId,
            completedSource: source,
            completedVersion: version,
            currentFileId: activeFileIdRef.current,
            currentSource: latestDraftSourceRef.current,
            currentVersion: draftEditVersionRef.current,
          })) {
            lastPersistedSyntaxSourceRef.current = source;
          }
        })
        .catch(() => undefined);
    }
  }, []);

  const requireValidDraft = useCallback(
    (mutation: () => Promise<void>) => startSyntaxCatalogMutation({
      draftIsValid:
        syntaxDraftResult.profile !== null && !catalogNameConflictMessage,
      mutate: mutation,
    }),
    [catalogNameConflictMessage, syntaxDraftResult.profile],
  );
  const createFile = useCallback(
    () => requireValidDraft(createSyntaxFile),
    [createSyntaxFile, requireValidDraft],
  );
  const deleteFile = useCallback(
    (fileId: string) => requireValidDraft(() => deleteSyntaxFile(fileId)),
    [deleteSyntaxFile, requireValidDraft],
  );
  const selectFile = useCallback(
    (fileId: string) => requireValidDraft(() => selectSyntaxFile(fileId)),
    [requireValidDraft, selectSyntaxFile],
  );

  return {
    activeFileId,
    catalogNameConflictMessage,
    createSyntaxFile: createFile,
    deleteSyntaxFile: deleteFile,
    effectiveContext,
    files,
    isConfigured: activeFileId !== null,
    selectSyntaxFile: selectFile,
    syntaxDraft,
    syntaxDraftResult,
    updateSyntaxDraft,
  };
}

export type SyntaxRuntime = ReturnType<typeof useSyntaxRuntime>;
