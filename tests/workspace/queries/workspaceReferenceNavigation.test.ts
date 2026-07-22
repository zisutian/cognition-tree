import { describe, expect, it } from "vitest";
import { defaultCtnSyntaxProfile } from "../../../core/ctn/syntax/defaultSyntaxProfile";
import { createWorkspaceParseIndex } from "../../../core/workspace/indexes/workspaceParseIndex";
import { createWorkspaceStructureIndex } from "../../../core/workspace/indexes/workspaceStructureIndex";
import { resolveWorkspaceReferenceNavigation } from "../../../core/workspace/queries/workspaceReferenceNavigation";
import {
  createCanonicalTestNote,
  createWorkspaceDataWithNotes,
} from "../workspaceTestFixture";

function createIndex() {
  const notes = [
    createCanonicalTestNote(
      "source",
      "Source\nConcept\n\t: Concept\n\t- Other",
    ),
    createCanonicalTestNote("target-a", "Target", { idOffset: 100 }),
    createCanonicalTestNote("target-b", "Target  ", { idOffset: 200 }),
  ];
  const workspace = createWorkspaceStructureIndex(
    createWorkspaceDataWithNotes(notes),
  );

  return createWorkspaceParseIndex({
    syntaxProfile: defaultCtnSyntaxProfile,
    workspace,
  });
}

describe("workspace reference navigation", () => {
  it("lists every candidate for an ambiguous normalized note title", () => {
    const index = createIndex();

    expect(
      resolveWorkspaceReferenceNavigation({
        activeNoteId: "source",
        index,
        target: { text: "  Target ", type: "global-reference" },
      }).map(({ noteId }) => noteId),
    ).toEqual(["target-a", "target-b"]);
  });

  it("resolves matching blocks only inside the active note", () => {
    const destinations = resolveWorkspaceReferenceNavigation({
      activeNoteId: "source",
      index: createIndex(),
      target: { text: "Concept", type: "local-reference" },
    });

    expect(destinations).toHaveLength(2);
    expect(destinations.map(({ noteId }) => noteId)).toEqual([
      "source",
      "source",
    ]);
    expect(destinations.map(({ description }) => description)).toEqual([
      expect.stringMatching(/^L\d+ · 顶格概念$/),
      expect.stringMatching(/^L\d+ · 定义$/),
    ]);
  });

  it("rejects unknown reference types and partial matches", () => {
    const index = createIndex();
    const resolve = (text: string, type: string) =>
      resolveWorkspaceReferenceNavigation({
        activeNoteId: "source",
        index,
        target: { text, type },
      });

    expect(resolve("Tar", "global-reference")).toEqual([]);
    expect(resolve("Target", "inline-code")).toEqual([]);
  });
});
