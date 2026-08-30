// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  AgentScopeViolationError,
} from "../../../../application/agent/index.ts";
import {
  agentRuntimeToolsForScope,
  journalToolIntent,
  todoToolIntent,
  workspaceToolIntent,
} from "../../../../infrastructure/server/agent/sessionToolProtocol.ts";

describe("Agent session tool protocol", () => {
  it("projects only common and scoped-domain runtime tools", () => {
    const tools = agentRuntimeToolsForScope({
      domain: "journal",
      entryIds: null,
    });

    expect(tools.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "list",
        "read",
        "search",
        "describe_syntax",
        "submit_proposal",
        "stage_journal_create_entry",
      ]),
    );
    expect(tools.some(({ name }) => name.startsWith("stage_workspace_")))
      .toBe(false);
    expect(tools.some(({ name }) => name.startsWith("stage_todo_")))
      .toBe(false);
  });

  it("owns the wire-tool to domain-intent mapping", () => {
    expect(workspaceToolIntent("stage_workspace_create_note", {
      parentFolderId: null,
      source: "Title",
    })).toEqual({
      kind: "create-note",
      parentFolderId: null,
      source: "Title",
    });
    expect(journalToolIntent("stage_journal_delete_entry", {
      entryId: "journal-entry",
    })).toEqual({
      entryId: "journal-entry",
      kind: "delete-entry",
    });
    expect(todoToolIntent("stage_todo_set_weekly_recurrence", {
      blockId: "block",
      collectionId: "collection",
      interval: 2,
      weekdays: [1, 4],
    })).toEqual({
      blockId: "block",
      collectionId: "collection",
      kind: "set-recurrence",
      rule: {
        interval: 2,
        kind: "weekly",
        weekdays: [1, 4],
      },
    });
  });

  it("fails closed for tools outside the known mapping", () => {
    expect(() => workspaceToolIntent("stage_workspace_unknown", {}))
      .toThrow(AgentScopeViolationError);
  });
});
