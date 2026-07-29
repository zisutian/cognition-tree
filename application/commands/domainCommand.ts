// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnTextEdit } from "../../core/ctn/metadata/textEdits.ts";
import type { DomainChangeSet } from "../../core/sync/domainChangeSet.ts";
import type {
  DomainCommandOutcome,
  DomainTextEdit,
  DomainTransition,
} from "../../core/sync/domainTransition.ts";

export type {
  DomainCommandOutcome,
  DomainTextEdit,
  DomainTransition,
} from "../../core/sync/domainTransition.ts";

export type DomainMutation<Content> = {
  content: Content;
  outcome: DomainCommandOutcome;
  timestamp: string;
};

export type DomainMutationProjection = {
  changes: DomainChangeSet;
  diff: DomainTextEdit[];
};

export function createDomainTransition<Content>(
  mutation: DomainMutation<Content>,
  projection: DomainMutationProjection,
): DomainTransition<Content> {
  return {
    changes: projection.changes,
    content: mutation.content,
    diff: projection.diff,
    result: mutation.outcome,
    warnings: [],
  };
}

export class DomainResourceConflictError extends Error {
  readonly currentVersion: `sha256:${string}`;
  readonly resourceId: string;

  constructor(
    resourceId: string,
    currentVersion: `sha256:${string}`,
  ) {
    super(`Domain resource changed after it was read: ${resourceId}`);
    this.name = "DomainResourceConflictError";
    this.currentVersion = currentVersion;
    this.resourceId = resourceId;
  }
}

export function assertDomainResourceVersion(
  expected: `sha256:${string}` | undefined,
  current: `sha256:${string}`,
  resourceId: string,
) {
  if (expected !== undefined && expected !== current) {
    throw new DomainResourceConflictError(resourceId, current);
  }
}

export function projectDomainTextEdits(
  resourceId: string,
  edits: readonly CtnTextEdit[],
): DomainTextEdit[] {
  return edits.map((edit) => ({ ...edit, resourceId }));
}
