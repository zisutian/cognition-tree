import { describe, expect, it } from "vitest";
import {
  canDropTreeNode,
  createTreeMoveRequest,
  createTreeMoveOptions,
  createTreeNodeDragPayload,
  createTreeRowDropDestination,
  readTreeNodeDragPayload,
  treeNodeDragDataType,
} from "../../../../presentation/ui/shared/tree/index";
import { uiVirtualRowHeightPx } from "../../../../presentation/ui/shared/virtualListMetrics";

describe("treeDrag", () => {
  it("serializes note tree drag payloads and move requests", () => {
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
    const folderTarget = {
      folderId: "folder-target",
      kind: "folder" as const,
      parentFolderId: null,
    };
    const payload = createTreeNodeDragPayload(source);

    expect(treeNodeDragDataType).toBe("application/x-cognition-tree-node");
    expect(readTreeNodeDragPayload(payload)).toEqual(source);
    expect(readTreeNodeDragPayload("invalid")).toBeNull();
    expect(readTreeNodeDragPayload('{"kind":"note"}')).toBeNull();
    expect(
      readTreeNodeDragPayload(
        '{"kind":"folder","folderId":"folder","parentFolderId":7}',
      ),
    ).toBeNull();
    const noteDestination = createTreeRowDropDestination({
      offsetY: uiVirtualRowHeightPx * 0.8,
      rowHeight: uiVirtualRowHeightPx,
      target,
    });
    const folderDestination = createTreeRowDropDestination({
      offsetY: uiVirtualRowHeightPx / 2,
      rowHeight: uiVirtualRowHeightPx,
      target: folderTarget,
    });

    expect(noteDestination).toEqual({ kind: "after", target });
    expect(folderDestination).toEqual({
      folderId: "folder-target",
      kind: "inside",
    });
    expect(
      createTreeMoveRequest({
        destination: noteDestination,
        source,
      }),
    ).toEqual({ destination: noteDestination, source });
  });

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

  it("lists root and valid folders for non-pointer moves", () => {
    const sourceFolder = {
      canDrag: true,
      children: [
        {
          canDrag: true,
          children: [],
          folderId: "folder-child",
          id: "folder-child",
          kind: "folder" as const,
          parentFolderId: "folder-source",
          title: "Child",
        },
      ],
      folderId: "folder-source",
      id: "folder-source",
      kind: "folder" as const,
      parentFolderId: null,
      title: "Source",
    };
    const nodes = [
      sourceFolder,
      {
        canDrag: true,
        children: [],
        folderId: "folder-target",
        id: "folder-target",
        kind: "folder" as const,
        parentFolderId: null,
        title: "Target",
      },
    ];

    expect(createTreeMoveOptions(nodes, sourceFolder)).toEqual([
      expect.objectContaining({ id: "root", label: "根目录" }),
      expect.objectContaining({
        destination: { folderId: "folder-target", kind: "inside" },
        id: "inside:folder-target",
        label: "Target",
      }),
    ]);
  });
});
