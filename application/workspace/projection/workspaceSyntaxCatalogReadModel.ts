// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnCompiledSyntax } from
  "../../../core/ctn/syntax/types";
import type { WorkspaceSyntax } from
  "../../../core/workspace/context/workspaceSyntax";
import type { WorkspaceSyntaxCatalog } from
  "../../../core/workspace/model/workspaceSyntaxCatalog";

export type WorkspaceSyntaxFileReadModel = {
  id: string;
  name: string;
  source: string;
  syntax: CtnCompiledSyntax;
};

export type WorkspaceSyntaxCatalogReadModel = {
  activeFileId: string | null;
  files: WorkspaceSyntaxFileReadModel[];
};

export function createWorkspaceSyntaxCatalogReadModel(
  catalog: WorkspaceSyntaxCatalog,
  syntaxById: ReadonlyMap<string, WorkspaceSyntax>,
): WorkspaceSyntaxCatalogReadModel {
  return {
    activeFileId: catalog.activeFileId,
    files: catalog.files.map((file) => {
      const prepared = syntaxById.get(file.id);

      if (!prepared || prepared.source !== file.source) {
        throw new Error(
          `Prepared Workspace syntax is unavailable: ${file.id}`,
        );
      }
      return {
        id: file.id,
        name: prepared.syntax.name,
        source: file.source,
        syntax: prepared.syntax,
      };
    }),
  };
}
