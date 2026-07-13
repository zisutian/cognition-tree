import { describe, expect, it } from "vitest";
import { serializeWorkspaceRepositoryRevisionContent } from "../../contracts/workspace-repository/revision";

describe("workspace repository revision content", () => {
  it("sorts object fields recursively without changing array order", () => {
    const serialized = serializeWorkspaceRepositoryRevisionContent({
      workspace: {
        tree: [
          {
            title: "A",
            kind: "folder",
            id: "folder-a",
            children: [],
          },
        ],
        notes: [],
        name: "notes",
        id: "workspace",
      },
      syntaxSourceFile: null,
    });

    expect(serialized).toBe(
      '{"syntaxSourceFile":null,"workspace":{"id":"workspace","name":"notes","notes":[],"tree":[{"children":[],"id":"folder-a","kind":"folder","title":"A"}]}}',
    );
  });
});
