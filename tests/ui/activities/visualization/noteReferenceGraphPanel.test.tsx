import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { UiVisualizationViewModel } from "../../../../src/application/workspace/projection/viewGraph";
import { NoteReferenceGraphDetailPanel } from "../../../../src/ui/activities/visualization/NoteReferenceGraphDetailPanel";
import { NoteReferenceGraphPanel } from "../../../../src/ui/activities/visualization/NoteReferenceGraphPanel";

const visualization: UiVisualizationViewModel = {
  activeNoteId: "note-a",
  graph: {
    edges: [
      {
        count: 2,
        id: "note-a->note-b",
        sourceNoteId: "note-a",
        targetNoteId: "note-b",
        targetTitle: "Beta",
      },
    ],
    mostReferencedNodes: [
      {
        id: "note-a",
        isolated: false,
        referencesIn: 0,
        referencesOut: 2,
        title: "Alpha",
        totalReferences: 2,
      },
    ],
    nodes: [
      {
        id: "note-a",
        isolated: false,
        referencesIn: 0,
        referencesOut: 2,
        title: "Alpha",
      },
      {
        id: "note-b",
        isolated: false,
        referencesIn: 2,
        referencesOut: 0,
        title: "Beta",
      },
    ],
    stats: {
      edgeCount: 1,
      isolatedCount: 0,
      nodeCount: 2,
    },
    unresolvedReferences: [],
  },
  onSelectNote: () => undefined,
};

describe("NoteReferenceGraphPanel", () => {
  it("renders the force graph canvas and basic graph controls", () => {
    const markup = renderToStaticMarkup(
      <NoteReferenceGraphPanel visualization={visualization} />,
    );

    expect(markup).toContain("笔记引用图谱");
    expect(markup).toContain("aria-label=\"图谱控制\"");
    expect(markup).toContain("全库");
    expect(markup).toContain("局部");
    expect(markup).toContain("隐藏孤立点");
    expect(markup).toContain("重置视图");
    expect(markup).toContain("note-reference-graph-canvas");
    expect(markup).toContain("aria-label=\"笔记引用力导向图\"");
    expect(markup).not.toContain("note-reference-graph\"");
  });

  it("renders selected node details in the right detail panel", () => {
    const markup = renderToStaticMarkup(
      <NoteReferenceGraphDetailPanel visualization={visualization} />,
    );

    expect(markup).toContain("当前节点");
    expect(markup).toContain("Alpha");
    expect(markup).toContain("<dd>0</dd><dt>入链</dt>");
    expect(markup).toContain("<dd>2</dd><dt>出链</dt>");
    expect(markup).toContain("Beta");
    expect(markup).toContain("被此笔记引用");
    expect(markup).toContain("aria-label=\"图谱统计\"");
  });
});
