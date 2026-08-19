import { describe, expect, it } from "vitest";
import type { UiReferenceGraphView } from "../../../../../application/workspace/projection/viewGraph";
import {
  createVisibleReferenceGraph,
  findReferenceGraphNodeAtPoint,
  getReferenceGraphNodeRadius,
} from "../../../../../presentation/activities/notes/graph/referenceGraphView";

const graphEdges = [
  {
    count: 2,
    id: "note-a->note-b",
    sourceNoteId: "note-a",
    targetNoteId: "note-b",
    targetTitle: "Beta",
  },
  {
    count: 1,
    id: "note-b->note-c",
    sourceNoteId: "note-b",
    targetNoteId: "note-c",
    targetTitle: "Gamma",
  },
];

const graph: UiReferenceGraphView = {
  adjacencyByNoteId: new Map([
    ["note-a", new Set(["note-b"])],
    ["note-b", new Set(["note-a", "note-c"])],
    ["note-c", new Set(["note-b"])],
    ["note-d", new Set()],
  ]),
  detailsByNoteId: new Map([
    ["note-a", { incomingEdges: [], outgoingEdges: [graphEdges[0]!] }],
    [
      "note-b",
      { incomingEdges: [graphEdges[0]!], outgoingEdges: [graphEdges[1]!] },
    ],
    ["note-c", { incomingEdges: [graphEdges[1]!], outgoingEdges: [] }],
    ["note-d", { incomingEdges: [], outgoingEdges: [] }],
  ]),
  edges: graphEdges,
  mostReferencedNodes: [],
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
      referencesOut: 1,
      title: "Beta",
    },
    {
      id: "note-c",
      isolated: false,
      referencesIn: 1,
      referencesOut: 0,
      title: "Gamma",
    },
    {
      id: "note-d",
      isolated: true,
      referencesIn: 0,
      referencesOut: 0,
      title: "Delta",
    },
  ],
  revision: 1,
  stats: {
    edgeCount: 2,
    isolatedCount: 1,
    nodeCount: 4,
  },
};

describe("reference graph view helpers", () => {
  it("keeps the full graph visible in global mode", () => {
    const visibleGraph = createVisibleReferenceGraph(graph, {
      activeNoteId: "note-a",
      hideIsolated: false,
      localDepth: 1,
      mode: "global",
      query: "",
    });

    expect(visibleGraph.nodes.map((node) => node.id)).toEqual([
      "note-a",
      "note-b",
      "note-c",
      "note-d",
    ]);
    expect(visibleGraph.edges.map((edge) => edge.id)).toEqual([
      "note-a->note-b",
      "note-b->note-c",
    ]);
  });

  it("filters isolated nodes without dropping the active note", () => {
    const visibleGraph = createVisibleReferenceGraph(graph, {
      activeNoteId: "note-d",
      hideIsolated: true,
      localDepth: 1,
      mode: "global",
      query: "",
    });

    expect(visibleGraph.nodes.map((node) => node.id)).toEqual([
      "note-a",
      "note-b",
      "note-c",
      "note-d",
    ]);
  });

  it("builds one-hop and two-hop local neighborhoods", () => {
    const oneHop = createVisibleReferenceGraph(graph, {
      activeNoteId: "note-a",
      hideIsolated: false,
      localDepth: 1,
      mode: "local",
      query: "",
    });
    const twoHop = createVisibleReferenceGraph(graph, {
      activeNoteId: "note-a",
      hideIsolated: false,
      localDepth: 2,
      mode: "local",
      query: "",
    });

    expect(oneHop.nodes.map((node) => node.id)).toEqual(["note-a", "note-b"]);
    expect(oneHop.edges.map((edge) => edge.id)).toEqual(["note-a->note-b"]);
    expect(twoHop.nodes.map((node) => node.id)).toEqual([
      "note-a",
      "note-b",
      "note-c",
    ]);
    expect(twoHop.edges.map((edge) => edge.id)).toEqual([
      "note-a->note-b",
      "note-b->note-c",
    ]);
  });

  it("filters visible nodes by title search", () => {
    const visibleGraph = createVisibleReferenceGraph(graph, {
      activeNoteId: "note-a",
      hideIsolated: false,
      localDepth: 2,
      mode: "global",
      query: "bet",
    });

    expect(visibleGraph.nodes.map((node) => node.id)).toEqual(["note-b"]);
    expect(visibleGraph.edges).toEqual([]);
  });

  it("keeps self references as explicit visible edges", () => {
    const selfEdge = {
      count: 1,
      id: "note-a->note-a",
      sourceNoteId: "note-a",
      targetNoteId: "note-a",
      targetTitle: "Alpha",
    };
    const visibleGraph = createVisibleReferenceGraph(
      {
        ...graph,
        detailsByNoteId: new Map([
          ...graph.detailsByNoteId,
          [
            "note-a",
            {
              incomingEdges: [selfEdge],
              outgoingEdges: [graphEdges[0]!, selfEdge],
            },
          ],
        ]),
        edges: [...graph.edges, selfEdge],
      },
      {
        activeNoteId: "note-a",
        hideIsolated: false,
        localDepth: 1,
        mode: "global",
        query: "",
      },
    );

    expect(visibleGraph.edges.map((edge) => edge.id)).toEqual([
      "note-a->note-b",
      "note-a->note-a",
      "note-b->note-c",
    ]);
  });

  it("keeps graph node dots compact", () => {
    expect(
      getReferenceGraphNodeRadius({ referencesIn: 0, referencesOut: 0 }),
    ).toBe(3);
    expect(
      getReferenceGraphNodeRadius({ referencesIn: 8, referencesOut: 8 }),
    ).toBeLessThanOrEqual(12);
  });

  it("finds the topmost graph node at a canvas point", () => {
    const node = findReferenceGraphNodeAtPoint({
      nodes: [
        {
          ...graph.nodes[0],
          radius: 8,
          x: 40,
          y: 40,
        },
        {
          ...graph.nodes[1],
          radius: 12,
          x: 45,
          y: 40,
        },
      ],
      x: 46,
      y: 40,
    });

    expect(node?.id).toBe("note-b");
  });

});
