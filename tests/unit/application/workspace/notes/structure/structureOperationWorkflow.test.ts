import { describe, expect, it, vi } from "vitest";
import {
  executeStructureBlockMoveBetweenNotes,
  executeStructureBlockMoveWithinNote,
  getStructureMoveFailureMessage,
  type StructureMoveFailureReason,
} from "../../../../../../application/workspace/notes/structure/structureOperationWorkflow";
import type { SessionCommands } from "../../../../../../application/workspace/session/sessionCommands";

describe("structure operation workflow", () => {
  it("passes stable batch identities through the between-note workflow", () => {
    const move = vi.fn<SessionCommands["moveStructureBlocks"]>(() => ({ status: "moved", targetNoteId: "target" }));
    expect(executeStructureBlockMoveBetweenNotes({
      move, sourceBlockIds: ["source-a", "source-b"], sourceNoteId: "source", targetNoteId: "target",
      target: { kind: "below", targetBlockId: "target-block" },
    })).toBe("target");
    expect(move).toHaveBeenCalledOnce();
    expect(move).toHaveBeenCalledWith({
      sourceBlockIds: ["source-a", "source-b"], sourceNoteId: "source", targetNoteId: "target",
      target: { kind: "below", targetBlockId: "target-block" },
    });
  });
  it("uses the same command for within-note moves", () => {
    const move = vi.fn<SessionCommands["moveStructureBlocks"]>(() => ({ status: "moved", targetNoteId: "note" }));
    expect(executeStructureBlockMoveWithinNote({
      move, noteId: "note", sourceBlockIds: ["block"], target: { kind: "end" },
    })).toBe("note");
    expect(move).toHaveBeenCalledWith({ sourceNoteId: "note", targetNoteId: "note", sourceBlockIds: ["block"], target: { kind: "end" } });
  });
  it.each([
    ["missing-note", "无法移动结构块：笔记已不存在。"],
    ["parsed-note-missing", "无法移动结构块：笔记尚未完成解析。"],
    ["same-note-unsupported", "无法在跨笔记操作中选择同一笔记。"],
    ["source-block-missing", "无法移动结构块：源结构块已不存在。"],
    ["empty-source", "无法移动结构块：请先选择源结构块。"],
    ["target-inside-source", "无法把结构块移动到自身子树中。"],
    ["target-position-missing", "无法移动结构块：目标位置已不存在。"],
    ["invalid-block-range", "无法移动结构块：源码范围或块身份无效，请先修复源和目标。"],
  ] satisfies Array<[StructureMoveFailureReason, string]>) ("maps %s to existing Chinese feedback", (reason, message) => {
    expect(getStructureMoveFailureMessage(reason)).toBe(message);
  });
  it("reports a domain rejection rather than accepting an empty callback result", () => {
    const move = vi.fn<SessionCommands["moveStructureBlocks"]>(() => ({ status: "failed", reason: "target-inside-source" }));
    expect(() => executeStructureBlockMoveWithinNote({
      move, noteId: "note", sourceBlockIds: ["block"], target: { kind: "end" },
    })).toThrow("无法把结构块移动到自身子树中。");
  });
  it("rejects absent notes, empty selection and same-note pair operations before executing", () => {
    const move = vi.fn<SessionCommands["moveStructureBlocks"]>();
    expect(() => executeStructureBlockMoveBetweenNotes({
      move, sourceBlockIds: ["block"], sourceNoteId: null, targetNoteId: "target", target: { kind: "end" },
    })).toThrow("笔记已不存在");
    expect(() => executeStructureBlockMoveWithinNote({
      move, sourceBlockIds: [], noteId: "note", target: { kind: "end" },
    })).toThrow("请先选择");
    expect(() => executeStructureBlockMoveBetweenNotes({
      move, sourceBlockIds: ["block"], sourceNoteId: "note", targetNoteId: "note", target: { kind: "end" },
    })).toThrow("同一笔记");
    expect(move).not.toHaveBeenCalled();
  });
});
