import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NoteSelectionView } from "../../../../src/ui/activities/migration/NoteSelectionView";
import type { NoteTreeNode } from "../../../../src/workspace/model/workspaceData";

const noteTree: NoteTreeNode[] = [
  {
    id: "folder-inbox",
    kind: "folder",
    title: "仓库根目录",
    children: [
      {
        id: "folder-project",
        kind: "folder",
        title: "项目",
        children: [
          {
            id: "tree-note-source",
            kind: "note",
            noteId: "note-source",
          },
          {
            id: "tree-note-target",
            kind: "note",
            noteId: "note-target",
          },
        ],
      },
    ],
  },
];

describe("NoteSelectionView", () => {
  it("renders folder-backed note choices without offering the source note as a target", () => {
    const markup = renderToStaticMarkup(
      <NoteSelectionView
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
