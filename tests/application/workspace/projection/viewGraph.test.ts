import { describe, expect, it } from "vitest";
import { createUiReferenceGraphView } from "../../../../src/application/workspace/projection/viewGraph";

describe("reference graph projection", () => {
  it("precomputes topology revision, adjacency, details and deterministic ranking", () => {
    const view = createUiReferenceGraphView({
      ambiguousReferences: [],
      edges: [
        {
          count: 2,
          id: "alpha->beta",
          sourceNoteId: "alpha",
          targetNoteId: "beta",
          targetTitle: "Beta",
        },
        {
          count: 1,
          id: "alpha->alpha",
          sourceNoteId: "alpha",
          targetNoteId: "alpha",
          targetTitle: "Alpha",
        },
      ],
      nodes: [
        {
          id: "alpha",
          isolated: false,
          referencesIn: 1,
          referencesOut: 3,
          title: "Alpha",
        },
        {
          id: "beta",
          isolated: false,
          referencesIn: 2,
          referencesOut: 0,
          title: "Beta",
        },
      ],
      revision: 42,
      unresolvedReferences: [],
    });

    expect(view.revision).toBe(42);
    expect([...view.adjacencyByNoteId.get("alpha") ?? []]).toEqual([
      "beta",
      "alpha",
    ]);
    expect(view.detailsByNoteId.get("alpha")).toMatchObject({
      incomingEdges: [expect.objectContaining({ id: "alpha->alpha" })],
      outgoingEdges: [
        expect.objectContaining({ id: "alpha->beta" }),
        expect.objectContaining({ id: "alpha->alpha" }),
      ],
    });
    expect(view.detailsByNoteId.get("beta")).toMatchObject({
      incomingEdges: [expect.objectContaining({ id: "alpha->beta" })],
      outgoingEdges: [],
    });
    expect(view.mostReferencedNodes.map(({ id }) => id)).toEqual([
      "alpha",
      "beta",
    ]);
  });
});
