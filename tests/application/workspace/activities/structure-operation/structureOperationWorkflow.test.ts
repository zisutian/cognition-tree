import { describe, expect, it, vi } from "vitest";
import {
  executeStructureBlockMoveBetweenNotes,
  executeStructureBlockMoveWithinNote,
  getStructureMoveFailureMessage,
  type StructureMoveFailureReason,
} from "../../../../../application/workspace/activities/structure-operation/structureOperationWorkflow";
import type { SessionCommands } from "../../../../../application/workspace/session/sessionCommands";
import type { WorkspaceParseIndex } from "../../../../../core/workspace/indexes/workspaceParseIndex";

const index = {} as WorkspaceParseIndex;

describe("structure operation workflow", () => {
  it("builds a between-note request and returns the moved target", () => {
    const move = vi.fn<SessionCommands["moveStructureBlockBetweenNotes"]>(
      () => ({ status: "moved", targetNoteId: "target" }),
    );

    expect(executeStructureBlockMoveBetweenNotes({
      index,
      move,
      sourceBlockLineNumberValue: "12",
      sourceNoteId: "source",
      targetNoteId: "target",
      targetPositionValue: "sibling-below:24",
    })).toBe("target");
    expect(move).toHaveBeenCalledWith(index, {
      sourceBlockLineNumber: 12,
      sourceNoteId: "source",
      targetNoteId: "target",
      targetPosition: { kind: "sibling-below", lineNumber: 24 },
    });
  });

  it("builds a within-note request and returns the moved note", () => {
    const move = vi.fn<SessionCommands["moveStructureBlockWithinNote"]>(
      () => ({ noteId: "structure", status: "moved" }),
    );

    expect(executeStructureBlockMoveWithinNote({
      index,
      move,
      noteId: "structure",
      sourceBlockLineNumberValue: "8",
      targetPositionValue: "inside:16",
    })).toBe("structure");
    expect(move).toHaveBeenCalledWith(index, {
      noteId: "structure",
      sourceBlockLineNumber: 8,
      targetPosition: { kind: "inside-block", lineNumber: 16 },
    });
  });

  it.each([
    ["missing-note", "无法移动结构块：笔记已不存在。"],
    ["parsed-note-missing", "无法移动结构块：笔记尚未完成解析。"],
    ["same-note-unsupported", "无法在跨笔记操作中选择同一笔记。"],
    ["source-block-missing", "无法移动结构块：源结构块已不存在。"],
    ["target-inside-source", "无法把结构块移动到自身子树中。"],
    ["target-position-missing", "无法移动结构块：目标位置已不存在。"],
  ] satisfies Array<[StructureMoveFailureReason, string]>) (
    "maps %s to one global-feedback message",
    (reason, message) => {
      expect(getStructureMoveFailureMessage(reason)).toBe(message);
    },
  );

  it("maps command failures to thrown workflow errors", () => {
    const moveBetween = vi.fn<
      SessionCommands["moveStructureBlockBetweenNotes"]
    >(() => ({ reason: "same-note-unsupported", status: "failed" }));
    const moveWithin = vi.fn<SessionCommands["moveStructureBlockWithinNote"]>(
      () => ({ reason: "target-inside-source", status: "failed" }),
    );

    expect(() => executeStructureBlockMoveBetweenNotes({
      index,
      move: moveBetween,
      sourceBlockLineNumberValue: "4",
      sourceNoteId: "source",
      targetNoteId: "target",
      targetPositionValue: "end",
    })).toThrow("无法在跨笔记操作中选择同一笔记。");
    expect(() => executeStructureBlockMoveWithinNote({
      index,
      move: moveWithin,
      noteId: "structure",
      sourceBlockLineNumberValue: "4",
      targetPositionValue: "end",
    })).toThrow("无法把结构块移动到自身子树中。");
  });

  it("rejects missing workflow inputs before invoking a command", () => {
    const move = vi.fn<SessionCommands["moveStructureBlockBetweenNotes"]>();

    expect(() => executeStructureBlockMoveBetweenNotes({
      index,
      move,
      sourceBlockLineNumberValue: "4",
      sourceNoteId: null,
      targetNoteId: "target",
      targetPositionValue: "end",
    })).toThrow("无法移动结构块：笔记已不存在。");
    expect(() => executeStructureBlockMoveBetweenNotes({
      index: null,
      move,
      sourceBlockLineNumberValue: "4",
      sourceNoteId: "source",
      targetNoteId: "target",
      targetPositionValue: "end",
    })).toThrow("无法移动结构块：笔记尚未完成解析。");
    expect(() => executeStructureBlockMoveBetweenNotes({
      index,
      move,
      sourceBlockLineNumberValue: "",
      sourceNoteId: "source",
      targetNoteId: "target",
      targetPositionValue: "end",
    })).toThrow("无法移动结构块：源结构块已不存在。");
    expect(move).not.toHaveBeenCalled();
  });
});
