// SPDX-License-Identifier: GPL-3.0-or-later

import type { ContentChangeReview } from "../commands/index.ts";

export type ContentOperationScope =
  | { domain: "workspace"; repository: string }
  | { domain: "catalog" }
  | { domain: "journal" }
  | { domain: "todo" };

export type ContentOperationIntent = {
  baseRevision: `sha256:${string}`;
  command: string;
  digest: `sha256:${string}`;
  occurredAt: string;
  operationId: string;
  scope: ContentOperationScope;
};

export type ContentOperationPreparation = {
  repositoryId: string | null;
  expectedAfterRevision: `sha256:${string}`;
  targets: Pick<
    ContentChangeReview["resources"][number],
    "resourceId" | "type" | "actions" | "before" | "after"
  >[];
};
export type ContentOperationRecorder = (
  preparation: ContentOperationPreparation,
) => Promise<void>;

export type ContentOperationResult = ContentOperationIntent & {
  preparation: ContentOperationPreparation | null;
  afterRevision: `sha256:${string}` | null;
  audit: "pending" | "recorded" | "failed";
  changeMetadata: { blockIds: string[]; resourceIds: string[] };
  error: {
    code: string;
    message: string;
    candidates?: string[];
    selector?: string;
    currentRevision?: `sha256:${string}`;
  } | null;
  review: ContentChangeReview | null;
  status: "pending" | "committed" | "conflict" | "failed" | "indeterminate";
  updatedAt: string;
};

export type ContentOperationOutcome = Pick<
  ContentOperationResult,
  "afterRevision" | "changeMetadata" | "error" | "review" | "status"
>;

export interface ContentOperationLedgerPort {
  getContentOperation(
    operationId: string,
  ): Promise<ContentOperationResult | null>;
  runContentOperation(
    intent: ContentOperationIntent,
    execute: (
      recordPrepared: ContentOperationRecorder,
    ) => Promise<ContentOperationOutcome>,
  ): Promise<ContentOperationResult>;
}

export class ContentOperationIdempotencyError extends Error {
  constructor() {
    super("Operation ID was already used with a different request.");
    this.name = "ContentOperationIdempotencyError";
  }
}
