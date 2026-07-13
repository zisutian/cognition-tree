// SPDX-License-Identifier: GPL-3.0-or-later

import type { WorkspaceRepositoryContentDto } from "./types.ts";

function createCanonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(createCanonicalValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) =>
          left < right ? -1 : left > right ? 1 : 0,
        )
        .map(([key, fieldValue]) => [key, createCanonicalValue(fieldValue)]),
    );
  }

  return value;
}

export function serializeWorkspaceRepositoryRevisionContent(
  content: WorkspaceRepositoryContentDto,
) {
  return JSON.stringify(createCanonicalValue(content));
}
