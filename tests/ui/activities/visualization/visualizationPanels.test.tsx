import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VisualizationDetailPanel } from "../../../../presentation/activities/views/visualization/VisualizationDetailPanel";
import { VisualizationPanel } from "../../../../presentation/activities/views/visualization/VisualizationPanel";
import { ReferenceGraphCanvas } from "../../../../presentation/activities/views/visualization/ReferenceGraphCanvas";
import { createView } from "../../viewFactory";

describe("visualization panels", () => {
  it("exposes keyboard graph navigation and live selection status", () => {
    const markup = renderToStaticMarkup(
      <ReferenceGraphCanvas
        graph={{
          edges: [],
          nodes: [
            {
              id: "note-a",
              isolated: true,
              referencesIn: 0,
              referencesOut: 0,
              radius: 4,
              title: "Alpha",
            },
          ],
        }}
        resetSignal={0}
        selectedNoteId={null}
        topologyRevision="revision-1"
        onSelectNote={() => undefined}
      />,
    );

    expect(markup).toContain('role="application"');
    expect(markup).toContain('aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Enter"');
    expect(markup).toContain('aria-live="polite"');
  });

  it("keeps main graph controls free of header metrics and visible search label", () => {
    const markup = renderToStaticMarkup(
      <VisualizationPanel view={createView().visualization} />,
    );

    expect(markup).toContain("引用图谱");
    expect(markup).toContain("ui-segmented-control");
    expect(markup).toContain("graph-search-field");
    expect(markup).toContain("aria-label=\"搜索笔记标题\"");
    expect(markup).toContain("placeholder=\"笔记标题\"");
    expect(markup).toContain("ui-toggle-button");
    expect(markup).toContain("aria-pressed=\"false\"");
    expect(markup).toContain("隐藏孤立点");
    expect(markup).toContain("aria-label=\"重置图谱视图\"");
    expect(markup).toContain("ui-button-icon");
    expect(markup).not.toContain(">搜索<");
    expect(markup).not.toContain("graph-segments");
    expect(markup).not.toContain("graph-toggle");
    expect(markup).not.toContain("graph-toggle-track");
    expect(markup).not.toContain("ui-metrics");
    expect(markup.indexOf("aria-label=\"重置图谱视图\"")).toBeLessThan(
      markup.indexOf("graph-search-field"),
    );
  });

  it("renders all reference lists with unified detail row structure", () => {
    const view = createView({
      visualization: {
        activeNoteId: "note-target",
        filter: {
          hideIsolated: false,
          localDepth: 1,
          mode: "global",
          query: "",
        },
        graph: {
          adjacencyByNoteId: new Map([
            ["note-source", new Set(["note-target"])],
            ["note-target", new Set(["note-source", "note-other"])],
            ["note-other", new Set(["note-target"])],
          ]),
          detailsByNoteId: new Map([
            [
              "note-target",
              {
                incomingEdges: [
                  {
                    count: 2,
                    id: "edge-in",
                    sourceNoteId: "note-source",
                    targetNoteId: "note-target",
                    targetTitle: "Target note",
                  },
                ],
                outgoingEdges: [
                  {
                    count: 1,
                    id: "edge-out",
                    sourceNoteId: "note-target",
                    targetNoteId: "note-other",
                    targetTitle: "Other note",
                  },
                ],
              },
            ],
          ]),
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
          revision: 2,
          stats: {
            edgeCount: 2,
            isolatedCount: 0,
            nodeCount: 3,
          },
        },
        onSelectNote: () => undefined,
        setHideIsolated: () => undefined,
        setLocalDepth: () => undefined,
        setMode: () => undefined,
        setQuery: () => undefined,
      },
    });
    const markup = renderToStaticMarkup(
      <VisualizationDetailPanel
        onCollapseDetail={() => undefined}
        view={view.visualization}
      />,
    );

    expect(markup).toContain("detail-summary-strip");
    expect(markup).toContain("detail-primary-row");
    expect(markup).toContain("detail-meta-line");
    expect(markup.match(/class="detail-divider"/g)).toHaveLength(3);
    expect(markup).toContain("<dd>3</dd><dt>点</dt>");
    expect(markup).toContain("<dd>2</dd><dt>边</dt>");
    expect(markup).toContain("Target note");
    expect(markup).toContain("入链");
    expect(markup).toContain("出链");
    expect(markup).not.toContain("ui-metrics");
    expect(markup).not.toContain("detail-list");
    expect(markup).not.toContain("detail-row-list");
    expect(markup).not.toContain("ui-section-title");
    expect(markup.match(/detail-line-list/g)?.length).toBe(2);
    expect(markup.match(/detail-line-main/g)?.length).toBeGreaterThanOrEqual(3);
    expect(markup.match(/detail-line-marker/g)?.length).toBeGreaterThanOrEqual(3);
    expect(markup.match(/ui-symbol-slot/g)?.length).toBeGreaterThanOrEqual(3);
    expect(markup).toContain("detail-line-button");
    expect(markup).not.toContain("未解析引用");
  });
});
