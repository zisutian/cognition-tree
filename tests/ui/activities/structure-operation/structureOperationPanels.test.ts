import { describe, expect, it } from "vitest";
import {
  getStructureOperationDirectoryNoteStatus,
} from "../../../../src/ui/activities/structure-operation/StructureOperationContext";
import { findBlockByLineNumber } from "../../../../src/ui/activities/structure-operation/structureOperationBlocks";
import {
  canDropStructureBlockAtEnd,
  canDropStructureBlockOnLine,
  getBlockedStructureDropLineNumbers,
  getStructureBlockDropPosition,
  getStructureRowDropPlacement,
} from "../../../../src/ui/activities/structure-operation/structureOperationDropTargets";

const { readFileSync } = (await import("node:fs")) as {
  readFileSync: (path: URL, encoding: "utf8") => string;
};
const structureOperationCss = readFileSync(
  new URL(
    "../../../../src/ui/styles/activities/structure-operation.css",
    import.meta.url,
  ),
  "utf8",
);

describe("structure operation panels", () => {
  it("hides stale target status while selecting a new structure operation target", () => {
    expect(
      getStructureOperationDirectoryNoteStatus({
        mode: "betweenNotes",
        noteId: "note-source",
        pairSelectionPhase: "selectSource",
        sourceNoteId: "note-source",
        structureNoteId: "note-source",
        targetNoteId: "note-target",
      }),
    ).toBe("source");
    expect(
      getStructureOperationDirectoryNoteStatus({
        mode: "betweenNotes",
        noteId: "note-target",
        pairSelectionPhase: "selectSource",
        sourceNoteId: "note-source",
        structureNoteId: "note-source",
        targetNoteId: "note-target",
      }),
    ).toBe("target");
    expect(
      getStructureOperationDirectoryNoteStatus({
        mode: "betweenNotes",
        noteId: "note-target",
        pairSelectionPhase: "selectTarget",
        sourceNoteId: "note-neutral",
        structureNoteId: "note-source",
        targetNoteId: "note-target",
      }),
    ).toBe("");
    expect(
      getStructureOperationDirectoryNoteStatus({
        mode: "betweenNotes",
        noteId: "note-neutral",
        pairSelectionPhase: "selectTarget",
        sourceNoteId: "note-neutral",
        structureNoteId: "note-source",
        targetNoteId: "note-target",
      }),
    ).toBe("source");
  });

  it("keeps structure status separate from source and target status", () => {
    expect(
      getStructureOperationDirectoryNoteStatus({
        mode: "withinNote",
        noteId: "note-source",
        pairSelectionPhase: "selectSource",
        sourceNoteId: "note-source",
        structureNoteId: "note-source",
        targetNoteId: "note-target",
      }),
    ).toBe("structure");
    expect(
      getStructureOperationDirectoryNoteStatus({
        mode: "withinNote",
        noteId: "note-target",
        pairSelectionPhase: "selectSource",
        sourceNoteId: "note-source",
        structureNoteId: "note-source",
        targetNoteId: "note-target",
      }),
    ).toBe("");
  });

  it("classifies structure block drop targets from the dragged subtree", () => {
    const sourceBlock = {
      children: [
        {
          children: [],
          hasDiagnostics: false,
          id: "block-2",
          label: "定义",
          lineLabel: "L2",
          lineNumber: 2,
          textDisplay: {
            displayText: "子块",
            segments: [{ id: "text", kind: "text" as const, text: "子块" }],
            textColor: "default",
          },
        },
      ],
      hasDiagnostics: false,
      id: "block-1",
      label: "组分",
      lineLabel: "L1-L2",
      lineNumber: 1,
      textDisplay: {
        displayText: "源块",
        segments: [{ id: "text", kind: "text" as const, text: "源块" }],
        textColor: "default",
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

  it("finds nested structure blocks by line number", () => {
    const roots = [
      {
        children: [
          {
            children: [],
            hasDiagnostics: false,
            id: "block-2",
            label: "定义",
            lineLabel: "L2",
            lineNumber: 2,
            textDisplay: {
              displayText: "子块",
              segments: [{ id: "text", kind: "text" as const, text: "子块" }],
              textColor: "default",
            },
          },
        ],
        hasDiagnostics: false,
        id: "block-1",
        label: "组分",
        lineLabel: "L1-L2",
        lineNumber: 1,
        textDisplay: {
          displayText: "根块",
          segments: [{ id: "text", kind: "text" as const, text: "根块" }],
          textColor: "default",
        },
      },
    ];

    expect(findBlockByLineNumber(roots, "2")?.id).toBe("block-2");
    expect(findBlockByLineNumber(roots, "not-a-line")).toBeNull();
  });

  it("maps structure row pointer position to stable drop positions", () => {
    expect(getStructureRowDropPlacement({ clientY: 101, height: 30, top: 100 }))
      .toBe("sibling-above");
    expect(getStructureRowDropPlacement({ clientY: 115, height: 30, top: 100 }))
      .toBe("inside");
    expect(getStructureRowDropPlacement({ clientY: 129, height: 30, top: 100 }))
      .toBe("sibling-below");
    expect(getStructureBlockDropPosition(12, "inside")).toBe("inside:12");
    expect(getStructureBlockDropPosition(12, "sibling-above")).toBe(
      "sibling-above:12",
    );
    expect(getStructureBlockDropPosition(12, "sibling-below")).toBe(
      "sibling-below:12",
    );
  });

  it("uses neutral tree tones for structure drag targets", () => {
    const dropStyleStart = structureOperationCss.indexOf(
      ".structure-operation-drop-target.is-active",
    );
    const dropStyleSource = structureOperationCss.slice(dropStyleStart);

    expect(dropStyleSource).toContain("background: var(--color-selected)");
    expect(dropStyleSource).toContain("border-color: var(--color-border-strong)");
    expect(dropStyleSource).toContain("height: 8px");
    expect(dropStyleSource).toContain(
      ".structure-operation-target-node.is-drop-above::before",
    );
    expect(dropStyleSource).toContain(
      ".structure-operation-target-node.is-drop-below::after",
    );
    expect(dropStyleSource).not.toContain("color-accent");
    expect(dropStyleSource).not.toContain("box-shadow");
  });

  it("keeps structure operation columns top aligned", () => {
    const columnStyleStart = structureOperationCss.indexOf(".structure-operation-column");
    const columnStyleEnd = structureOperationCss.indexOf(
      ".structure-operation-drop-target",
    );
    const columnStyleSource = structureOperationCss.slice(
      columnStyleStart,
      columnStyleEnd,
    );

    expect(columnStyleSource).toContain("align-content: start");
  });

  it("aligns the pair swap control through the title row height", () => {
    const swapStyleStart = structureOperationCss.indexOf(
      ".structure-operation-pair-swap",
    );
    const swapStyleEnd = structureOperationCss.indexOf(
      ".structure-operation-column",
      swapStyleStart,
    );
    const swapStyleSource = structureOperationCss.slice(
      swapStyleStart,
      swapStyleEnd,
    );

    expect(swapStyleSource).not.toContain("transform");
    expect(structureOperationCss).toContain(
      ".structure-operation-column > .ui-section-title",
    );
    expect(structureOperationCss).toContain("min-height: var(--ui-icon-size)");
  });
});
