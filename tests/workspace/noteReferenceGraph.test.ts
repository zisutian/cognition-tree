import { describe, expect, it } from "vitest";
import {
  createInitialWorkspace,
  createNoteRecord,
} from "../../src/domain/notes";
import { defaultCtnSyntaxProfile } from "../../src/syntax/defaultSyntaxProfile";
import { createNoteReferenceGraph } from "../../src/workspace/noteReferenceGraph";

const timestamp = "2026-07-02T00:00:00.000Z";

describe("createNoteReferenceGraph", () => {
  it("creates note nodes, reference edges, and isolated nodes", () => {
    const source = createNoteRecord(
      "note-source",
      "Source\n    [[Target]]",
      timestamp,
      defaultCtnSyntaxProfile,
    );
    const target = createNoteRecord(
      "note-target",
      "Target",
      timestamp,
      defaultCtnSyntaxProfile,
    );
    const isolated = createNoteRecord(
      "note-isolated",
      "Isolated",
      timestamp,
      defaultCtnSyntaxProfile,
    );
    const workspace = {
      ...createInitialWorkspace([defaultCtnSyntaxProfile]),
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
      "Source\n    [[Missing Note]]\n    [[Missing Note]]",
      timestamp,
      defaultCtnSyntaxProfile,
    );
    const workspace = {
      ...createInitialWorkspace([defaultCtnSyntaxProfile]),
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

  it("reports notes whose syntax profile cannot be resolved", () => {
    const note = {
      ...createNoteRecord(
        "note-source",
        "Source\n    [[Target]]",
        timestamp,
        defaultCtnSyntaxProfile,
      ),
      syntaxProfileId: "missing-profile",
    };
    const workspace = {
      ...createInitialWorkspace([defaultCtnSyntaxProfile]),
      notes: [note],
    };

    expect(createNoteReferenceGraph(workspace)).toMatchObject({
      edges: [],
      issues: [
        {
          noteId: "note-source",
        },
      ],
      nodes: [
        {
          id: "note-source",
          isolated: true,
        },
      ],
    });
  });
});
