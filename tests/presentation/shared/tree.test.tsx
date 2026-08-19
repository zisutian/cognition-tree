import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  canDropTreeNode,
  createTreeMoveRequest,
  createTreeMoveOptions,
  createTreeNodeDragPayload,
  createTreeRowDropDestination,
  defaultStructureTreeIndentUnitCount,
  defaultStructureTreeIndentWidthPx,
  flattenStructureTreeRows,
  flattenVisibleDirectoryTreeRows,
  getStructureTreeIndentWidthPx,
  getTreeDragClassNames,
  getTreeNodeReferenceKey,
  normalizeStructureTreeIndentUnitCount,
  NoteTree,
  readTreeNodeDragPayload,
  StructureTree,
  treeNodeDragDataType,
  type StructureTreeNode,
} from "../../../presentation/ui/shared/tree";
import {
  shouldVirtualizeUiRows,
  uiVirtualRowHeightPx,
  uiVirtualizationThreshold,
} from "../../../presentation/ui/shared/virtualListMetrics";

describe("shared trees", () => {
  it("flattens directory and structure trees with their own depth rules", () => {
    const directoryNodes = [
      {
        canDrag: true,
        children: [
          {
            canDrag: true,
            folderId: "folder-1",
            id: "tree-note-1",
            kind: "note" as const,
            noteId: "note-1",
            parentFolderId: "folder-1",
            title: "笔记",
          },
        ],
        folderId: "folder-1",
        id: "folder-1",
        kind: "folder" as const,
        parentFolderId: null,
        title: "文件夹",
      },
    ];
    const structureNodes: StructureTreeNode[] = [
      {
        children: [
          {
            children: [],
            hasDiagnostics: false,
            id: "block-2",
            label: "定义",
            lineLabel: "L2",
            lineNumber: 2,
            textDisplay: {
              displayText: "子块",
              segments: [{ id: "text", kind: "text" as const, text: "子块" }],
              textColor: "default",
            },
          },
        ],
        hasDiagnostics: false,
        id: "block-1",
        label: "概念",
        lineLabel: "L1",
        lineNumber: 1,
        textDisplay: {
          displayText: "根块",
          segments: [{ id: "text", kind: "text" as const, text: "根块" }],
          textColor: "default",
        },
      },
    ];

    expect(
      flattenVisibleDirectoryTreeRows(directoryNodes).map(
        ({ depth, node }) => [node.id, depth],
      ),
    ).toEqual([
      ["folder-1", 0],
      ["tree-note-1", 1],
    ]);
    expect(
      flattenVisibleDirectoryTreeRows(
        directoryNodes,
        new Set(["folder-1"]),
      ).map(({ node }) => node.id),
    ).toEqual(["folder-1"]);
    expect(
      flattenStructureTreeRows(structureNodes).map(({ depth, node }) => [
        node.id,
        depth,
      ]),
    ).toEqual([
      ["block-1", 0],
      ["block-2", 1],
    ]);
  });

  it("flattens a 10,000-level structure tree without recursive traversal", () => {
    let node: StructureTreeNode = {
      children: [],
      hasDiagnostics: false,
      id: "leaf",
      label: "概念",
      lineLabel: "L10001",
      lineNumber: 10_001,
      textDisplay: {
        displayText: "叶节点",
        segments: [{ id: "leaf", kind: "text", text: "叶节点" }],
        textColor: "default",
      },
    };

    for (let depth = 10_000; depth > 0; depth -= 1) {
      node = {
        ...node,
        children: [node],
        id: `depth-${depth}`,
        lineNumber: depth,
      };
    }

    const rows = flattenStructureTreeRows([node]);

    expect(rows).toHaveLength(10_001);
    expect(rows.at(-1)).toMatchObject({ depth: 10_000, node: { id: "leaf" } });
  });

  it("uses the shared UI virtualization boundary", () => {
    expect(shouldVirtualizeUiRows(uiVirtualizationThreshold)).toBe(false);
    expect(shouldVirtualizeUiRows(uiVirtualizationThreshold + 1)).toBe(true);
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

  it("does not expose expansion state for empty directory folders", () => {
    const markup = renderToStaticMarkup(
      <NoteTree
        activeNode={{ kind: "note", noteId: "note-1" }}
        nodes={[
          {
            canDrag: true,
            children: [],
            folderId: "folder-empty",
            id: "folder-empty",
            kind: "folder",
            parentFolderId: null,
            title: "空文件夹",
          },
        ]}
      />,
    );

    expect(markup).toContain("空文件夹");
    expect(markup).not.toContain("aria-expanded=");
  });

  it("provides inline rename and delete entry points without inline confirmation", () => {
    const markup = renderToStaticMarkup(
      <NoteTree
        activeNode={{ kind: "note", noteId: "note-1" }}
        nodes={[
          {
            canDrag: true,
            folderId: null,
            id: "tree-note-1",
            kind: "note",
            noteId: "note-1",
            parentFolderId: null,
            title: "当前笔记",
          },
        ]}
        onDeleteNode={() => undefined}
        onRenameNode={() => undefined}
      />,
    );

    expect(markup).toContain('aria-label="重命名笔记 当前笔记"');
    expect(markup).toContain('aria-label="删除笔记 当前笔记"');
    expect(markup).not.toContain(">确认<");
    expect(markup).not.toContain('role="alertdialog"');
  });

  it("uses active node selection to keep note and folder selection exclusive", () => {
    const markup = renderToStaticMarkup(
      <NoteTree
        activeNode={{ kind: "note", noteId: "note-1" }}
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

    expect(markup.match(/aria-current="page"/g) ?? []).toHaveLength(1);
    expect(markup).toContain('role="tree"');
    expect(markup.match(/role="treeitem"/g) ?? []).toHaveLength(2);
    expect(markup.match(/aria-selected="true"/g) ?? []).toHaveLength(1);
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
    expect(
      getTreeDragClassNames({
        dragState: {
          activeDestination: destination,
          activeTargetCanDrop: true,
          source,
          sourceKey: getTreeNodeReferenceKey(source),
        },
        nodeReference: target,
      }),
    ).toContain("is-drop-target");
    expect(
      getTreeDragClassNames({
        dragState: {
          activeDestination: destination,
          activeTargetCanDrop: true,
          source,
          sourceKey: getTreeNodeReferenceKey(source),
        },
        nodeReference: target,
      }),
    ).toContain("is-drop-after");
    expect(
      getTreeDragClassNames({
        dragState: {
          activeDestination: destination,
          activeTargetCanDrop: false,
          source,
          sourceKey: getTreeNodeReferenceKey(source),
        },
        nodeReference: target,
      }),
    ).toContain("is-drop-disabled");
    expect(
      getTreeDragClassNames({
        dragState: {
          activeDestination: null,
          activeTargetCanDrop: false,
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

  it("renders structure hierarchy, text markers, and line metadata", () => {
    const markup = renderToStaticMarkup(
      <StructureTree
        getRowProps={(node, state) => ({
          "data-depth": String(state.depth),
          "data-line": String(node.lineNumber),
        })}
        nodes={[
          {
            children: [
              {
                children: [],
                hasDiagnostics: false,
                id: "block-2",
                label: "顶格概念",
                lineLabel: "L2",
                lineNumber: 2,
                textDisplay: {
                  displayText: "子节点",
                  segments: [{ id: "text", kind: "text", text: "子节点" }],
                  textColor: "default",
                },
              },
            ],
            hasDiagnostics: true,
            id: "block-1",
            label: "组分",
            lineLabel: "L1",
            lineNumber: 1,
            textDisplay: {
              displayText: "标题",
              segments: [{ id: "text", kind: "text", text: "标题" }],
              textColor: "default",
            },
          },
        ]}
      />,
    );

    expect(markup).toContain('role="tree"');
    expect(markup.match(/role="treeitem"/g) ?? []).toHaveLength(2);
    expect(markup).toContain('aria-level="1"');
    expect(markup).toContain('aria-level="2"');
    expect(markup).toContain('data-depth="1"');
    expect(markup).toContain("data-line=\"2\"");
    expect(markup).toContain("组分");
    expect(markup).toContain("顶格概念");
    expect(markup).toContain("L1");
  });

  it("exposes selected structure subtrees and their root semantically", () => {
    const markup = renderToStaticMarkup(
      <StructureTree
        getRowProps={(_node, state) => ({
          "data-selection-root": String(state.isSelectedRoot),
        })}
        selectedLineNumbers={new Set([1, 2])}
        nodes={[
          {
            children: [
              {
                children: [],
                hasDiagnostics: false,
                id: "block-2",
                label: "定义",
                lineLabel: "L2",
                lineNumber: 2,
                textDisplay: {
                  displayText: "子块",
                  segments: [{ id: "text", kind: "text", text: "子块" }],
                  textColor: "default",
                },
              },
            ],
            hasDiagnostics: false,
            id: "block-1",
            label: "组分",
            lineLabel: "L1",
            lineNumber: 1,
            textDisplay: {
              displayText: "根块",
              segments: [{ id: "text", kind: "text", text: "根块" }],
              textColor: "default",
            },
          },
        ]}
        selectedRootLineNumber={1}
      />,
    );

    expect(markup.match(/aria-selected="true"/g) ?? []).toHaveLength(2);
    expect(markup.match(/data-selection-root="true"/g) ?? []).toHaveLength(1);
  });

  it("normalizes structure tree indentation width for css rendering", () => {
    const doubleIndent = defaultStructureTreeIndentUnitCount * 2;

    expect(normalizeStructureTreeIndentUnitCount(doubleIndent)).toBe(
      doubleIndent,
    );
    expect(normalizeStructureTreeIndentUnitCount(2.9)).toBe(2);
    expect(normalizeStructureTreeIndentUnitCount(0)).toBe(
      defaultStructureTreeIndentUnitCount,
    );
    expect(normalizeStructureTreeIndentUnitCount(Number.NaN)).toBe(
      defaultStructureTreeIndentUnitCount,
    );
    expect(getStructureTreeIndentWidthPx()).toBe(
      defaultStructureTreeIndentWidthPx,
    );
    expect(getStructureTreeIndentWidthPx(doubleIndent)).toBe(
      defaultStructureTreeIndentWidthPx * 2,
    );
    expect(getStructureTreeIndentWidthPx(2.9)).toBe(
      defaultStructureTreeIndentWidthPx *
        (2 / defaultStructureTreeIndentUnitCount),
    );
  });

});
