import { describe, expect, it } from "vitest";
import { createWorkspaceRepositoryRevision } from "../../../src/storage/repository/workspaceRepositoryRevision";

describe("createWorkspaceRepositoryRevision", () => {
  it("ignores object field insertion order but preserves array order", async () => {
    const first = {
      syntaxSourceFile: null,
      workspace: {
        id: "workspace",
        name: "notes",
        notes: [],
        tree: [],
      },
    };
    const reordered = {
      workspace: {
        tree: [],
        notes: [],
        name: "notes",
        id: "workspace",
      },
      syntaxSourceFile: null,
    };
    const changed = {
      syntaxSourceFile: null,
      workspace: {
        ...first.workspace,
        tree: [
          {
            id: "folder-a",
            kind: "folder" as const,
            title: "A",
            children: [],
          },
        ],
      },
    };

    await expect(createWorkspaceRepositoryRevision(first)).resolves.toBe(
      await createWorkspaceRepositoryRevision(reordered),
    );
    await expect(createWorkspaceRepositoryRevision(changed)).resolves.not.toBe(
      await createWorkspaceRepositoryRevision(first),
    );
  });
});
