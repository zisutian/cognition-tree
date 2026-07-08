import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BlockTree,
  NoteTree,
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
