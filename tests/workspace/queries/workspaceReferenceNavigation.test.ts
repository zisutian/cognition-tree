import { describe, expect, it } from "vitest";
import { defaultCtnSyntaxProfile } from "../../../src/ctn/syntax/defaultSyntaxProfile";
import {
  createWorkspaceParseIndex,
} from "../../../src/workspace/indexes/workspaceParseIndex";
import {
  createWorkspaceStructureIndex,
} from "../../../src/workspace/indexes/workspaceStructureIndex";
import {
  createInitialWorkspaceData,
  createNoteRecord,
} from "../../../src/workspace/model/workspaceData";
import {
  resolveWorkspaceReferenceNavigation,
} from "../../../src/workspace/queries/workspaceReferenceNavigation";
import {
  addTestCtnBlockMetadata,
} from "../../ctn/metadata/sourceMetadataFixture";

const timestamp = "2026-07-15T00:00:00.000Z";

function createWorkspace() {
  const notes = [
    createNoteRecord(
      "source",
      addTestCtnBlockMetadata(
        "Source\nConcept\n\t: Concept\n\t- Other",
        defaultCtnSyntaxProfile,
      ),
      timestamp,
    ),
    createNoteRecord(
      "target-a",
      addTestCtnBlockMetadata("Target", defaultCtnSyntaxProfile, 100),
      timestamp,
    ),
    createNoteRecord(
      "target-b",
      addTestCtnBlockMetadata("  Target  ", defaultCtnSyntaxProfile, 200),
      timestamp,
    ),
  ];
  const workspace = createWorkspaceStructureIndex({
    ...createInitialWorkspaceData(),
    notes,
  });

  return {
    index: createWorkspaceParseIndex({
      syntaxProfile: defaultCtnSyntaxProfile,
      workspace,
    }),
    workspace,
  };
}

describe("workspace reference navigation", () => {
  it("resolves every globally matching note title", () => {
    const { index, workspace } = createWorkspace();

    expect(
      resolveWorkspaceReferenceNavigation({
        activeNoteId: "source",
        index,
        target: { text: "  Target ", type: "global-reference" },
        workspace,
      }).map(({ noteId }) => noteId),
    ).toEqual(["target-a", "target-b"]);
  });

  it("resolves matching blocks only inside the active note", () => {
    const { index, workspace } = createWorkspace();
    const destinations = resolveWorkspaceReferenceNavigation({
      activeNoteId: "source",
      index,
      target: { text: "Concept", type: "local-reference" },
      workspace,
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
    const { index, workspace } = createWorkspace();
    const resolve = (text: string, type: string) =>
      resolveWorkspaceReferenceNavigation({
        activeNoteId: "source",
        index,
        target: { text, type },
        workspace,
      });

    expect(resolve("Tar", "global-reference")).toEqual([]);
    expect(resolve("Target", "inline-code")).toEqual([]);
  });
});
