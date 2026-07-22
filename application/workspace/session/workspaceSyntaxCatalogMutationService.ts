// SPDX-License-Identifier: GPL-3.0-or-later

import { formatSyntaxProfileToml } from "../../../core/ctn/syntax/profileToml";
import {
  createDefaultWorkspaceSyntax,
  parseWorkspaceSyntax,
  type WorkspaceSyntax,
} from "../../../core/workspace/context/workspaceSyntax";
import { reconcileWorkspaceSyntaxBlockMetadata } from "../../../core/workspace/context/workspaceSyntaxMetadata";
import {
  isWorkspaceSyntaxFileId,
  normalizeWorkspaceSyntaxProfileName,
  type WorkspaceSyntaxCatalog,
} from "../../../core/workspace/model/workspaceSyntaxCatalog";
import type { WorkspaceRepositoryContent } from "../../repository/workspaceRepository";

export type WorkspaceSyntaxCatalogMutation = {
  content: WorkspaceRepositoryContent;
  workspaceSyntax: WorkspaceSyntax | null;
};

export type CreatedWorkspaceSyntaxFile = WorkspaceSyntaxCatalogMutation & {
  fileId: string;
};

export type WorkspaceSyntaxCatalogMutationService = {
  activateFile(
    content: WorkspaceRepositoryContent,
    fileId: string,
  ): WorkspaceSyntaxCatalogMutation | null;
  createFile(
    content: WorkspaceRepositoryContent,
    templateFileId: string | null,
  ): CreatedWorkspaceSyntaxFile;
  deleteFile(
    content: WorkspaceRepositoryContent,
    fileId: string,
  ): WorkspaceSyntaxCatalogMutation;
  updateFileSource(
    content: WorkspaceRepositoryContent,
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
    const name = normalizeWorkspaceSyntaxProfileName(syntax.profile.name);

    if (names.has(name)) {
      throw new Error(
        `Duplicate workspace syntax profile name: ${syntax.profile.name}`,
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
      normalizeWorkspaceSyntaxProfileName(
        parseWorkspaceSyntax(source).profile.name,
      )
    ),
  );
  const copyName = `${template.profile.name} 副本`;
  let candidate = copyName;
  let suffix = 2;

  while (existingNames.has(normalizeWorkspaceSyntaxProfileName(candidate))) {
    candidate = `${copyName} ${suffix}`;
    suffix += 1;
  }

  return formatSyntaxProfileToml({ ...template.profile, name: candidate });
}

export function createWorkspaceSyntaxCatalogMutationService({
  createBlockId,
  createSyntaxFileId,
  defaultWorkspaceSyntax = createDefaultWorkspaceSyntax(),
  now,
}: {
  createBlockId(): string;
  createSyntaxFileId(): string;
  defaultWorkspaceSyntax?: WorkspaceSyntax;
  now(): string;
}): WorkspaceSyntaxCatalogMutationService {
  const applyCatalog = (
    content: WorkspaceRepositoryContent,
    catalog: WorkspaceSyntaxCatalog,
  ): WorkspaceSyntaxCatalogMutation => {
    const current = resolveSyntaxCatalog(content.syntax);
    const next = resolveSyntaxCatalog(catalog);
    const workspace = reconcileWorkspaceSyntaxBlockMetadata(
      content.workspace,
      current.workspaceSyntax?.profile ?? null,
      next.workspaceSyntax?.profile ?? null,
      { createBlockId, timestamp: now() },
    );

    return {
      content: { ...content, syntax: next.catalog, workspace },
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
    activateFile(content, fileId) {
      requireFile(content.syntax, fileId);
      if (content.syntax.activeFileId === fileId) return null;

      return applyCatalog(content, {
        ...content.syntax,
        activeFileId: fileId,
      });
    },
    createFile(content, templateFileId) {
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
      const mutation = applyCatalog(content, {
        activeFileId: content.syntax.activeFileId,
        files: [...content.syntax.files, { id: fileId, source }],
      });

      return { ...mutation, fileId };
    },
    deleteFile(content, fileId) {
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

      return applyCatalog(content, { activeFileId, files });
    },
    updateFileSource(content, fileId, source) {
      requireFile(content.syntax, fileId);

      return applyCatalog(content, {
        ...content.syntax,
        files: content.syntax.files.map((file) =>
          file.id === fileId ? { ...file, source } : file
        ),
      });
    },
  };
}
