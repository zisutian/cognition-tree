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
];

const defaultFolderTree: UiTreeNode[] = [
  {
    canDrag: false,
    folderId: "folder-inbox",
    id: "folder-inbox",
    kind: "folder",
    parentFolderId: null,
    title: "内部默认文件夹",
    childCount: 0,
    children: [],
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
      defaultFolderId="folder-inbox"
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

  it("renders row actions only for the active non-default folder", () => {
    const markup = renderNotesSidebarTree({
      selectedTreeNodeKey: "folder:folder-project",
    });

    expect(markup).toContain("重命名文件夹");
    expect(markup).toContain("删除文件夹");
    expect(markup).not.toContain("重命名笔记");
    expect(markup).not.toContain("删除笔记");
  });

  it("does not render row actions for the default folder", () => {
    const markup = renderNotesSidebarTree({
      nodes: defaultFolderTree,
      selectedTreeNodeKey: "folder:folder-inbox",
    });

    expect(markup).not.toContain("重命名文件夹");
    expect(markup).not.toContain("删除文件夹");
  });
});
