import { describe, expect, it } from "vitest";
import { parseCtnDocument } from "../../../src/ctn/parser/parseCtnDocument";
import { defaultCtnSyntaxProfile } from "../../../src/ctn/syntax/defaultSyntaxProfile";
import {
  initializeWorkspaceBlockMetadata,
  validateWorkspaceBlockMetadata,
  WorkspaceBlockMetadataError,
} from "../../../src/workspace/context/workspaceBlockMetadata";
import {
  createInitialWorkspaceData,
  createNoteRecord,
} from "../../../src/workspace/model/workspaceData";
import {
  addTestCtnBlockMetadata,
  createTestBlockId,
} from "../../ctn/metadata/sourceMetadataFixture";

const firstTimestamp = "2026-07-15T00:00:00.000Z";
const secondTimestamp = "2026-07-15T01:00:00.000Z";

describe("workspace block metadata", () => {
  it("initializes every raw note from its own note timestamps", () => {
    let id = 0;
    const workspace = {
      ...createInitialWorkspaceData(),
      notes: [
        createNoteRecord("note-a", "A\nRoot", firstTimestamp),
        createNoteRecord("note-b", "B", secondTimestamp),
      ],
    };
    const result = initializeWorkspaceBlockMetadata(
      workspace,
      defaultCtnSyntaxProfile,
      { createId: () => createTestBlockId(++id) },
    );
    const firstDocument = parseCtnDocument(
      result.notes[0].source,
      defaultCtnSyntaxProfile,
    );
    const secondDocument = parseCtnDocument(
      result.notes[1].source,
      defaultCtnSyntaxProfile,
    );

    expect(firstDocument.blocks).toHaveLength(2);
    expect(
      firstDocument.blocks.map((block) => block.metadata),
    ).toEqual([
      { createdAt: firstTimestamp, updatedAt: firstTimestamp },
      { createdAt: firstTimestamp, updatedAt: firstTimestamp },
    ]);
    expect(secondDocument.blocks[0].metadata).toEqual({
      createdAt: secondTimestamp,
      updatedAt: secondTimestamp,
    });
    expect(new Set([
      ...firstDocument.blocks,
      ...secondDocument.blocks,
    ].map((block) => block.id)).size).toBe(3);
  });

  it("preserves an already initialized v2 note", () => {
    const source = addTestCtnBlockMetadata("Title\nRoot");
    const workspace = {
      ...createInitialWorkspaceData(),
      notes: [createNoteRecord("note-a", source, firstTimestamp)],
    };

    expect(
      initializeWorkspaceBlockMetadata(
        workspace,
        defaultCtnSyntaxProfile,
      ).notes[0].source,
    ).toBe(source);
  });

  it("rejects block ids duplicated across notes", () => {
    const source = addTestCtnBlockMetadata("Title");
    const workspace = {
      ...createInitialWorkspaceData(),
      notes: [
        createNoteRecord("note-a", source, firstTimestamp),
        createNoteRecord("note-b", source.replace("Title", "Other"), secondTimestamp),
      ],
    };

    expect(() =>
      validateWorkspaceBlockMetadata(workspace, defaultCtnSyntaxProfile),
    ).toThrow(WorkspaceBlockMetadataError);
  });

  it("rejects configured notes without metadata", () => {
    const workspace = {
      ...createInitialWorkspaceData(),
      notes: [createNoteRecord("note-a", "Title", firstTimestamp)],
    };

    expect(() =>
      validateWorkspaceBlockMetadata(workspace, defaultCtnSyntaxProfile),
    ).toThrow("expected @ctn-block directive");
  });
});
