import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { UiTreeNode } from "../../../../src/application/workspace/projection/viewTree";
import { MigrationSidebarPanel } from "../../../../src/ui/activities/migration/MigrationSidebarPanel";

const noteTree: UiTreeNode[] = [
  {
    canDrag: true,
    childCount: 2,
    folderId: "folder-project",
    id: "folder-project",
    kind: "folder",
    parentFolderId: null,
    title: "项目",
    children: [
      {
        canDrag: true,
        folderId: "folder-project",
        id: "tree-note-source",
        kind: "note",
        noteId: "note-source",
        parentFolderId: "folder-project",
        title: "Source note",
      },
      {
        canDrag: true,
        folderId: "folder-project",
        id: "tree-note-target",
        kind: "note",
        noteId: "note-target",
        parentFolderId: "folder-project",
        title: "Target note",
      },
    ],
  },
];

describe("MigrationSidebarPanel", () => {
  it("renders a note tree for migration pairing without note management actions", () => {
    const markup = renderToStaticMarkup(
      <MigrationSidebarPanel
        noteTree={noteTree}
        sourceNoteId="note-source"
        targetNoteId="note-target"
        onPairNotesForMigration={() => undefined}
      />,
    );

    expect(markup).toContain("迁移目录");
    expect(markup).toContain("项目");
    expect(markup).toContain("Source note");
    expect(markup).toContain("Target note");
    expect(markup).toContain("draggable=\"true\"");
    expect(markup).toContain("源");
    expect(markup).toContain("目标");
    expect(markup).not.toContain("笔记选择");
    expect(markup).not.toContain("重命名");
    expect(markup).not.toContain("删除");
    expect(markup).not.toContain("新建");
  });
});
