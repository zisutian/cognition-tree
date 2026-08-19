// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  prepareWorkspaceRepositoryContent,
  type WorkspaceRepositoryPreparation,
} from "../../../../application/workspace/persistence/workspaceRepositoryPreparation.ts";
import type {
  ApiCommandResultDto,
  ApiCtnDocumentDto,
  ApiWorkspaceTreeDto,
} from "../../../../contracts/api/types.ts";
import type {
  RepositoryDescriptorDto,
  WorkspaceRepositoryCommitDto,
} from "../../../../contracts/workspace/types.ts";
import { executeApiWorkspaceCommand } from "../../../../infrastructure/server/api/commands/workspace.ts";
import {
  createApiWorkspaceAnalysis,
  projectApiWorkspaceNote,
} from "../../../../infrastructure/server/api/resources/workspace.ts";
import { ApiStateStore } from "../../../../infrastructure/server/api/state/store.ts";
import {
  WorkspaceRevisionConflictError,
  type WorkspaceRepositoryStore,
} from "../../../../infrastructure/server/repository/store.ts";
import {
  commandId,
  createContent,
  createRepository,
  createRuntime,
  dispatch,
  preparedWorkspaceSnapshot,
  revision,
  withHandler,
} from "./support/apiServerTestHarness.ts";

