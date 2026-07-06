import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MigrationNoteSelectionView } from "../../../../src/ui/activities/migration/MigrationNoteSelectionView";
import type { UiTreeNode } from "../../../../src/application/workspace/projection/viewTree";

const noteTree: UiTreeNode[] = [
  {
    canDrag: false,
    childCount: 1,
    folderId: "folder-inbox",
    id: "folder-inbox",
    kind: "folder",
    parentFolderId: null,
    title: "仓库根目录",
    children: [
      {
        canDrag: true,
        childCount: 2,
        folderId: "folder-project",
        id: "folder-project",
        kind: "folder",
        parentFolderId: "folder-inbox",
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
    ],
  },
];

describe("MigrationNoteSelectionView", () => {
  it("renders folder-backed note choices without offering the source note as a target", () => {
    const markup = renderToStaticMarkup(
      <MigrationNoteSelectionView
        noteTree={noteTree}
        notes={[
          { id: "note-source", title: "Source note" },
          { id: "note-target", title: "Target note" },
        ]}
        sourceNoteId="note-source"
        targetNoteId="note-target"
        onComplete={() => undefined}
        onSourceNoteChange={() => undefined}
        onTargetNoteChange={() => undefined}
      />,
    );

    expect(markup).toContain("项目");
    expect(markup.match(/title="Source note"/g)).toHaveLength(1);
    expect(markup.match(/title="Target note"/g)).toHaveLength(2);
  });
});
