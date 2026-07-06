import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { UiTreeNode } from "../../../../src/application/workspace/projection/viewTree";
import { NotesSidebarTree } from "../../../../src/ui/activities/notes/NotesSidebarTree";

const noteTree: UiTreeNode[] = [
  {
    canDrag: false,
    childCount: 2,
    children: [
      {
        canDrag: true,
        folderId: "folder-project",
        id: "folder-project",
        kind: "folder",
        parentFolderId: "folder-inbox",
        title: "项目",
        childCount: 0,
        children: [],
      },
      {
        canDrag: true,
        folderId: "folder-inbox",
        id: "tree-note-source",
        kind: "note",
        noteId: "note-source",
        parentFolderId: "folder-inbox",
        title: "源笔记",
      },
    ],
    folderId: "folder-inbox",
    id: "folder-inbox",
    kind: "folder",
    parentFolderId: null,
    title: "仓库根目录",
  },
];

describe("NotesSidebarTree", () => {
  it("renders draggable sibling nodes and tree drop zones", () => {
    const markup = renderToStaticMarkup(
      <NotesSidebarTree
        activeDropTargetKey={null}
        activeFolderId="folder-inbox"
        activeNoteId="note-source"
        collapsedFolderIds={new Set()}
        draggingNodeKey={null}
        nodes={noteTree}
        onDragEnd={() => undefined}
        onDragLeaveDropTarget={() => undefined}
        onDragOverDropTarget={() => undefined}
        onDragStart={() => undefined}
        onDropOnTreeNode={() => undefined}
        onOpenFolderMenu={() => undefined}
        onOpenNoteMenu={() => undefined}
        onSelectFolder={() => undefined}
        onSelectNote={() => undefined}
        onToggleFolder={() => undefined}
      />,
    );

    expect(markup).toContain("note-tree-drop-zone");
    expect(markup).toContain("note-tree-node-frame");
    expect(markup).toContain("note-tree-drop-zone-before");
    expect(markup).toContain("note-tree-drop-zone-after");
    expect(markup).toContain('draggable="false"');
    expect(markup.match(/draggable="true"/g)).toHaveLength(2);
    expect(markup).toContain("项目");
    expect(markup).toContain("源笔记");
  });
});
