// SPDX-License-Identifier: GPL-3.0-or-later

import { buildCtnSyntaxDraft, createCtnSyntaxDraft, type CtnSyntaxDraft } from "../../core/ctn/syntax/draft.ts";
import { formatCtnSyntaxV2 } from "../../core/ctn/syntax/formatter.ts";
import type { CtnCompiledSyntax, CtnSyntaxOwner } from "../../core/ctn/syntax/types.ts";

export function createCtnSyntaxDraftSource(
  draft: CtnSyntaxDraft,
  owner: CtnSyntaxOwner,
) {
  const result = buildCtnSyntaxDraft(draft, owner);

  return {
    result,
    source: result.syntax
      ? formatCtnSyntaxV2(result.definition, owner)
      : null,
  };
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

export function resolveCtnSyntaxDraftAfterSourceChange({
  currentDraft,
  owner,
  previousPersistedSource,
  syntax,
  syntaxSource,
}: {
  currentDraft: CtnSyntaxDraft;
  owner: CtnSyntaxOwner;
  previousPersistedSource: string;
  syntax: CtnCompiledSyntax;
  syntaxSource: string;
}) {
  const currentDraftSource = createCtnSyntaxDraftSource(
    currentDraft,
    owner,
  ).source;

  if (currentDraftSource === syntaxSource) {
    return currentDraft;
  }
  return !previousPersistedSource ||
      currentDraftSource === previousPersistedSource
    ? createCtnSyntaxDraft(syntax)
    : currentDraft;
}

export function startCtnSyntaxDraftPersistence({
  canPersist = true,
  draft,
  lastPersistedSource,
  owner,
  persist,
}: {
  canPersist?:
    | boolean
    | ((build: ReturnType<typeof createCtnSyntaxDraftSource>) => boolean);
  draft: CtnSyntaxDraft;
  lastPersistedSource: string;
  owner: CtnSyntaxOwner;
  persist: (source: string) => Promise<void>;
}) {
  const build = createCtnSyntaxDraftSource(draft, owner);
  const source = build.source;
  const persistenceAllowed = typeof canPersist === "function"
    ? canPersist(build)
    : canPersist;

  if (!persistenceAllowed || !source || source === lastPersistedSource) {
    return { completion: null, source };
  }

  try {
    return { completion: Promise.resolve(persist(source)), source };
  } catch (error) {
    return { completion: Promise.reject(error), source };
  }
}

export type CtnSyntaxDraftRuntimeSource = {
  source: string;
  syntax: CtnCompiledSyntax;
};
