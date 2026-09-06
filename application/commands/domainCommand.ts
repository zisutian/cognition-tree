// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnTextEdit } from "../../core/ctn/index.ts";
import type {
  DomainChangeSet,
  DomainTextEdit,
  DomainTransition,
} from "../../core/sync/index.ts";


export type {
  DomainTextEdit,
  DomainTransition,
} from "../../core/sync/index.ts";

export type DomainMutation<Content, Outcome> = {
  content: Content;
  outcome: Outcome;
  timestamp: string;
};

export type DomainMutationProjection = {
  changes: DomainChangeSet;
  diff: DomainTextEdit[];
};

export function createDomainTransition<Content, Outcome>(
  mutation: DomainMutation<Content, Outcome>,
  projection: DomainMutationProjection,
): DomainTransition<Content, Outcome> {
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
