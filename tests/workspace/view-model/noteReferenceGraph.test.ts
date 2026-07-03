import { describe, expect, it } from "vitest";
import {
  createNoteRecord,
} from "../../../src/workspace/model/workspaceData";
import { defaultCtnSyntaxProfile } from "../../../src/ctn-syntax/defaultSyntaxProfile";
import { createNoteReferenceGraph } from "../../../src/workspace/view-model/noteReferenceGraph";
import { createInitialWorkspaceRuntime } from "../../../src/workspace/runtime/workspaceRuntime";

const timestamp = "2026-07-02T00:00:00.000Z";

describe("createNoteReferenceGraph", () => {
  it("creates note nodes, reference edges, and isolated nodes", () => {
    const source = createNoteRecord(
      "note-source",
      "Source [[Target]]",
      timestamp,
    );
    const target = createNoteRecord(
      "note-target",
      "Target",
      timestamp,
    );
    const isolated = createNoteRecord(
      "note-isolated",
      "Isolated",
      timestamp,
    );
    const workspace = {
      ...createInitialWorkspaceRuntime(defaultCtnSyntaxProfile),
      notes: [source, target, isolated],
    };

    expect(createNoteReferenceGraph(workspace)).toMatchObject({
      edges: [
        {
          count: 1,
          sourceNoteId: "note-source",
          targetNoteId: "note-target",
          targetTitle: "Target",
        },
      ],
      nodes: [
        {
          id: "note-source",
          isolated: false,
          referencesOut: 1,
        },
        {
          id: "note-target",
          isolated: false,
          referencesIn: 1,
        },
        {
          id: "note-isolated",
          isolated: true,
        },
      ],
      unresolvedReferences: [],
    });
  });

  it("keeps unresolved global references visible", () => {
    const source = createNoteRecord(
      "note-source",
      "Source [[Missing Note]] and [[Missing Note]]",
      timestamp,
    );
    const workspace = {
      ...createInitialWorkspaceRuntime(defaultCtnSyntaxProfile),
      notes: [source],
    };

    expect(createNoteReferenceGraph(workspace)).toMatchObject({
      edges: [],
      nodes: [
        {
          id: "note-source",
          isolated: false,
          referencesOut: 2,
        },
      ],
      unresolvedReferences: [
        {
          count: 2,
          sourceNoteId: "note-source",
          targetText: "Missing Note",
        },
      ],
    });
  });

  it("ignores global-reference text inside multiline blocks", () => {
    const source = createNoteRecord(
      "note-source",
      "Source\n    ```txt\n    [[Target]]\n    ```",
      timestamp,
    );
    const target = createNoteRecord("note-target", "Target", timestamp);
    const workspace = {
      ...createInitialWorkspaceRuntime(defaultCtnSyntaxProfile),
      notes: [source, target],
    };

    expect(createNoteReferenceGraph(workspace)).toMatchObject({
      edges: [],
      nodes: [
        {
          id: "note-source",
          isolated: true,
        },
        {
          id: "note-target",
          isolated: true,
        },
      ],
    });
  });

});
