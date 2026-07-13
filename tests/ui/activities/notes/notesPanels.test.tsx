import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  NoteDetailPanel,
  NotesContext,
} from "../../../../src/ui/activities/notes/NotesPanels";
import { createView } from "../../viewFactory";

describe("notes panels", () => {
  it("keeps note and folder selection visually exclusive in the directory", () => {
    const baseView = createView();
    const markup = renderToStaticMarkup(
      <NotesContext
        view={{
          ...baseView.notes,
          directory: {
            ...baseView.notes.directory,
            activeFolderId: "folder-1",
            activeNode: { folderId: "folder-1", kind: "folder" },
            noteTree: [
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
            ],
          },
        }}
      />,
    );

    expect(markup.match(/ui-tree-row-frame is-selected/g) ?? []).toHaveLength(1);
    expect(markup).toContain("文件夹");
    expect(markup).toContain("当前笔记");
  });

  it("uses divider and marker rows instead of section titles in note detail", () => {
    const baseView = createView();
    const markup = renderToStaticMarkup(
      <NoteDetailPanel
        onCollapseDetail={() => undefined}
        view={{
          ...baseView.notes,
          editor: {
            ...baseView.notes.editor,
            diagnostics: [
              {
                id: "diagnostic-1",
                lineNumber: 3,
                message: "示例诊断",
              },
            ],
            stats: {
              diagnosticCount: 1,
              lineCount: 8,
              rootCount: 1,
              totalBlocks: 2,
            },
            syntaxProfile: {
              ...baseView.notes.editor.syntaxProfile,
              tabDisplayWidth: 6,
            },
          },
          outline: {
            nodes: [
              {
                children: [
                  {
                    children: [],
                    hasDiagnostics: false,
                    id: "outline-2",
                    label: "定义",
                    lineLabel: "L2",
                    lineNumber: 2,
                    textDisplay: {
                      displayText: "子结构",
                      segments: [{ id: "text", kind: "text", text: "子结构" }],
                      textColor: "default",
                    },
                  },
                ],
                hasDiagnostics: false,
                id: "outline-1",
                label: "T",
                lineLabel: "L1",
                lineNumber: 1,
                textDisplay: {
                  displayText: "当前笔记",
                  segments: [{ id: "text", kind: "text", text: "当前笔记" }],
                  textColor: "default",
                },
              },
            ],
            onSelectLine: () => undefined,
          },
        }}
      />,
    );

    expect(markup).toContain("detail-summary-strip");
    expect(markup).toContain("detail-divider");
    expect(markup).toContain("detail-line-list");
    expect(markup).toContain("detail-line-marker");
    expect(markup).toContain("--ui-structure-depth:1");
    expect(markup).toContain("--ui-structure-indent-width:21px");
    expect(markup).toContain("ui-symbol-slot");
    expect(markup).toContain("ui-symbol-slot-danger");
    expect(markup).toContain("示例诊断");
    expect(markup).not.toContain("ui-section-title");
    expect(markup).not.toContain("ui-metrics");
    expect(markup).not.toContain("dense-list");
  });
});
