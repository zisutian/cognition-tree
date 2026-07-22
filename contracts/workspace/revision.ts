// SPDX-License-Identifier: GPL-3.0-or-later

import { failContract } from "./contractValue.ts";
import type {
  RepositoryRevisionDto,
  WorkspaceRepositoryContentDto,
} from "./types.ts";
import { serializeJsonIteratively } from "./json.ts";

const repositoryRevisionPattern = /^sha256:[0-9a-f]{64}$/;

function compareCanonicalStrings(left: string, right: string) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

export function parseRepositoryRevision(
  value: string,
  path = "$",
): RepositoryRevisionDto {
  if (!repositoryRevisionPattern.test(value)) {
    failContract(path, "expected sha256 revision");
  }

  return value as RepositoryRevisionDto;
}

export function serializeWorkspaceRepositoryRevisionContent(
  content: WorkspaceRepositoryContentDto,
) {
  const canonicalContent: WorkspaceRepositoryContentDto = {
    ...content,
    workspace: {
      ...content.workspace,
      notes: [...content.workspace.notes].sort((left, right) =>
        compareCanonicalStrings(left.id, right.id)
      ),
    },
  };

  return serializeJsonIteratively(canonicalContent, { sortObjectKeys: true });
}
