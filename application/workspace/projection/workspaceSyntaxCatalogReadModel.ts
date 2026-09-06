// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnCompiledSyntax } from
  "../../../core/ctn/index.ts";
import type {
  WorkspaceSyntax,
  WorkspaceSyntaxCatalog,
} from "../../../core/workspace/index.ts";


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
