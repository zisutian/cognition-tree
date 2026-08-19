// SPDX-License-Identifier: GPL-3.0-or-later

import { formatCtnSyntaxV2 } from "../../../core/ctn/syntax/formatter";
import {
  parseWorkspaceSyntax,
  type WorkspaceSyntax,
} from "../../../core/workspace/context/workspaceSyntax";
import { reconcileWorkspaceSyntaxBlockMetadata } from "../../../core/workspace/context/workspaceSyntaxMetadata";
import {
  isWorkspaceSyntaxFileId,
  normalizeWorkspaceSyntaxName,
  type WorkspaceSyntaxCatalog,
} from "../../../core/workspace/model/workspaceSyntaxCatalog";
import type { WorkspaceRepositoryContent } from "../persistence/workspaceRepository";
import type { WorkspaceParseIndex } from "../../../core/workspace/indexes/workspaceParseIndex";
import type {
  CtnCanonicalSourceAnalysis,
} from "../../../core/ctn/analysis/sourceAnalysis";
import type { NoteId } from "../../../core/workspace/model/workspaceData";

export type WorkspaceSyntaxCatalogMutation = {
  analysisOverrides: ReadonlyMap<NoteId, CtnCanonicalSourceAnalysis>;
  content: WorkspaceRepositoryContent;
  workspaceSyntax: WorkspaceSyntax | null;
};

export type CreatedWorkspaceSyntaxFile = WorkspaceSyntaxCatalogMutation & {
  fileId: string;
};

export type WorkspaceSyntaxCatalogMutationService = {
  activateFile(
    content: WorkspaceRepositoryContent,
    index: WorkspaceParseIndex | null,
    fileId: string,
  ): WorkspaceSyntaxCatalogMutation | null;
  createFile(
    content: WorkspaceRepositoryContent,
    index: WorkspaceParseIndex | null,
    templateFileId: string | null,
  ): CreatedWorkspaceSyntaxFile;
  deleteFile(
    content: WorkspaceRepositoryContent,
    index: WorkspaceParseIndex | null,
    fileId: string,
  ): WorkspaceSyntaxCatalogMutation;
  updateFileSource(
    content: WorkspaceRepositoryContent,
    index: WorkspaceParseIndex | null,
    fileId: string,
    source: string,
  ): WorkspaceSyntaxCatalogMutation;
};

type ResolvedWorkspaceSyntaxCatalog = {
  catalog: WorkspaceSyntaxCatalog;
  workspaceSyntax: WorkspaceSyntax | null;
};

function resolveSyntaxCatalog(
  catalog: WorkspaceSyntaxCatalog,
): ResolvedWorkspaceSyntaxCatalog {
  const fileIds = new Set<string>();

  for (const { id } of catalog.files) {
    if (!isWorkspaceSyntaxFileId(id)) {
      throw new Error(`Invalid workspace syntax file id: ${id}`);
    }
    if (fileIds.has(id)) {
      throw new Error(`Duplicate workspace syntax file id: ${id}`);
    }
    fileIds.add(id);
  }
  if (
    (catalog.files.length === 0 && catalog.activeFileId !== null) ||
    (catalog.activeFileId !== null && !fileIds.has(catalog.activeFileId))
  ) {
    throw new Error("Workspace syntax catalog has an invalid active file");
  }

  const syntaxById = new Map(
    catalog.files.map((file) => [file.id, parseWorkspaceSyntax(file.source)]),
  );
  const names = new Set<string>();

  for (const syntax of syntaxById.values()) {
    const name = normalizeWorkspaceSyntaxName(syntax.syntax.name);

    if (names.has(name)) {
      throw new Error(
        `Duplicate workspace syntax name: ${syntax.syntax.name}`,
      );
    }
    names.add(name);
  }

  return {
    catalog,
    workspaceSyntax: catalog.activeFileId === null
      ? null
      : syntaxById.get(catalog.activeFileId) ?? null,
  };
}

