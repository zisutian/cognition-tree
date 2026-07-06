import { describe, expect, it } from "vitest";
import {
  createMigrationNoteDragPayload,
  createMigrationNoteDragSession,
  readMigrationNoteDragPayload,
  resolveMigrationNoteDropPair,
} from "../../../../src/ui/activities/migration/migrationNoteDrag";

describe("migration note drag helpers", () => {
  it("reads typed note drag payload before plain text payloads", () => {
    const typedPayload = createMigrationNoteDragPayload("note-target");
    const plainText = createMigrationNoteDragPayload("note-source");

    expect(
      readMigrationNoteDragPayload({
        plainText,
        typedPayload,
      }),
    ).toBe("note-target");
    expect(
      readMigrationNoteDragPayload({
        plainText,
        typedPayload: "",
      }),
    ).toBe("note-source");
  });

  it("rejects missing or invalid note drag payloads", () => {
    expect(
      readMigrationNoteDragPayload({
        plainText: "",
        typedPayload: "",
      }),
    ).toBeNull();
    expect(
      readMigrationNoteDragPayload({
        plainText: "note-source",
        typedPayload: "",
      }),
    ).toBeNull();
    expect(
      readMigrationNoteDragPayload({
        plainText: JSON.stringify({ kind: "other", noteId: "note-source" }),
        typedPayload: "",
      }),
    ).toBeNull();
    expect(
      readMigrationNoteDragPayload({
        plainText: JSON.stringify({ kind: "migration-note", noteId: 1 }),
        typedPayload: "",
      }),
    ).toBeNull();
  });

  it("keeps the current browser drag payload in an isolated session", () => {
    const session = createMigrationNoteDragSession();
    const payload = createMigrationNoteDragPayload("note-source");

    session.write(payload);

    expect(session.read()).toBe(payload);

    session.clear();

    expect(session.read()).toBe("");
  });

  it("resolves only valid note-to-note migration pairs", () => {
    const noteIds = new Set(["note-source", "note-target"]);

    expect(
      resolveMigrationNoteDropPair({
        noteIds,
        sourceNoteId: "note-source",
        targetNoteId: "note-target",
      }),
    ).toEqual({
      sourceNoteId: "note-source",
      targetNoteId: "note-target",
    });
    expect(
      resolveMigrationNoteDropPair({
        noteIds,
        sourceNoteId: "note-source",
        targetNoteId: "note-source",
      }),
    ).toBeNull();
    expect(
      resolveMigrationNoteDropPair({
        noteIds,
        sourceNoteId: "note-missing",
        targetNoteId: "note-target",
      }),
    ).toBeNull();
    expect(
      resolveMigrationNoteDropPair({
        noteIds,
        sourceNoteId: "note-source",
        targetNoteId: "note-missing",
      }),
    ).toBeNull();
  });
});
