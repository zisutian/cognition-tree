// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { mapApiError } from "../../../../infrastructure/server/api/http/errors.ts";
import {
  AgentProposalCommitIndeterminateError,
} from "../../../../infrastructure/server/agent/errors.ts";
import {
  VersionedContentCommitOutcomeUnknownError,
} from "../../../../infrastructure/server/repository/versioned/contentStore.ts";

describe("API error mapping", () => {
  it("exposes an indeterminate content commit without declaring it retryable", () => {
    const currentRevision = `sha256:${"a".repeat(64)}` as const;
    const error = new VersionedContentCommitOutcomeUnknownError(
      new Error("directory synchronization failed"),
      currentRevision,
    );
    const mapped = mapApiError(error);

    expect(mapped.toDto("request-1")).toEqual({
      code: "content_commit_indeterminate",
      details: {
        commitState: "indeterminate",
        currentRevision,
      },
      message: "Versioned content durable commit outcome could not be verified",
      requestId: "request-1",
      retryable: false,
    });
    expect(mapped.statusCode).toBe(500);
  });

  it("preserves the underlying API contract after Agent marks the proposal indeterminate", () => {
    const currentRevision = `sha256:${"b".repeat(64)}` as const;
    const underlying = new VersionedContentCommitOutcomeUnknownError(
      new Error("directory synchronization failed"),
      currentRevision,
    );
    const mapped = mapApiError(
      new AgentProposalCommitIndeterminateError(underlying),
    );

    expect(mapped.toDto("request-2")).toMatchObject({
      code: "content_commit_indeterminate",
      details: { commitState: "indeterminate", currentRevision },
      retryable: false,
    });
  });
});
