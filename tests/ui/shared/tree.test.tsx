import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BlockTree,
  canDropTreeNode,
  createTreeMoveRequest,
  createTreeNodeDragPayload,
  getTreeDragClassNames,
  getTreeNodeReferenceKey,
  NoteTree,
  readTreeNodeDragPayload,
  treeNodeDragDataType,
} from "../../../src/ui/shared/tree";

describe("shared trees", () => {
  it("renders note and folder rows with shared tree classes", () => {
    const markup = renderToStaticMarkup(
      <NoteTree
        activeNoteId="note-1"
        nodes={[
          {
            canDrag: true,
            childCount: 1,
            children: [
              {
                canDrag: true,
                folderId: "folder-1",
                id: "tree-note-1",
                kind: "note",
                noteId: "note-1",
                parentFolderId: "folder-1",
                title: "当前笔记",
              },
            ],
            folderId: "folder-1",
            id: "folder-1",
            kind: "folder",
            parentFolderId: null,
            title: "文件夹",
          },
        ]}
      />,
    );

    expect(markup).toContain("ui-tree");
    expect(markup).toContain("ui-tree-row");
    expect(markup).toContain("当前笔记");
  });

  it("hides folder children when folder collapse state is controlled", () => {
    const markup = renderToStaticMarkup(
      <NoteTree
        collapsedFolderIds={new Set(["folder-1"])}
        nodes={[
          {
            canDrag: true,
            children: [
              {
                canDrag: true,
                folderId: "folder-1",
                id: "tree-note-1",
                kind: "note",
                noteId: "note-1",
                parentFolderId: "folder-1",
                title: "折叠中的笔记",
              },
            ],
            folderId: "folder-1",
            id: "folder-1",
            kind: "folder",
            parentFolderId: null,
            title: "文件夹",
          },
        ]}
        onToggleFolder={() => undefined}
      />,
    );

    expect(markup).toContain("aria-expanded=\"false\"");
    expect(markup).not.toContain("折叠中的笔记");
  });

  it("uses active node selection to keep note and folder selection exclusive", () => {
    const markup = renderToStaticMarkup(
      <NoteTree
        activeFolderId="folder-1"
        activeNode={{ kind: "note", noteId: "note-1" }}
        activeNoteId="note-1"
        nodes={[
          {
            canDrag: true,
            children: [
              {
                canDrag: true,
                folderId: "folder-1",
                id: "tree-note-1",
                kind: "note",
                noteId: "note-1",
                parentFolderId: "folder-1",
                title: "当前笔记",
              },
            ],
            folderId: "folder-1",
            id: "folder-1",
            kind: "folder",
            parentFolderId: null,
            title: "文件夹",
          },
        ]}
      />,
    );

    expect(markup.match(/ui-tree-row-frame is-selected/g) ?? []).toHaveLength(1);
  });

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
    expect(createTreeMoveRequest({ source, target })).toEqual({
      placement: "after",
      source,
      target,
    });
    expect(createTreeMoveRequest({ source, target: folderTarget })).toEqual({
      placement: "inside",
      source,
      target: folderTarget,
    });
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

    expect(canDropTreeNode({ source, target })).toBe(true);
    expect(canDropTreeNode({ source, target: source })).toBe(false);
    expect(
      canDropTreeNode({
        canDropNode: () => false,
        source,
        target,
      }),
    ).toBe(false);
    expect(
      getTreeDragClassNames({
        dragState: {
          activeTargetCanDrop: true,
          activeTargetKey: getTreeNodeReferenceKey(target),
          source,
          sourceKey: getTreeNodeReferenceKey(source),
        },
        nodeReference: target,
      }),
    ).toContain("is-drop-target");
    expect(
      getTreeDragClassNames({
        dragState: {
          activeTargetCanDrop: false,
          activeTargetKey: getTreeNodeReferenceKey(target),
          source,
          sourceKey: getTreeNodeReferenceKey(source),
        },
        nodeReference: target,
      }),
    ).toContain("is-drop-disabled");
    expect(
      getTreeDragClassNames({
        dragState: {
          activeTargetCanDrop: false,
          activeTargetKey: null,
          source,
          sourceKey: getTreeNodeReferenceKey(source),
        },
        nodeReference: source,
      }),
    ).toContain("is-dragging");
    expect(
      getTreeDragClassNames({
        dragState: null,
        nodeReference: target,
      }),
    ).toEqual([]);
  });

  it("renders block trees with kind, text and line metadata", () => {
    const markup = renderToStaticMarkup(
      <BlockTree
        nodes={[
          {
            children: [],
            hasDiagnostics: true,
            id: "block-1",
            label: "#",
            lineLabel: "L1",
            lineNumber: 1,
            textDisplay: {
              displayText: "标题",
              segments: [{ id: "text", kind: "text", text: "标题" }],
              textColorClassName: "ctn-text-color-default",
            },
          },
        ]}
      />,
    );

    expect(markup).toContain("ui-tree-block");
    expect(markup).toContain("has-diagnostics");
    expect(markup).toContain("L1");
  });
});
