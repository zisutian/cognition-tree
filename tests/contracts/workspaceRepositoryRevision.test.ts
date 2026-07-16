import { describe, expect, it } from "vitest";
import { serializeJsonIteratively } from "../../contracts/workspace-repository/json";
import { parseWorkspaceRepositoryContent } from "../../contracts/workspace-repository/parseRepository";
import { serializeWorkspaceRepositoryRevisionContent } from "../../contracts/workspace-repository/revision";
import type {
  RepositoryTreeNodeDto,
  WorkspaceRepositoryContentDto,
} from "../../contracts/workspace-repository/types";

describe("workspace repository revision content", () => {
  it("preserves JSON.stringify semantics for plain JSON-compatible values", () => {
    const value = {
      array: [1, undefined, Number.NaN, Number.POSITIVE_INFINITY, -0, , "\\ud800"],
      boolean: true,
      omitted: undefined,
      text: "quoted \\\" text\nline",
    };

    expect(serializeJsonIteratively(value)).toBe(JSON.stringify(value));
    expect(serializeJsonIteratively(value, { indent: 2 })).toBe(
      JSON.stringify(value, null, 2),
    );
    expect(serializeJsonIteratively({ z: 1, a: { z: 2, a: 3 } }, {
      sortObjectKeys: true,
    })).toBe('{"a":{"a":3,"z":2},"z":1}');
  });

  it("sorts notes by id while preserving tree order", () => {
    const serialized = serializeWorkspaceRepositoryRevisionContent({
      schemaVersion: 3,
      syntaxSource: null,
      workspace: {
        id: "workspace",
        name: "notes",
        notes: [
          { id: "z", source: "Z" },
          { id: "a", source: "A" },
        ],
        tree: [
          { kind: "note", noteId: "z" },
          { kind: "note", noteId: "a" },
        ],
      },
    });

    expect(serialized).toBe(
      '{"schemaVersion":3,"syntaxSource":null,"workspace":{"id":"workspace","name":"notes","notes":[{"id":"a","source":"A"},{"id":"z","source":"Z"}],"tree":[{"kind":"note","noteId":"z"},{"kind":"note","noteId":"a"}]}}',
    );
  });

  it("serializes and parses a 10,000-level repository tree without using the call stack", () => {
    let node: RepositoryTreeNodeDto = { kind: "note", noteId: "deep-note" };

    for (let depth = 10_000; depth > 0; depth -= 1) {
      node = {
        children: [node],
        folderId: `folder-${depth}`,
        kind: "folder",
        title: `level ${depth}`,
      };
    }

    const content: WorkspaceRepositoryContentDto = {
      schemaVersion: 3,
      syntaxSource: null,
      workspace: {
        id: "deep-workspace",
        name: "deep tree",
        notes: [{ id: "deep-note", source: "deep source" }],
        tree: [node],
      },
    };
    const serialized = serializeWorkspaceRepositoryRevisionContent(content);
    const parsed = parseWorkspaceRepositoryContent(JSON.parse(serialized));
    let current = parsed.workspace.tree[0];
    let depth = 0;

    while (current?.kind === "folder") {
      depth += 1;
      current = current.children[0];
    }

    expect(depth).toBe(10_000);
    expect(current).toEqual({ kind: "note", noteId: "deep-note" });
  });
});
