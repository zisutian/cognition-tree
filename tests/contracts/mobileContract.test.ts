// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  parseMobileTodoCompletionRequest,
  parseMobileV2TodoCompletionRequest,
} from
  "../../contracts/mobile/parseMobile";

const revision = `sha256:${"a".repeat(64)}` as const;

describe("Cognition mobile v1 contract", () => {
  it("parses an exact idempotent completion target", () => {
    expect(parseMobileTodoCompletionRequest({
      completed: true,
      expectedRevision: revision,
      occurrenceDate: "2026-07-26",
    })).toEqual({
      completed: true,
      expectedRevision: revision,
      occurrenceDate: "2026-07-26",
    });
    expect(parseMobileTodoCompletionRequest({
      completed: false,
      expectedRevision: revision,
      occurrenceDate: null,
    })).toEqual({
      completed: false,
      expectedRevision: revision,
      occurrenceDate: null,
    });
    expect(parseMobileV2TodoCompletionRequest({
      completed: true,
      expectedRevision: revision,
      occurrenceDate: "2026-07-26",
    })).toEqual({
      completed: true,
      expectedRevision: revision,
      occurrenceDate: "2026-07-26",
    });
  });

  it("rejects toggles, extra fields, malformed revisions, and invalid dates", () => {
    for (const value of [
      {
        expectedRevision: revision,
        occurrenceDate: null,
        toggle: true,
      },
      {
        completed: true,
        expectedRevision: revision,
        occurrenceDate: null,
        source: "[] hidden",
      },
      {
        completed: true,
        expectedRevision: "draft:unsafe",
        occurrenceDate: null,
      },
      {
        completed: true,
        expectedRevision: revision,
        occurrenceDate: "2026-02-30",
      },
    ]) {
      expect(() => parseMobileTodoCompletionRequest(value)).toThrow();
    }
  });
});
