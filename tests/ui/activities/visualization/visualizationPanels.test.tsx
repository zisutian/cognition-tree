import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VisualizationDetailPanel } from "../../../../src/ui/activities/visualization/VisualizationPanels";
import { createView } from "../../viewFactory";

describe("visualization detail panel", () => {
  it("renders all reference lists with unified detail row structure", () => {
    const view = createView({
      visualization: {
        activeNoteId: "note-target",
        graph: {
          edges: [
            {
              count: 2,
              id: "edge-in",
              sourceNoteId: "note-source",
              targetNoteId: "note-target",
              targetTitle: "Target note",
            },
            {
              count: 1,
              id: "edge-out",
              sourceNoteId: "note-target",
              targetNoteId: "note-other",
              targetTitle: "Other note",
            },
          ],
          mostReferencedNodes: [
            {
              id: "note-target",
              isolated: false,
              referencesIn: 2,
              referencesOut: 1,
              title: "Target note",
              totalReferences: 3,
            },
          ],
          nodes: [
            {
              id: "note-source",
              isolated: false,
              referencesIn: 0,
              referencesOut: 2,
              title: "Source note",
            },
            {
              id: "note-target",
              isolated: false,
              referencesIn: 2,
              referencesOut: 1,
              title: "Target note",
            },
            {
              id: "note-other",
              isolated: false,
              referencesIn: 1,
              referencesOut: 0,
              title: "Other note",
            },
          ],
          stats: {
            edgeCount: 2,
            isolatedCount: 0,
            nodeCount: 3,
          },
          unresolvedReferences: [
            {
              count: 1,
              sourceNoteId: "note-target",
              sourceTitle: "Target note",
              targetText: "Missing note",
            },
          ],
        },
        onSelectNote: () => undefined,
      },
    });
    const markup = renderToStaticMarkup(
      <VisualizationDetailPanel
        onCollapseDetail={() => undefined}
        view={view}
      />,
    );

    expect(markup.match(/detail-row-list/g)?.length).toBe(3);
    expect(markup.match(/detail-row-main/g)?.length).toBeGreaterThanOrEqual(4);
    expect(markup).toContain("detail-row-button");
  });
});
