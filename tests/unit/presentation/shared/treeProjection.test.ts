import { describe, expect, it } from "vitest";
import {
  defaultStructureTreeIndentUnitCount,
  defaultStructureTreeIndentWidthPx,
  flattenStructureTreeRows,
  flattenVisibleDirectoryTreeRows,
  getStructureTreeIndentWidthPx,
  normalizeStructureTreeIndentUnitCount,
  type StructureTreeNode,
} from "../../../../presentation/ui/shared/tree/index";

describe("treeProjection", () => {
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
      flattenVisibleDirectoryTreeRows(directoryNodes).map(({ depth, node }) => [
        node.id,
        depth,
      ]),
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
