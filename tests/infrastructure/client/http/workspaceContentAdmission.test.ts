// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { createLocalFirstWorkspaceRepository, workspaceRepositoryPreparation } from "../../../../application/workspace/index.ts";
import { createHttpWorkspaceRepositoryBackend } from "../../../../infrastructure/client/http/index.ts";
import { createMemoryVersionedRepositoryCache } from "../../../../infrastructure/client/repository/index.ts";
import { createCanonicalNoteSource } from "../../../../core/workspace/model/workspaceData";
import { createContent } from "../../../application/workspace/session/workspaceSessionTestFixture";

async function loadRemoteContent(content: unknown) {
  const repository = createLocalFirstWorkspaceRepository({
    backend: createHttpWorkspaceRepositoryBackend({
      baseUrl: "http://api.test", repositoryId: "validation-test",
      fetch: async () => new Response(JSON.stringify({ content, revision: `sha256:${"a".repeat(64)}` }), { headers: { "Content-Type": "application/json" } }),
    }),
    cache: createMemoryVersionedRepositoryCache(),
    createDraftId: () => "00000000-0000-4000-8000-000000000001",
    label: "Validation", loadPolicy: { mode: "refresh-remote" },
    location: { hostPath: null, serverPath: "/validation" },
    repositoryIdentity: "validation", preparation: workspaceRepositoryPreparation,
  });
  return repository.loadSnapshot();
}



describe("remote workspace content admission", () => {
  it("accepts diagnostic note text while canonical metadata remains valid", async () => {
    const content = createContent(
      "可修复工作区",
      "\n\t```ts\n\t未闭合正文\n\t@ctn-block id=broken",
    );

    await expect(loadRemoteContent(content)).resolves.toBeDefined();
  });

  it("accepts a syntax-free opaque body when its title header is canonical", async () => {
    const content = createContent();
    const titleSource = createCanonicalNoteSource({
      blockId: "00000000-0000-4000-8000-000000000001",
      timestamp: "2026-07-16T00:00:00.000Z",
      title: "",
    });

    await expect(
      loadRemoteContent({
        ...content,
        syntax: { activeFileId: null, files: [] },
        workspace: {
          ...content.workspace,
          notes: [
            {
              id: "note-1",
              source: `${titleSource}\nopaque body\n@ctn-block id=visible`,
            },
          ],
        },
      }),
    ).resolves.toBeDefined();
  });

  it("rejects damaged canonical metadata", async () => {
    const content = createContent();

    await expect(
      loadRemoteContent({
        ...content,
        workspace: {
          ...content.workspace,
          notes: [{ id: "note-1", source: "Raw title\nbody" }],
        },
      }),
    ).rejects.toThrow("expected @ctn-block directive");
  });

  it("rejects invalid and duplicate inactive syntax files", async () => {
    const content = createContent();
    const active = content.syntax.files[0]!;

    await expect(loadRemoteContent({
      ...content,
      syntax: {
        ...content.syntax,
        files: [
          active,
          {
            id: "syntax-00000000-0000-4000-8000-000000000002",
            source: "name =",
          },
        ],
      },
    })).rejects.toThrow("Invalid workspace syntax source");

    await expect(loadRemoteContent({
      ...content,
      syntax: {
        ...content.syntax,
        files: [
          active,
          {
            id: "syntax-00000000-0000-4000-8000-000000000002",
            source: active.source,
          },
        ],
      },
    })).rejects.toThrow("Duplicate workspace syntax name");
  });

  it("rejects invalid repository tree facts", async () => {
    const content = createContent();

    await expect(
      loadRemoteContent({
        ...content,
        workspace: {
          ...content.workspace,
          tree: [
            { kind: "note", noteId: "note-1" },
            { kind: "note", noteId: "note-1" },
          ],
        },
      }),
    ).rejects.toThrow("duplicate note placement");
  });

  it("rejects non-exact repository DTOs before semantic validation", async () => {
    const content = createContent();

    Object.assign(content.workspace.notes[0]!, {
      updatedAt: "2026-07-16T00:00:00.000Z",
    });
    await expect(loadRemoteContent(content)).rejects.toThrow(
      "unsupported field",
    );
  });
});
