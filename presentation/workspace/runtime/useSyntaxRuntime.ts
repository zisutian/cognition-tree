// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CtnCompiledSyntax } from "../../../core/ctn/index.ts";
import {
  attachWorkspaceSyntax,
  normalizeWorkspaceSyntaxName,
} from "../../../core/workspace/index.ts";
import type { WorkspaceStructureIndex } from "../../../core/workspace/index.ts";

import {
  useCtnSyntaxDraftRuntime,
} from "../../syntax/index.ts";

type WorkspaceSyntaxRuntimeFile = {
  id: string;
  name: string;
  source: string;
  syntax: CtnCompiledSyntax;
};

type UseSyntaxRuntimeOptions = {
  activeFileId: string | null;
  activateSyntaxFile: (fileId: string) => Promise<void>;
  activeSyntax: CtnCompiledSyntax | null;
  createSyntaxFile: (templateFileId: string | null) => Promise<string>;
  deleteSyntaxFile: (fileId: string) => Promise<void>;
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

  const candidateKey = normalizeWorkspaceSyntaxName(candidateName);
  const conflict = files.find(
    ({ id, name }) =>
      id !== selectedFileId &&
      normalizeWorkspaceSyntaxName(name) === candidateKey,
  );

  return conflict
    ? `语法名称“${candidateName.trim()}”与“${conflict.name}”重名。`
    : "";
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
  activeSyntax,
  createSyntaxFile,
  deleteSyntaxFile,
  files,
  updateSyntaxFileSource,
  workspace,
}: UseSyntaxRuntimeOptions) {
  const [selectedFileId, setSelectedFileId] = useState<string | null>(() =>
    selectExistingFileId(activeFileId, activeFileId, files)
  );
  const selectedFile = files.find(({ id }) => id === selectedFileId) ?? null;
  const selectedFileIdRef = useRef(selectedFileId);
  const filesRef = useRef(files);
  const updateSyntaxFileSourceRef = useRef(updateSyntaxFileSource);
  selectedFileIdRef.current = selectedFileId;
  filesRef.current = files;
  updateSyntaxFileSourceRef.current = updateSyntaxFileSource;
  const draftRuntime = useCtnSyntaxDraftRuntime({
    canPersist: (build) =>
      Boolean(
        build.result.syntax &&
          !findSyntaxCatalogNameConflict({
            candidateName: build.result.syntax.name,
            files: filesRef.current,
            selectedFileId: selectedFileIdRef.current,
          }),
      ),
    owner: "workspace",
    persist: (source) => {
      const fileId = selectedFileIdRef.current;

      return fileId
        ? updateSyntaxFileSourceRef.current(fileId, source)
        : Promise.resolve();
    },
    source: selectedFile
      ? {
          source: selectedFile.source,
          syntax: selectedFile.syntax,
        }
      : null,
    targetKey: selectedFileId,
  });
  const syntaxDraft = draftRuntime.draft;
  const syntaxDraftResult = draftRuntime.draftResult;
  const catalogNameConflictMessage = useMemo(
    () => syntaxDraftResult?.syntax
      ? findSyntaxCatalogNameConflict({
          candidateName: syntaxDraftResult.syntax.name,
          files,
          selectedFileId,
        })
      : "",
    [files, selectedFileId, syntaxDraftResult?.syntax],
  );

  useEffect(() => {
    const resolved = selectExistingFileId(selectedFileId, activeFileId, files);

    if (resolved !== selectedFileId) {
      setSelectedFileId(resolved);
    }
  }, [activeFileId, files, selectedFileId]);

  const draftIsValid = selectedFile === null || Boolean(
    syntaxDraftResult?.syntax && !catalogNameConflictMessage,
  );
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
  const effectiveContext = useMemo(
    () => workspace && activeSyntax
      ? attachWorkspaceSyntax(workspace, activeSyntax)
      : null,
    [activeSyntax, workspace],
  );

  return {
    activeFileId,
    catalogNameConflictMessage,
    createSyntaxFile: createFile,
    deleteSyntaxFile: deleteFile,
    effectiveContext,
    enableSyntaxFile: enableFile,
    files,
    hasDraftErrors: selectedFile !== null && !draftIsValid,
    isConfigured: activeFileId !== null,
    revertSyntaxDraft: draftRuntime.revertDraft,
    selectedFileId,
    selectSyntaxFile: selectFile,
    syntaxDraft,
    syntaxDraftResult,
    updateSyntaxDraft: draftRuntime.updateDraft,
  };
}

export type SyntaxRuntime = ReturnType<typeof useSyntaxRuntime>;
