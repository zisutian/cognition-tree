import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { UiTreeNode } from "../../../../src/application/workspace/projection/viewTree";
import { NotesSidebarTree } from "../../../../src/ui/activities/notes/NotesSidebarTree";

const noteTree: UiTreeNode[] = [
  {
    canDrag: true,
    folderId: "folder-project",
    id: "folder-project",
    kind: "folder",
    parentFolderId: null,
    title: "项目",
    childCount: 0,
    children: [],
  },
  {
    canDrag: true,
    folderId: null,
    id: "tree-note-source",
    kind: "note",
    noteId: "note-source",
    parentFolderId: null,
    title: "源笔记",
  },
];

function renderNotesSidebarTree({
  nodes = noteTree,
  selectedTreeNodeKey = "note:note-source",
}: {
  nodes?: UiTreeNode[];
  selectedTreeNodeKey?: string | null;
} = {}) {
  return renderToStaticMarkup(
    <NotesSidebarTree
      activeDropTargetKey={null}
      collapsedFolderIds={new Set()}
      draggingNodeKey={null}
      nodes={nodes}
      selectedTreeNodeKey={selectedTreeNodeKey}
      onDeleteFolder={() => undefined}
      onDeleteNote={() => undefined}
      onDragEnd={() => undefined}
      onDragLeaveDropTarget={() => undefined}
      onDragOverDropTarget={() => undefined}
      onDragStart={() => undefined}
      onDropOnTreeNode={() => undefined}
      onOpenFolderMenu={() => undefined}
      onOpenNoteMenu={() => undefined}
      onRenameFolder={() => undefined}
      onRenameNote={() => undefined}
      onSelectFolder={() => undefined}
      onSelectNote={() => undefined}
      onToggleFolder={() => undefined}
    />,
  );
}

describe("NotesSidebarTree", () => {
  it("renders draggable sibling nodes and tree drop zones", () => {
    const markup = renderNotesSidebarTree();

    expect(markup).toContain("note-tree-drop-zone");
    expect(markup).toContain("note-tree-node-frame");
    expect(markup).toContain("note-tree-drop-zone-before");
    expect(markup).toContain("note-tree-drop-zone-after");
    expect(markup).not.toContain("仓库根目录");
    expect(markup.match(/draggable="true"/g)).toHaveLength(2);
    expect(markup).toContain("项目");
    expect(markup).toContain("源笔记");
  });

  it("renders row actions only for the active note", () => {
    const markup = renderNotesSidebarTree();

    expect(markup).toContain("重命名笔记");
    expect(markup).toContain("删除笔记");
    expect(markup).not.toContain("重命名文件夹");
    expect(markup).not.toContain("删除文件夹");
  });

  it("renders row actions only for the active folder", () => {
    const markup = renderNotesSidebarTree({
      selectedTreeNodeKey: "folder:folder-project",
    });

    expect(markup).toContain("重命名文件夹");
    expect(markup).toContain("删除文件夹");
    expect(markup).not.toContain("重命名笔记");
    expect(markup).not.toContain("删除笔记");
  });

});
