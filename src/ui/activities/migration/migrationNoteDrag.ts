export const migrationNoteDragDataType =
  "application/x-cognition-tree-migration-note";

type MigrationNoteDragPayload = {
  kind: "migration-note";
  noteId: string;
};

export function createMigrationNoteDragPayload(noteId: string) {
  return JSON.stringify({
    kind: "migration-note",
    noteId,
  } satisfies MigrationNoteDragPayload);
}

export function readMigrationNoteDragPayload({
  plainText,
  typedPayload,
}: {
  plainText: string;
  typedPayload: string;
}) {
  const payloadText = typedPayload || plainText;

  if (!payloadText) {
    return null;
  }

  try {
    const payload = JSON.parse(payloadText) as Partial<MigrationNoteDragPayload>;

    return payload.kind === "migration-note" && typeof payload.noteId === "string"
      ? payload.noteId
      : null;
  } catch {
    return null;
  }
}

export function createMigrationNoteDragSession() {
  let payload = "";

  return {
    clear() {
      payload = "";
    },
    read() {
      return payload;
    },
    write(nextPayload: string) {
      payload = nextPayload;
    },
  };
}

export function resolveMigrationNoteDropPair({
  noteIds,
  sourceNoteId,
  targetNoteId,
}: {
  noteIds: Set<string>;
  sourceNoteId: string | null;
  targetNoteId: string;
}) {
  if (
    !sourceNoteId ||
    sourceNoteId === targetNoteId ||
    !noteIds.has(sourceNoteId) ||
    !noteIds.has(targetNoteId)
  ) {
    return null;
  }

  return {
    sourceNoteId,
    targetNoteId,
  };
}
