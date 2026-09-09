// SPDX-License-Identifier: GPL-3.0-or-later

import {
  CtnContentEditError,
  type CtnContentMoveTarget,
} from "../../core/ctn/index.ts";
import { DomainValidationError } from "../../core/errors/index.ts";
import type { ContentChangeReview } from "../commands/index.ts";
import type {
  ContentOperationOutcome,
  ContentOperationRecorder,
} from "../operations/index.ts";
import {
  VersionedContentRevisionConflictError,
  type PreparedVersionedCommitReceipt,
  type PreparedVersionedSnapshot,
  type PreparedVersionedStore,
  type PreparedVersionedContent,
} from "../persistence/index.ts";
import type { ContentCommand } from "./contentCommand.ts";
import type { ContentRevision } from "./contentPorts.ts";
import { ContentTargetError } from "./targetResolution.ts";

export class ContentBasisMismatchError extends Error {
  constructor() {
    super(
      "The read basis belongs to a different repository. Read the intended target again.",
    );
    this.name = "ContentBasisMismatchError";
  }
}

export function commandFailure(
  error: unknown,
  uncertain = false,
): ContentOperationOutcome {
  const conflict = error instanceof VersionedContentRevisionConflictError;
  return {
    afterRevision: null,
    changeMetadata: { resourceIds: [], blockIds: [] },
    review: null,
    status:
      conflict || error instanceof ContentBasisMismatchError
        ? "conflict"
        : uncertain
          ? "indeterminate"
          : "failed",
    error: {
      code: conflict
        ? "revision_conflict"
        : error instanceof ContentBasisMismatchError
          ? "target_identity_conflict"
          : uncertain
            ? "operation_indeterminate"
            : error instanceof ContentTargetError
              ? error.code
              : error instanceof CtnContentEditError
                ? error.reason
                : "invalid_request",
      message: uncertain
        ? "The commit outcome cannot be proved. Query this operation and inspect the affected content; do not replay it."
        : error instanceof Error
          ? error.message
          : "Content operation failed.",
      ...(error instanceof ContentTargetError
        ? { candidates: error.candidates, selector: error.selector }
        : {}),
      ...(conflict ? { currentRevision: error.currentRevision } : {}),
    },
  };
}

export function requireRevision(
  actual: ContentRevision,
  expected: ContentRevision,
) {
  if (actual !== expected)
    throw new VersionedContentRevisionConflictError(actual);
}

export function contentMoveTarget(
  command: Extract<ContentCommand, { kind: "move-block" }>,
): CtnContentMoveTarget {
  if (command.position === "end" && command.targetBlockId === null)
    return { kind: "end" };
  if (command.position === "end" || command.targetBlockId === null)
    throw new DomainValidationError(
      "A block position requires a target block; end requires a null target.",
    );
  return { kind: command.position, targetBlockId: command.targetBlockId };
}

export async function commitContentCommand<Content, Projection>(input: {
  store: PreparedVersionedStore<Content, Projection, ContentRevision>;
  baseRevision: ContentRevision;
  prepare(
    snapshot: PreparedVersionedSnapshot<Content, Projection, ContentRevision>,
  ): PreparedVersionedContent<Content, Projection>;
  repositoryId: string | null;
  revisionOf(content: Content): ContentRevision;
  recordPrepared: ContentOperationRecorder;
  describe(change: {
    before: PreparedVersionedContent<Content, Projection>;
    after: PreparedVersionedContent<Content, Projection>;
  }): {
    review: ContentChangeReview;
    changeMetadata: ContentOperationOutcome["changeMetadata"];
    notify(revision: ContentRevision): void;
  };
}): Promise<ContentOperationOutcome> {
  let committing = false;
  let receipt: PreparedVersionedCommitReceipt<
    Content,
    Projection,
    ContentRevision
  > | null = null;
  try {
    const snapshot = await input.store.loadSnapshot();
    requireRevision(snapshot.revision, input.baseRevision);
    const prepared = input.prepare(snapshot);
    const expected = input.describe({ before: snapshot, after: prepared });
    await input.recordPrepared({
      repositoryId: input.repositoryId,
      expectedAfterRevision: input.revisionOf(prepared.content),
      targets: expected.review.resources.map(
        ({ resourceId, type, actions, before, after }) => ({
          resourceId,
          type,
          actions,
          before,
          after,
        }),
      ),
    });
    committing = true;
    receipt = await input.store.commit({
      ...prepared,
      baseRevision: input.baseRevision,
    });
    const description = input.describe(receipt);
    let error: ContentOperationOutcome["error"] = null;
    try {
      description.notify(receipt.revision);
    } catch {
      error = {
        code: "notification_failed",
        message:
          "Content was committed, but change notification failed. Refresh the content view.",
      };
    }
    return {
      afterRevision: receipt.revision,
      status: "committed",
      review: description.review,
      changeMetadata: description.changeMetadata,
      error,
    };
  } catch (error) {
    if (receipt)
      return {
        afterRevision: receipt.revision,
        status: "committed",
        review: null,
        changeMetadata: { resourceIds: [], blockIds: [] },
        error: {
          code: "receipt_projection_failed",
          message:
            "Content was committed, but its change summary could not be generated. Read the affected content to verify it.",
        },
      };
    return commandFailure(error, committing);
  }
}
