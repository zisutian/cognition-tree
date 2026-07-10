import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  canDropTreeNode,
  createTreeMoveRequest,
  createTreeNodeDragPayload,
  getStructureTreeIndentWidthPx,
  getTreeDragClassNames,
  getTreeNodeReferenceKey,
  normalizeStructureTreeIndentUnitCount,
  NoteTree,
  readTreeNodeDragPayload,
  StructureTree,
  treeNodeDragDataType,
} from "../../../src/ui/shared/tree";

// @ts-expect-error Node built-in types are intentionally outside the app tsconfig.
const { readFileSync } = (await import("node:fs")) as {
  readFileSync: (path: URL, encoding: "utf8") => string;
};
const treeCss = readFileSync(
  new URL("../../../src/ui/styles/shared/tree.css", import.meta.url),
  "utf8",
);

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
    expect(markup).toContain("ui-directory-tree");
    expect(markup).toContain("ui-tree-row");
    expect(markup).toContain("ui-directory-tree-row");
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

  it("uses a toggle spacer for empty directory folders", () => {
    const markup = renderToStaticMarkup(
      <NoteTree
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

    expect(markup).toContain("ui-tree-toggle-spacer");
    expect(markup).not.toContain("lucide-chevron-right");
    expect(markup).not.toContain("aria-expanded=");
  });

  it("provides shared inline rename and confirmed delete actions", () => {
    const markup = renderToStaticMarkup(
      <NoteTree
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

    expect(markup).toContain("ui-tree-actions");
    expect(markup).toContain(">改<");
    expect(markup).toContain(">删<");
    expect(treeCss).toContain(".ui-tree-row-editing input");
    expect(treeCss).toContain(".ui-tree-row-frame.is-delete-pending");
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

  it("renders structure trees with variable text markers and line metadata", () => {
    const markup = renderToStaticMarkup(
      <StructureTree
        indentUnitCount={6}
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
                  textColorClassName: "ctn-text-color-default",
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
              textColorClassName: "ctn-text-color-default",
            },
          },
        ]}
      />,
    );

    expect(markup).toContain("ui-structure-tree");
    expect(markup).toContain("ui-structure-tree-item");
    expect(markup).toContain("ui-structure-tree-row");
    expect(markup).toContain("--ui-structure-depth:0");
    expect(markup).toContain("--ui-structure-depth:1");
    expect(markup).toContain("--ui-structure-indent-width:21px");
    expect(markup).toContain("ui-structure-prefix");
    expect(markup).toContain("ui-structure-marker");
    expect(markup).toContain("组分");
    expect(markup).toContain("顶格概念");
    expect(markup).not.toContain("ui-symbol-slot");
    expect(markup).toContain("has-diagnostics");
    expect(markup).toContain("L1");
  });

  it("renders selected structure subtrees as whole tree items", () => {
    const markup = renderToStaticMarkup(
      <StructureTree
        activeLineNumbers={new Set([1, 2])}
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
                  textColorClassName: "ctn-text-color-default",
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
              textColorClassName: "ctn-text-color-default",
            },
          },
        ]}
        selectedRootLineNumber={1}
      />,
    );

    expect(markup).toContain(
      "ui-structure-tree-item is-selected-subtree is-selected-root",
    );
    expect(markup).toContain("ui-structure-tree-item is-selected-subtree");
    expect(markup).toContain("ui-tree-row ui-structure-tree-row is-selected");
    expect(markup).not.toContain(
      "ui-tree-row ui-structure-tree-row is-selected is-selected-subtree",
    );
    expect(markup).not.toContain(
      "ui-tree-row ui-structure-tree-row is-selected is-selected-root",
    );
  });

  it("normalizes structure tree indentation width for css rendering", () => {
    expect(normalizeStructureTreeIndentUnitCount(8)).toBe(8);
    expect(normalizeStructureTreeIndentUnitCount(2.9)).toBe(2);
    expect(normalizeStructureTreeIndentUnitCount(0)).toBe(4);
    expect(normalizeStructureTreeIndentUnitCount(Number.NaN)).toBe(4);
    expect(getStructureTreeIndentWidthPx()).toBe(14);
    expect(getStructureTreeIndentWidthPx(8)).toBe(28);
    expect(getStructureTreeIndentWidthPx(2.9)).toBe(7);
  });

  it("keeps structure tree indentation separate from directory tree nesting", () => {
    expect(treeCss).toContain(".ui-structure-tree .ui-structure-tree");
    expect(treeCss).toContain("padding-left: 0");
    expect(treeCss).toContain("border-left: 0");
    expect(treeCss).toContain("--ui-structure-indent-width: 14px");
    expect(treeCss).toContain("var(--ui-structure-depth)");
    expect(treeCss).toContain("var(--ui-structure-indent-width)");
    expect(treeCss).toContain("grid-template-columns:\n    max-content");
    expect(treeCss).toContain(".ui-structure-tree-item.is-selected-subtree");
    expect(treeCss).toContain(
      "box-shadow: inset 0 0 0 var(--ui-border-width) var(--color-border-strong)",
    );
    expect(treeCss).not.toContain("color-accent");
    expect(treeCss).not.toContain(
      "minmax(calc(var(--ui-control-height) * 2), max-content)",
    );
  });
});
