import { describe, expect, it } from "vitest";
import { defaultCtnSyntaxSource } from "../../../../core/ctn/syntax/defaultSyntax";
import { createCanonicalNoteSource } from "../../../../core/workspace/model/workspaceData";
import { recoverWorkspaceLocalConflictCopies } from "../../../../application/workspace/persistence/workspaceConflictRecovery";
import { prepareWorkspaceRepositoryContent } from "../../../../application/workspace/persistence/workspaceRepositoryPreparation";
import { mergeWorkspaceContent } from "../../../../application/workspace/persistence/workspaceThreeWayMerge";
import { createWorkspaceRepositoryContent } from "../../../support/workspaceRepositoryFixtures";
import { createContent as createPreparedWorkspaceContent } from "../session/workspaceSessionTestFixture";

describe("Workspace three-way persistence", () => {
  it("builds a merged projection from prepared source analyses", () => {
    const base = createPreparedWorkspaceContent();
    const local = structuredClone(base);
    const remote = structuredClone(base);

    local.workspace.notes[0]!.source = local.workspace.notes[0]!.source.replace(
      "\n标题",
      "\n本地标题",
    );
    remote.workspace.name = "远端名称";
    const baseProjection = prepareWorkspaceRepositoryContent(base);
    const merged = mergeWorkspaceContent(
      { content: base, projection: baseProjection },
      {
        content: local,
        projection: prepareWorkspaceRepositoryContent(local, {
          previous: baseProjection,
        }),
      },
      {
        content: remote,
        projection: prepareWorkspaceRepositoryContent(remote, {
          previous: baseProjection,
        }),
      },
    );

    expect(merged).toMatchObject({
      content: { workspace: { name: "远端名称" } },
      status: "merged",
    });
    if (merged.status === "merged") {
      expect(merged.projection.analysisIndex?.analysisStats.runCount).toBe(0);
    }
  });

  it("merges independent resources and treats grammar changes as a barrier", () => {
    const base = createWorkspaceRepositoryContent();
    const local = structuredClone(base);
    const remote = structuredClone(base);

    local.workspace.notes[0]!.source = local.workspace.notes[0]!.source.replace(
      "\nTitle",
      "\nLocal",
    );
    remote.workspace.name = "Remote name";
    const baseProjection = prepareWorkspaceRepositoryContent(base);
    const prepare = (content: typeof base) => ({
      content,
      projection: prepareWorkspaceRepositoryContent(content, {
        previous: baseProjection,
      }),
    });

    expect(mergeWorkspaceContent(
      { content: base, projection: baseProjection },
      prepare(local),
      prepare(remote),
    )).toMatchObject({
      content: {
        workspace: {
          name: "Remote name",
          notes: [{ source: local.workspace.notes[0]!.source }],
        },
      },
      status: "merged",
    });

    remote.syntax.files.push({
      id: "syntax-00000000-0000-4000-8000-000000000001",
      source: defaultCtnSyntaxSource,
    });
    expect(mergeWorkspaceContent(
      { content: base, projection: baseProjection },
      prepare(local),
      prepare(remote),
    )).toEqual({ status: "conflict", unitIds: ["syntax"] });
  });

  it("creates a recovery note from the persisted local body", () => {
    let nextId = 500;
    const timestamp = "2026-07-18T00:00:00.000Z";
    const remote = createWorkspaceRepositoryContent(
      "Workspace",
      createCanonicalNoteSource({
        blockId: "00000000-0000-4000-8000-000000000001",
        timestamp,
        title: "远端笔记",
      }) + "\n: 远端正文",
    );
    const local = structuredClone(remote);

    local.workspace.notes[0]!.source = createCanonicalNoteSource({
      blockId: "00000000-0000-4000-8000-000000000001",
      timestamp,
      title: "本地笔记",
    }) + "\n: 本地正文";
    const remoteProjection = prepareWorkspaceRepositoryContent(remote);
    const recovered = recoverWorkspaceLocalConflictCopies(
      { content: remote, projection: remoteProjection },
      { unitIds: ["workspace:note:note-a"] },
      {
        createBlockId: () =>
          `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`,
        createWorkspaceNoteId: () =>
          `note-00000000-0000-4000-8000-${
            String(nextId++).padStart(12, "0")
          }`,
        now: () => "2026-07-29T12:00:00.000Z",
      },
      {
        content: local,
        projection: prepareWorkspaceRepositoryContent(local, {
          previous: remoteProjection,
        }),
      },
    ).content;

    expect(recovered.workspace.notes).toHaveLength(2);
    expect(recovered.workspace.notes[1]!.source).toContain(": 本地正文");
    expect(recovered.workspace.tree[1]).toMatchObject({
      kind: "note",
      noteId: recovered.workspace.notes[1]!.id,
    });
  });
});
