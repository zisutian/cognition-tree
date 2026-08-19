// SPDX-License-Identifier: GPL-3.0-or-later

import { WorkspaceRepositoryContractError } from "../../../../contracts/workspace/contractValue.ts";
import type { RepositorySyntaxCatalogDto } from "../../../../contracts/workspace/types.ts";
import {
  prepareWorkspaceSyntaxCatalog,
  type WorkspaceSyntaxCatalogPreparation,
} from "../../../../application/workspace/persistence/workspaceRepositoryPreparation.ts";

/**
 * Server-side semantic validation for untrusted HTTP and persisted adapter
 * content. The wire contract owns catalog shape; CTN remains the sole syntax
 * compiler and supplies the syntax name used for catalog uniqueness.
 */
export function validateWorkspaceRepositorySyntax(
  syntax: RepositorySyntaxCatalogDto,
  previous?: WorkspaceSyntaxCatalogPreparation | null,
) {
  try {
    const prepared = prepareWorkspaceSyntaxCatalog(syntax, { previous });

    return {
      activeSource: prepared.workspaceSyntax?.source ?? null,
      activeSyntax: prepared.workspaceSyntax,
      syntaxById: prepared.syntaxById,
    };
  } catch (error) {
    throw new WorkspaceRepositoryContractError(
      "$.syntax",
      error instanceof Error ? error.message : "invalid syntax catalog",
    );
  }
}
