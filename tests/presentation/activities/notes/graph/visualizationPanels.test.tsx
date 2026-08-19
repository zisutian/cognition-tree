import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VisualizationContext } from "../../../../../presentation/activities/notes/graph/VisualizationContext";
import { VisualizationDetailPanel } from "../../../../../presentation/activities/notes/graph/VisualizationDetailPanel";
import { VisualizationPanel } from "../../../../../presentation/activities/notes/graph/VisualizationPanel";
import { ReferenceGraphCanvas } from "../../../../../presentation/activities/notes/graph/ReferenceGraphCanvas";
import {
  createReferenceGraphSession,
  createVisualizationView,
} from "../../../fixtures/visualizationViewFixture";
import { defaultReferenceGraphSettings } from "../../../../../presentation/activities/notes/graph/referenceGraphSettings";

describe("visualization panels", () => {
  it("exposes keyboard graph navigation and live selection status", () => {
    const markup = renderToStaticMarkup(
      <ReferenceGraphCanvas
        displaySettings={{ ...defaultReferenceGraphSettings.display }}
        forceSettings={{ ...defaultReferenceGraphSettings.forces }}
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

  it("exposes graph filters, search, reset, and settings controls", () => {
    const session = createReferenceGraphSession();
    const view = createVisualizationView();
    const contextMarkup = renderToStaticMarkup(
      <VisualizationContext session={session} view={view} />,
    );
    const panelMarkup = renderToStaticMarkup(
      <VisualizationPanel session={session} view={view} />,
    );

    expect(contextMarkup).toContain("aria-label=\"图谱控制\"");
    expect(contextMarkup).toContain("aria-label=\"搜索笔记标题\"");
    expect(contextMarkup).toContain("placeholder=\"笔记标题\"");
    expect(contextMarkup).toContain("aria-pressed=\"false\"");
    expect(contextMarkup).toContain("隐藏孤立点");
    expect(contextMarkup).toContain("aria-label=\"重置图谱视图\"");
    expect(contextMarkup).toContain("aria-label=\"图谱设置\"");
    expect(panelMarkup).toContain("aria-label=\"引用图谱\"");
    expect(panelMarkup).not.toContain("aria-label=\"图谱控制\"");
    expect(panelMarkup).not.toContain("aria-label=\"搜索笔记标题\"");
  });

  it("renders graph statistics and reference groups", () => {
    const view = createVisualizationView({
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
    });
    const markup = renderToStaticMarkup(
      <VisualizationDetailPanel
        onCollapseDetail={() => undefined}
        view={view}
      />,
    );

    expect(markup).toContain("<dd>3</dd><dt>点</dt>");
    expect(markup).toContain("<dd>2</dd><dt>边</dt>");
    expect(markup).toContain("Target note");
    expect(markup).toContain("入链");
    expect(markup).toContain("出链");
    expect(markup).not.toContain("未解析引用");
  });
});
