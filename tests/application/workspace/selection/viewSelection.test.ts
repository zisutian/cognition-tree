import { describe, expect, it } from "vitest";
import {
  resolveActiveNoteId,
  resolveActiveNoteIdAfterRemovingNote,
  resolveActiveNoteIdAfterRemovingNotes,
  resolveDifferentNoteId,
} from "../../../../application/workspace/selection/viewSelection";

const notes = [
  { id: "note-first" },
  { id: "note-second" },
  { id: "note-third" },
];

describe("workspace view state", () => {
  it("resolves active note selection from application state", () => {
    expect(resolveActiveNoteId(notes, "note-second")).toBe("note-second");
    expect(resolveActiveNoteId(notes, "missing-note")).toBe("note-first");
    expect(resolveActiveNoteId(notes, null)).toBe("note-first");
    expect(resolveActiveNoteId([], "missing-note")).toBeNull();
  });

  it("repairs active note selection after note deletion", () => {
    expect(
      resolveActiveNoteIdAfterRemovingNote(notes, "note-second", "note-second"),
    ).toBe("note-first");
    expect(
      resolveActiveNoteIdAfterRemovingNote(notes, "note-third", "note-second"),
    ).toBe("note-third");
  });

  it("repairs active note selection after folder deletion", () => {
    expect(
      resolveActiveNoteIdAfterRemovingNotes(
        notes,
        "note-second",
        new Set(["note-first", "note-second"]),
      ),
    ).toBe("note-third");
    expect(
      resolveActiveNoteIdAfterRemovingNotes(
        notes,
        "note-third",
        new Set(["note-first", "note-second"]),
      ),
    ).toBe("note-third");
  });

  it("resolves structure operation target note selection", () => {
    expect(resolveDifferentNoteId(notes, "note-first")).toBe("note-second");
    expect(resolveDifferentNoteId([{ id: "note-first" }], "note-first")).toBe("");
  });
});
