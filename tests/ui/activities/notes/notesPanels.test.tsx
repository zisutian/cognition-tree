import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NotesContext } from "../../../../src/ui/activities/notes/NotesPanels";
import { createView } from "../../viewFactory";

describe("notes panels", () => {
  it("keeps note and folder selection visually exclusive in the directory", () => {
    const baseView = createView();
    const markup = renderToStaticMarkup(
      <NotesContext
        view={createView({
          sidebar: {
            ...baseView.sidebar,
            activeFolderId: "folder-1",
            activeNoteFolderId: "folder-1",
            activeNoteId: "note-1",
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
        })}
      />,
    );

    expect(markup.match(/ui-tree-row-frame is-selected/g) ?? []).toHaveLength(1);
    expect(markup).toContain("文件夹");
    expect(markup).toContain("当前笔记");
  });
});