describe("CTN API v2", () => {
  it("previews and idempotently commits Workspace commands by resource version", async () => {
    await withHandler(async (handler) => {
      const repository = await createRepository(handler);
      const tree = await dispatch<ApiWorkspaceTreeDto>(handler, {
        method: "GET",
        url: `/api/v2/workspaces/${repository.id}/tree`,
      });
      const note = tree.body!.nodes.find((node) => node.kind === "note")!;
      const document = await dispatch<ApiCtnDocumentDto>(handler, {
        method: "GET",
        url: `/api/v2/workspaces/${repository.id}/notes/${note.noteId}`,
      });
      const editableText = `${document.body!.title}\n: API 新正文`;
      const command = {
        editableText,
        kind: "replace-note-source",
        noteId: note.noteId,
      } as const;
      const preconditions = { expectedVersion: document.body!.version };
      const commitRequest = {
        command,
        commandId: commandId(1),
        mode: "commit",
        preconditions,
      } as const;
      const preview = await dispatch<ApiCommandResultDto>(handler, {
        body: { command, mode: "preview", preconditions },
        method: "POST",
        url: `/api/v2/workspaces/${repository.id}/commands`,
      });

      expect(preview.body).toMatchObject({
        status: "previewed",
      });
      if (preview.body?.status !== "previewed") {
        throw new Error("expected command preview");
      }
      expect(preview.body!.diff).not.toEqual([]);
      const unchanged = await dispatch<ApiCtnDocumentDto>(handler, {
        method: "GET",
        url: `/api/v2/workspaces/${repository.id}/notes/${note.noteId}`,
      });

      expect(unchanged.body!.editableText).toBe(document.body!.editableText);
      const [committed, repeated] = await Promise.all([
        dispatch<ApiCommandResultDto>(handler, {
          body: commitRequest,
          method: "POST",
          url: `/api/v2/workspaces/${repository.id}/commands`,
        }),
        dispatch<ApiCommandResultDto>(handler, {
          body: commitRequest,
          method: "POST",
          url: `/api/v2/workspaces/${repository.id}/commands`,
        }),
      ]);

      expect(committed.body).toMatchObject({ status: "committed" });
      expect(committed.body).not.toHaveProperty("diff");
      expect(repeated.body).toEqual(committed.body);
      const reusedCommandId = await dispatch<{ code: string }>(handler, {
        body: {
          ...commitRequest,
          command: {
            ...command,
            editableText: `${editableText}\n复用`,
          },
        },
        method: "POST",
        url: `/api/v2/workspaces/${repository.id}/commands`,
      });

      expect(reusedCommandId).toMatchObject({
        body: { code: "idempotency_conflict" },
        statusCode: 409,
      });
      const conflict = await dispatch<{ code: string }>(handler, {
        body: {
          ...commitRequest,
          commandId: commandId(2),
          command: {
            ...command,
            editableText: `${editableText}\n冲突`,
          },
        },
        method: "POST",
        url: `/api/v2/workspaces/${repository.id}/commands`,
      });

      expect(conflict).toMatchObject({
        body: { code: "resource_conflict" },
        statusCode: 409,
      });
    });
  });

  it("rejects a v2 commandId already recorded for a v1 request digest", async () => {
    await withHandler(async (_handler, rootDir, authenticated) => {
      const ownerToken = "owner-token-with-at-least-32-characters";
      const stateStore = new ApiStateStore(
        path.join(rootDir, "server-state"),
        { now: () => new Date("2026-08-19T00:00:00.000Z") },
      );
      const legacyCommandId = commandId(4);

      await stateStore.saveReceipt(
        "bootstrap-owner",
        legacyCommandId,
        {
          commandId: legacyCommandId,
          expectedTreeVersion: revision("a"),
          kind: "create-folder",
          mode: "commit",
          parentFolderId: null,
          title: "legacy",
        },
        {
          changes: {
            blocks: [],
            occurredAt: "2026-08-19T00:00:00.000Z",
            resources: [],
          },
          result: { kind: "ok" },
          revision: revision("a"),
          status: "committed",
        },
      );
      const handler = authenticated(ownerToken, stateStore);
      const repository = await dispatch<RepositoryDescriptorDto>(handler, {
        body: {
          adapter: "local",
          content: createContent(),
          label: "v1 receipt",
        },
        method: "POST",
        token: ownerToken,
        url: "/api/v2/admin/repositories",
      });
      const tree = await dispatch<ApiWorkspaceTreeDto>(handler, {
        method: "GET",
        token: ownerToken,
        url: `/api/v2/workspaces/${repository.body!.id}/tree`,
      });
      const reused = await dispatch<{ code: string }>(handler, {
        body: {
          command: {
            kind: "create-folder",
            parentFolderId: null,
            title: "v2",
          },
          commandId: legacyCommandId,
          mode: "commit",
          preconditions: { expectedTreeVersion: tree.body!.version },
        },
        method: "POST",
        token: ownerToken,
        url: `/api/v2/workspaces/${repository.body!.id}/commands`,
      });

      expect(reused).toMatchObject({
        body: { code: "idempotency_conflict" },
        statusCode: 409,
      });
    });
  });

  it("replays a Workspace command after unrelated repository CAS movement", async () => {
    let content = createContent();
    let currentRevision = revision("a");
    let commitAttempts = 0;
    const note = content.workspace.notes[0]!;
    const document = projectApiWorkspaceNote(
      createApiWorkspaceAnalysis(content),
      note.id,
    )!;
    const executeCommit = async (
      value: WorkspaceRepositoryCommitDto,
      projection: WorkspaceRepositoryPreparation,
    ) => {
        const commit = value;
        const before = preparedWorkspaceSnapshot(content, currentRevision);

        commitAttempts += 1;
        if (commitAttempts === 1) {
          content = {
            ...content,
            workspace: {
              ...content.workspace,
              name: "并发改名",
            },
          };
          currentRevision = revision("b");
          throw new WorkspaceRevisionConflictError(currentRevision);
        }
        expect(commit.baseRevision).toBe(currentRevision);
        content = structuredClone(commit.content);
        currentRevision = revision("c");
        const after = { content, projection, revision: currentRevision };

        return { after, before, revision: currentRevision };
      };
    const store: WorkspaceRepositoryStore = {
      commitPreparedSnapshot: executeCommit,
      async commitSnapshot(value) {
        return executeCommit(
          value,
          prepareWorkspaceRepositoryContent(value.content),
        );
      },
      async loadSnapshot() {
        return preparedWorkspaceSnapshot(
          structuredClone(content),
          currentRevision,
        );
      },
    };
    const result = await executeApiWorkspaceCommand({
      request: {
        commandId: commandId(5),
        command: {
          editableText: `${document.editableText}\n: CAS 重放`,
          kind: "replace-note-source",
          noteId: note.id,
        },
        mode: "commit",
        preconditions: { expectedVersion: document.version },
      },
      repositoryId: "repository-replay",
      runtime: createRuntime(),
      store,
    });

    expect(result).toMatchObject({
      revision: revision("c"),
      status: "committed",
    });
    expect(commitAttempts).toBe(2);
    expect(content.workspace.name).toBe("并发改名");
    expect(content.workspace.notes[0]!.source).toContain("CAS 重放");
  });
});
