// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  parseApiTodoCommandRequest,
  parseApiWorkspaceCommandRequest,
} from "../../contracts/api/parse.ts";

const revision = `sha256:${"a".repeat(64)}`;
const commandId = "00000000-0000-4000-8000-000000000001";
const createFolder = {
  kind: "create-folder",
  parentFolderId: null,
  title: "Folder",
} as const;
const treePreconditions = { expectedTreeVersion: revision } as const;

describe("API v2 command envelopes", () => {
  it("accepts preview without an id and commit with an id", () => {
    expect(parseApiWorkspaceCommandRequest({
      command: createFolder,
      mode: "preview",
      preconditions: treePreconditions,
    })).toEqual({
      command: createFolder,
      mode: "preview",
      preconditions: treePreconditions,
    });
    expect(parseApiWorkspaceCommandRequest({
      command: createFolder,
      commandId,
      mode: "commit",
      preconditions: treePreconditions,
    })).toMatchObject({ commandId, mode: "commit" });
  });

  it("rejects ids on preview, missing ids on commit, and flat v1 commands", () => {
    expect(() => parseApiWorkspaceCommandRequest({
      command: createFolder,
      commandId,
      mode: "preview",
      preconditions: treePreconditions,
    })).toThrow();
    expect(() => parseApiWorkspaceCommandRequest({
      command: createFolder,
      mode: "commit",
      preconditions: treePreconditions,
    })).toThrow();
    expect(() => parseApiWorkspaceCommandRequest({
      commandId,
      expectedTreeVersion: revision,
      kind: "create-folder",
      mode: "commit",
      parentFolderId: null,
      title: "Folder",
    })).toThrow();
  });

  it("rejects delete confirmation and preconditions for another command kind", () => {
    expect(() => parseApiWorkspaceCommandRequest({
      command: {
        confirm: true,
        folderId: "folder-a",
        kind: "delete-folder",
      },
      commandId,
      mode: "commit",
      preconditions: treePreconditions,
    })).toThrow();
    expect(() => parseApiWorkspaceCommandRequest({
      command: createFolder,
      commandId,
      mode: "commit",
      preconditions: { expectedVersion: revision },
    })).toThrow();
  });

  it("keeps semantic recurrence validation inside the v2 command envelope", () => {
    expect(() => parseApiTodoCommandRequest({
      command: {
        blockId: commandId,
        collectionId: "collection-a",
        kind: "set-recurrence",
        rule: { interval: 1, kind: "weekly", weekdays: [5, 1] },
      },
      mode: "preview",
      preconditions: { expectedStateVersion: revision },
    })).toThrow("$.command.rule.weekdays[1]");
  });
});
