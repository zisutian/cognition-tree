// SPDX-License-Identifier: GPL-3.0-or-later

import {
  attachWorkspaceSyntax,
  parseWorkspaceSyntax,
  type WorkspaceSyntax,
  validateWorkspaceTitleBlockMetadata,
  createWorkspaceParseIndex,
  type WorkspaceParseIndex,
  createWorkspaceStructureIndex,
  isWorkspaceSyntaxFileId,
  normalizeWorkspaceSyntaxName,
  type WorkspaceSyntaxCatalog,
} from "../../../core/workspace/index.ts";




import type { CtnCanonicalSourceAnalysis } from "../../../core/ctn/index.ts";
import type { NoteId } from "../../../core/workspace/index.ts";

import type {
  WorkspaceRepositoryContent,
  WorkspaceRepositoryPreparation,
} from "./workspaceRepository.ts";

export type { WorkspaceRepositoryPreparation } from "./workspaceRepository.ts";

export type WorkspaceSyntaxCatalogPreparation = {
  syntaxById: ReadonlyMap<string, WorkspaceSyntax>;
  workspaceSyntax: WorkspaceSyntax | null;
};

export type WorkspaceRepositoryPreparationObserver = {
  onCtnAnalysis?(noteIds: readonly NoteId[]): void;
  onSemanticPreparation?(): void;
  onSyntaxCompile?(fileId: string): void;
};

export function prepareWorkspaceSyntaxCatalog(
  syntax: WorkspaceSyntaxCatalog,
  {
    observer,
    previous = null,
    syntaxOverrides,
  }: {
    observer?: WorkspaceRepositoryPreparationObserver;
    previous?: WorkspaceSyntaxCatalogPreparation | null;
    syntaxOverrides?: ReadonlyMap<string, WorkspaceSyntax>;
  } = {},
): WorkspaceSyntaxCatalogPreparation {
  const fileIds = new Set<string>();
  const syntaxNames = new Set<string>();
  const syntaxById = new Map<string, WorkspaceSyntax>();

  for (const file of syntax.files) {
    if (!isWorkspaceSyntaxFileId(file.id)) {
      throw new Error(`Invalid workspace syntax file id: ${file.id}`);
    }
    if (fileIds.has(file.id)) {
      throw new Error(`Duplicate workspace syntax file id: ${file.id}`);
    }
    fileIds.add(file.id);

    const preparedSyntax = syntaxOverrides?.get(file.id) ??
      previous?.syntaxById.get(file.id);
    let workspaceSyntax: WorkspaceSyntax;

    if (preparedSyntax?.source === file.source) {
      workspaceSyntax = preparedSyntax;
    } else {
      workspaceSyntax = parseWorkspaceSyntax(file.source);
      observer?.onSyntaxCompile?.(file.id);
    }
    const normalizedName = normalizeWorkspaceSyntaxName(
      workspaceSyntax.syntax.name,
    );

    if (syntaxNames.has(normalizedName)) {
      throw new Error(
        `Duplicate workspace syntax name: ${workspaceSyntax.syntax.name}`,
      );
    }
    syntaxNames.add(normalizedName);
    syntaxById.set(file.id, workspaceSyntax);
  }

  if (
    (syntax.files.length === 0 && syntax.activeFileId !== null) ||
    (
      syntax.activeFileId !== null &&
      !fileIds.has(syntax.activeFileId)
    )
  ) {
    throw new Error("Workspace syntax catalog has an invalid active file.");
  }

  return {
    syntaxById,
    workspaceSyntax: syntax.activeFileId === null
      ? null
      : syntaxById.get(syntax.activeFileId) ?? null,
  };
}

export function prepareWorkspaceRepositoryContent(
  content: WorkspaceRepositoryContent,
  {
    analysisOverrides,
    observer,
    previous = null,
    previousAnalysisIndex = null,
    syntaxOverrides,
  }: {
    analysisOverrides?: ReadonlyMap<NoteId, CtnCanonicalSourceAnalysis>;
    observer?: WorkspaceRepositoryPreparationObserver;
    previous?: WorkspaceRepositoryPreparation | null;
    previousAnalysisIndex?: WorkspaceParseIndex | null;
    syntaxOverrides?: ReadonlyMap<string, WorkspaceSyntax>;
  } = {},
): WorkspaceRepositoryPreparation {
  observer?.onSemanticPreparation?.();
  if (content.schemaVersion !== 4) {
    throw new Error("Workspace repository schema version must be 4.");
  }

  const { syntaxById, workspaceSyntax } = prepareWorkspaceSyntaxCatalog(
    content.syntax,
    { observer, previous, syntaxOverrides },
  );
  const workspace = createWorkspaceStructureIndex(content.workspace);
  const analysisIndex = workspaceSyntax
    ? createWorkspaceParseIndex(
        {
          analysisOverrides,
          syntax: workspaceSyntax.syntax,
          workspace,
        },
        previous?.analysisIndex ?? previousAnalysisIndex,
      )
    : null;

  if (!workspaceSyntax) {
    validateWorkspaceTitleBlockMetadata(content.workspace);
  }
  observer?.onCtnAnalysis?.(
    analysisIndex?.analysisStats.analyzedNoteIds ?? [],
  );

  return {
    analysisIndex,
    context: workspaceSyntax
      ? attachWorkspaceSyntax(workspace, workspaceSyntax.syntax)
      : null,
    syntaxById,
    workspace,
    workspaceSyntax,
  };
}
