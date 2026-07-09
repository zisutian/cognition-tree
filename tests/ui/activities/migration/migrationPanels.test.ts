import { describe, expect, it } from "vitest";
import {
  canPairMigrationDirectoryNodes,
  canDropStructureBlockAtEnd,
  canDropStructureBlockOnLine,
  getBlockedStructureDropLineNumbers,
  getMigrationDirectoryNoteStatus,
} from "../../../../src/ui/activities/migration/MigrationPanels";

describe("migration panels", () => {
  it("hides stale target status while selecting a new migration target", () => {
    expect(
      getMigrationDirectoryNoteStatus({
        mode: "pair",
        noteId: "note-source",
        pairSelectionPhase: "selectSource",
        pendingSourceNoteId: null,
        sourceNoteId: "note-source",
        structureNoteId: "note-source",
        targetNoteId: "note-target",
      }),
    ).toBe("source");
    expect(
      getMigrationDirectoryNoteStatus({
        mode: "pair",
        noteId: "note-target",
        pairSelectionPhase: "selectSource",
        pendingSourceNoteId: null,
        sourceNoteId: "note-source",
        structureNoteId: "note-source",
        targetNoteId: "note-target",
      }),
    ).toBe("target");
    expect(
      getMigrationDirectoryNoteStatus({
        mode: "pair",
        noteId: "note-target",
        pairSelectionPhase: "selectTarget",
        pendingSourceNoteId: "note-neutral",
        sourceNoteId: "note-source",
        structureNoteId: "note-source",
        targetNoteId: "note-target",
      }),
    ).toBe("");
    expect(
      getMigrationDirectoryNoteStatus({
        mode: "pair",
        noteId: "note-neutral",
        pairSelectionPhase: "selectTarget",
        pendingSourceNoteId: "note-neutral",
        sourceNoteId: "note-source",
        structureNoteId: "note-source",
        targetNoteId: "note-target",
      }),
    ).toBe("source");
  });

  it("keeps structure status separate from source and target status", () => {
    expect(
      getMigrationDirectoryNoteStatus({
        mode: "structure",
        noteId: "note-source",
        pairSelectionPhase: "selectSource",
        pendingSourceNoteId: null,
        sourceNoteId: "note-source",
        structureNoteId: "note-source",
        targetNoteId: "note-target",
      }),
    ).toBe("structure");
    expect(
      getMigrationDirectoryNoteStatus({
        mode: "structure",
        noteId: "note-target",
        pairSelectionPhase: "selectSource",
        pendingSourceNoteId: null,
        sourceNoteId: "note-source",
        structureNoteId: "note-source",
        targetNoteId: "note-target",
      }),
    ).toBe("");
  });

  it("only allows note-to-note directory pairing", () => {
    const sourceNote = {
      kind: "note" as const,
      noteId: "note-source",
      parentFolderId: null,
    };
    const targetNote = {
      kind: "note" as const,
      noteId: "note-target",
      parentFolderId: null,
    };
    const folder = {
      folderId: "folder-target",
      kind: "folder" as const,
      parentFolderId: null,
    };

    expect(canPairMigrationDirectoryNodes(sourceNote, targetNote)).toBe(true);
    expect(canPairMigrationDirectoryNodes(sourceNote, folder)).toBe(false);
    expect(canPairMigrationDirectoryNodes(folder, targetNote)).toBe(false);
  });

  it("classifies structure block drop targets from the dragged subtree", () => {
    const sourceBlock = {
      children: [
        {
          children: [],
          hasDiagnostics: false,
          id: "block-2",
          label: "定义",
          level: 1,
          lineLabel: "L2",
          lineNumber: 2,
          textDisplay: {
            displayText: "子块",
            segments: [{ id: "text", kind: "text" as const, text: "子块" }],
            textColorClassName: "ctn-text-color-default",
          },
        },
      ],
      hasDiagnostics: false,
      id: "block-1",
      label: "组分",
      level: 0,
      lineLabel: "L1-L2",
      lineNumber: 1,
      textDisplay: {
        displayText: "源块",
        segments: [{ id: "text", kind: "text" as const, text: "源块" }],
        textColorClassName: "ctn-text-color-default",
      },
    };
    const blockedLineNumbers = getBlockedStructureDropLineNumbers(sourceBlock);

    expect(canDropStructureBlockAtEnd("1")).toBe(true);
    expect(canDropStructureBlockAtEnd("not-a-line")).toBe(false);
    expect(
      canDropStructureBlockOnLine({
        blockedLineNumbers,
        draggingLineNumber: "1",
        targetLineNumber: 1,
      }),
    ).toBe(false);
    expect(
      canDropStructureBlockOnLine({
        blockedLineNumbers,
        draggingLineNumber: "1",
        targetLineNumber: 2,
      }),
    ).toBe(false);
    expect(
      canDropStructureBlockOnLine({
        blockedLineNumbers,
        draggingLineNumber: "1",
        targetLineNumber: 3,
      }),
    ).toBe(true);
  });
});