function createSyntaxCopySource(
  catalog: WorkspaceSyntaxCatalog,
  template: WorkspaceSyntax,
) {
  const existingNames = new Set(
    catalog.files.map(({ source }) =>
      normalizeWorkspaceSyntaxName(
        parseWorkspaceSyntax(source).syntax.name,
      )
    ),
  );
  const copyName = `${template.syntax.name} 副本`;
  let candidate = copyName;
  let suffix = 2;

  while (existingNames.has(normalizeWorkspaceSyntaxName(candidate))) {
    candidate = `${copyName} ${suffix}`;
    suffix += 1;
  }

  return formatCtnSyntaxV2(
    { ...template.syntax.definition, name: candidate },
    "workspace",
  );
}

export function createWorkspaceSyntaxCatalogMutationService({
  createBlockId,
  createSyntaxFileId,
  defaultWorkspaceSyntax,
  now,
}: {
  createBlockId(): string;
  createSyntaxFileId(): string;
  defaultWorkspaceSyntax: WorkspaceSyntax;
  now(): string;
}): WorkspaceSyntaxCatalogMutationService {
  const applyCatalog = (
    content: WorkspaceRepositoryContent,
    index: WorkspaceParseIndex | null,
    catalog: WorkspaceSyntaxCatalog,
  ): WorkspaceSyntaxCatalogMutation => {
    const current = resolveSyntaxCatalog(content.syntax);
    const next = resolveSyntaxCatalog(catalog);
    if (
      (current.workspaceSyntax === null) !== (index === null) ||
      (
        current.workspaceSyntax &&
        index &&
        current.workspaceSyntax.syntax.analysisKey !== index.syntax.analysisKey
      )
    ) {
      throw new Error(
        "Workspace analysis index does not match the active syntax.",
      );
    }
    const reconciled = reconcileWorkspaceSyntaxBlockMetadata(
      content.workspace,
      index,
      next.workspaceSyntax?.syntax ?? null,
      { createBlockId, timestamp: now() },
    );

    return {
      analysisOverrides: reconciled.analysisOverrides,
      content: {
        ...content,
        syntax: next.catalog,
        workspace: reconciled.workspaceData,
      },
      workspaceSyntax: next.workspaceSyntax,
    };
  };
  const requireFile = (
    catalog: WorkspaceSyntaxCatalog,
    fileId: string,
  ) => {
    const file = catalog.files.find(({ id }) => id === fileId);

    if (!file) {
      throw new Error(`Workspace syntax file does not exist: ${fileId}`);
    }
    return file;
  };

  return {
    activateFile(content, index, fileId) {
      requireFile(content.syntax, fileId);
      if (content.syntax.activeFileId === fileId) return null;

      return applyCatalog(content, index, {
        ...content.syntax,
        activeFileId: fileId,
      });
    },
    createFile(content, index, templateFileId) {
      const fileId = createSyntaxFileId();

      if (content.syntax.files.some(({ id }) => id === fileId)) {
        throw new Error(`Workspace syntax file already exists: ${fileId}`);
      }
      const current = resolveSyntaxCatalog(content.syntax);
      const templateFile = templateFileId === null
        ? null
        : requireFile(content.syntax, templateFileId);
      const templateSyntax = templateFile
        ? parseWorkspaceSyntax(templateFile.source)
        : current.workspaceSyntax;
      const source = templateSyntax
        ? createSyntaxCopySource(content.syntax, templateSyntax)
        : defaultWorkspaceSyntax.source;
      const mutation = applyCatalog(content, index, {
        activeFileId: content.syntax.activeFileId,
        files: [...content.syntax.files, { id: fileId, source }],
      });

      return { ...mutation, fileId };
    },
    deleteFile(content, index, fileId) {
      const fileIndex = content.syntax.files.findIndex(
        ({ id }) => id === fileId,
      );

      if (fileIndex < 0) {
        throw new Error(`Workspace syntax file does not exist: ${fileId}`);
      }
      const files = content.syntax.files.filter(({ id }) => id !== fileId);
      const activeFileId = content.syntax.activeFileId === fileId
        ? content.syntax.files[fileIndex + 1]?.id ??
          content.syntax.files[fileIndex - 1]?.id ??
          null
        : content.syntax.activeFileId;

      return applyCatalog(content, index, { activeFileId, files });
    },
    updateFileSource(content, index, fileId, source) {
      requireFile(content.syntax, fileId);

      return applyCatalog(content, index, {
        ...content.syntax,
        files: content.syntax.files.map((file) =>
          file.id === fileId ? { ...file, source } : file
        ),
      });
    },
  };
}
