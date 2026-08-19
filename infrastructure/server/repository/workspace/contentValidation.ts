// SPDX-License-Identifier: GPL-3.0-or-later

import { compileCtnSyntaxSource } from "../../../../core/ctn/syntax/compiler.ts";
import { WorkspaceRepositoryContractError } from "../../../../contracts/workspace/contractValue.ts";
import { normalizeRepositorySyntaxName } from "../../../../contracts/workspace/parseSyntax.ts";
import type { RepositorySyntaxCatalogDto } from "../../../../contracts/workspace/types.ts";

/**
 * Server-side semantic validation for untrusted HTTP and persisted adapter
 * content. The wire contract owns catalog shape; CTN remains the sole syntax
 * compiler and supplies the syntax name used for catalog uniqueness.
 */
export function validateWorkspaceRepositorySyntax(
  syntax: RepositorySyntaxCatalogDto,
) {
  const syntaxNames = new Set<string>();
  let activeSource: string | null = null;

  for (let index = 0; index < syntax.files.length; index += 1) {
    const file = syntax.files[index];
    if (!file) continue;
    const result = compileCtnSyntaxSource(file.source, "workspace");
    if (!result.syntax) {
      throw new WorkspaceRepositoryContractError(
        `$.syntax.files[${index}].source`,
        "invalid syntax source",
      );
    }
    const nameKey = normalizeRepositorySyntaxName(result.syntax.name);
    if (syntaxNames.has(nameKey)) {
      throw new WorkspaceRepositoryContractError(
        `$.syntax.files[${index}].source`,
        `duplicate syntax name ${result.syntax.name}`,
      );
    }
    syntaxNames.add(nameKey);
    if (file.id === syntax.activeFileId) {
      activeSource = file.source;
    }
  }

  return { activeSource };
}
