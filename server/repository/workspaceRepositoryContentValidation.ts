// SPDX-License-Identifier: GPL-3.0-or-later

import { parseSyntaxProfileToml } from "../../core/ctn/syntax/profileToml.ts";
import { WorkspaceRepositoryContractError } from "../../contracts/workspace-repository/contractValue.ts";
import { normalizeRepositorySyntaxProfileName } from "../../contracts/workspace-repository/parseSyntax.ts";
import type { RepositorySyntaxCatalogDto } from "../../contracts/workspace-repository/types.ts";

/**
 * Server-side semantic validation for untrusted HTTP and persisted adapter
 * content. The wire contract owns catalog shape; CTN remains the sole syntax
 * parser and supplies the profile name used for catalog uniqueness.
 */
export function validateWorkspaceRepositorySyntax(
  syntax: RepositorySyntaxCatalogDto,
) {
  const profileNames = new Set<string>();
  let activeSource: string | null = null;

  for (let index = 0; index < syntax.files.length; index += 1) {
    const file = syntax.files[index];
    if (!file) continue;
    const result = parseSyntaxProfileToml(file.source);
    if (!result.profile) {
      throw new WorkspaceRepositoryContractError(
        `$.syntax.files[${index}].source`,
        "invalid syntax profile source",
      );
    }
    const nameKey = normalizeRepositorySyntaxProfileName(result.profile.name);
    if (profileNames.has(nameKey)) {
      throw new WorkspaceRepositoryContractError(
        `$.syntax.files[${index}].source`,
        `duplicate syntax profile name ${result.profile.name}`,
      );
    }
    profileNames.add(nameKey);
    if (file.id === syntax.activeFileId) {
      activeSource = file.source;
    }
  }

  return { activeSource };
}
