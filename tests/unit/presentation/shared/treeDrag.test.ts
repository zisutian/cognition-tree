import { describe, expect, it } from "vitest";
import { canDropTreeNode } from "../../../../presentation/ui/shared/tree/index";

describe("treeDrag", () => {
  it("classifies note tree drag targets", () => {
    const source = {
      kind: "note" as const,
      noteId: "note-source",
      parentFolderId: null,
    };
    const target = {
      kind: "note" as const,
      noteId: "note-target",
      parentFolderId: null,
    };
    const destination = { kind: "after" as const, target };
    const nodes = [
      {
        canDrag: true,
        folderId: null,
        id: "tree-note-source",
        kind: "note" as const,
        noteId: source.noteId,
        parentFolderId: null,
        title: "Source",
      },
      {
        canDrag: true,
        folderId: null,
        id: "tree-note-target",
        kind: "note" as const,
        noteId: target.noteId,
        parentFolderId: null,
        title: "Target",
      },
    ];

    expect(canDropTreeNode({ destination, nodes, source })).toBe(true);
    expect(
      canDropTreeNode({
        destination: { kind: "before", target: source },
        nodes,
        source,
      }),
    ).toBe(false);
    expect(
      canDropTreeNode({
        canDropDestination: () => false,
        destination,
        nodes,
        source,
      }),
    ).toBe(false);
  });

  it("rejects folder drops onto descendant destinations", () => {
    const source = {
      folderId: "folder-source",
      kind: "folder" as const,
      parentFolderId: null,
    };
    const child = {
      kind: "note" as const,
      noteId: "note-child",
      parentFolderId: "folder-source",
    };
    const nodes = [
      {
        canDrag: true,
        children: [
          {
            canDrag: true,
            folderId: "folder-source",
            id: "tree-note-child",
            kind: "note" as const,
            noteId: child.noteId,
            parentFolderId: "folder-source",
            title: "Child",
          },
        ],
        folderId: source.folderId,
        id: source.folderId,
        kind: "folder" as const,
        parentFolderId: null,
        title: "Source",
      },
    ];

    expect(
      canDropTreeNode({
        destination: { kind: "after", target: child },
        nodes,
        source,
      }),
    ).toBe(false);
    expect(
      canDropTreeNode({
        destination: { kind: "root" },
        nodes,
        source,
      }),
    ).toBe(true);
  });
});
