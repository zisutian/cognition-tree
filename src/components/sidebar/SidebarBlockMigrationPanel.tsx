import { MoveRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  parseCtnDocument,
  type CtnBlock,
  type CtnSyntaxProfile,
} from "../../ctn/parseOutline";
import type {
  MoveNoteBlockActionResult,
  MoveNoteBlockRequest,
} from "../../hooks/useNoteWorkspace";
import type { NoteId, NoteRecord } from "../../domain/notes";

type SidebarBlockMigrationPanelProps = {
  activeNoteId: NoteId | null;
  notes: NoteRecord[];
  syntaxProfiles: CtnSyntaxProfile[];
  onMoveNoteBlock: (request: MoveNoteBlockRequest) => MoveNoteBlockActionResult;
};

type ParsedMigrationNote =
  | {
      blocks: CtnBlock[];
      note: NoteRecord;
      status: "parsed";
    }
  | {
      message: string;
      note: NoteRecord;
      status: "missing-profile";
    };

function findSyntaxProfile(
  note: NoteRecord,
  syntaxProfiles: CtnSyntaxProfile[],
) {
  return syntaxProfiles.find(
    (profile) =>
      profile.id === note.syntaxProfileId &&
      profile.version === note.syntaxVersion,
  );
}

function parseMigrationNote(
  note: NoteRecord,
  syntaxProfiles: CtnSyntaxProfile[],
): ParsedMigrationNote {
  const syntaxProfile = findSyntaxProfile(note, syntaxProfiles);

  if (!syntaxProfile) {
    return {
      message: `笔记引用的语法 ${note.syntaxProfileId}@${note.syntaxVersion} 不存在。`,
      note,
      status: "missing-profile",
    };
  }

  return {
    blocks: parseCtnDocument(note.source, { syntaxProfile }).blocks,
    note,
    status: "parsed",
  };
}

function blockOptionLabel(block: CtnBlock) {
  const prefix = "  ".repeat(block.level);
  const text = block.text || block.label;

  return `L${block.lineNumber} ${prefix}${block.label}: ${text}`;
}

function parseTargetPosition(value: string): MoveNoteBlockRequest["targetPosition"] {
  if (value === "end") {
    return { kind: "end" };
  }

  return {
    kind: "after-block",
    lineNumber: Number(value.slice("after:".length)),
  };
}

export function SidebarBlockMigrationPanel({
  activeNoteId,
  notes,
  syntaxProfiles,
  onMoveNoteBlock,
}: SidebarBlockMigrationPanelProps) {
  const [sourceNoteId, setSourceNoteId] = useState("");
  const [targetNoteId, setTargetNoteId] = useState("");
  const [sourceBlockLineNumber, setSourceBlockLineNumber] = useState("");
  const [targetPositionValue, setTargetPositionValue] = useState("end");
  const [statusMessage, setStatusMessage] = useState("");
  const parsedNotesById = useMemo(
    () =>
      new Map(
        notes.map((note) => [
          note.id,
          parseMigrationNote(note, syntaxProfiles),
        ]),
      ),
    [notes, syntaxProfiles],
  );
  const sourceNote = notes.find((note) => note.id === sourceNoteId) ?? null;
  const targetNote = notes.find((note) => note.id === targetNoteId) ?? null;
  const sourceParsed = sourceNote ? parsedNotesById.get(sourceNote.id) ?? null : null;
  const targetParsed = targetNote ? parsedNotesById.get(targetNote.id) ?? null : null;
  const sourceBlocks = sourceParsed?.status === "parsed" ? sourceParsed.blocks : [];
  const targetBlocks = targetParsed?.status === "parsed" ? targetParsed.blocks : [];
  const canMove =
    Boolean(sourceNote) &&
    Boolean(targetNote) &&
    sourceNote?.id !== targetNote?.id &&
    sourceParsed?.status === "parsed" &&
    targetParsed?.status === "parsed" &&
    sourceBlocks.some((block) => String(block.lineNumber) === sourceBlockLineNumber);

  useEffect(() => {
    if (sourceNoteId && notes.some((note) => note.id === sourceNoteId)) {
      return;
    }

    if (activeNoteId && notes.some((note) => note.id === activeNoteId)) {
      setSourceNoteId(activeNoteId);
      return;
    }

    setSourceNoteId(notes[0]?.id ?? "");
  }, [activeNoteId, notes, sourceNoteId]);

  useEffect(() => {
    if (
      targetNoteId &&
      targetNoteId !== sourceNoteId &&
      notes.some((note) => note.id === targetNoteId)
    ) {
      return;
    }

    setTargetNoteId(
      notes.find((note) => note.id !== sourceNoteId)?.id ?? "",
    );
  }, [notes, sourceNoteId, targetNoteId]);

  useEffect(() => {
    if (
      sourceBlocks.some((block) => String(block.lineNumber) === sourceBlockLineNumber)
    ) {
      return;
    }

    setSourceBlockLineNumber(
      sourceBlocks[0] ? String(sourceBlocks[0].lineNumber) : "",
    );
  }, [sourceBlockLineNumber, sourceBlocks]);

  useEffect(() => {
    if (
      targetPositionValue === "end" ||
      targetBlocks.some((block) => targetPositionValue === `after:${block.lineNumber}`)
    ) {
      return;
    }

    setTargetPositionValue("end");
  }, [targetBlocks, targetPositionValue]);

  const moveSelectedBlock = () => {
    if (!sourceNote || !targetNote || !sourceBlockLineNumber) {
      return;
    }

    const result = onMoveNoteBlock({
      sourceBlockLineNumber: Number(sourceBlockLineNumber),
      sourceNoteId: sourceNote.id,
      targetNoteId: targetNote.id,
      targetPosition: parseTargetPosition(targetPositionValue),
    });

    setStatusMessage(result.message);
  };

  return (
    <div className="side-panel-body">
      <section className="side-section">
        <p className="side-section-title">源</p>
        <select
          className="migration-select"
          value={sourceNoteId}
          onChange={(event) => {
            setSourceNoteId(event.target.value);
            setStatusMessage("");
          }}
        >
          {notes.map((note) => (
            <option key={note.id} value={note.id}>
              {note.title}
            </option>
          ))}
        </select>
        <select
          className="migration-select"
          disabled={sourceBlocks.length === 0}
          value={sourceBlockLineNumber}
          onChange={(event) => {
            setSourceBlockLineNumber(event.target.value);
            setStatusMessage("");
          }}
        >
          {sourceBlocks.map((block) => (
            <option key={block.id} value={block.lineNumber}>
              {blockOptionLabel(block)}
            </option>
          ))}
        </select>
        {sourceParsed?.status === "missing-profile" ? (
          <p className="side-error">{sourceParsed.message}</p>
        ) : null}
      </section>

      <section className="side-section">
        <p className="side-section-title">目标</p>
        <select
          className="migration-select"
          value={targetNoteId}
          onChange={(event) => {
            setTargetNoteId(event.target.value);
            setStatusMessage("");
          }}
        >
          {notes
            .filter((note) => note.id !== sourceNoteId)
            .map((note) => (
              <option key={note.id} value={note.id}>
                {note.title}
              </option>
            ))}
        </select>
        <select
          className="migration-select"
          value={targetPositionValue}
          onChange={(event) => {
            setTargetPositionValue(event.target.value);
            setStatusMessage("");
          }}
        >
          <option value="end">文末，作为根块</option>
          {targetBlocks.map((block) => (
            <option key={block.id} value={`after:${block.lineNumber}`}>
              {blockOptionLabel(block)} 之后
            </option>
          ))}
        </select>
        {targetParsed?.status === "missing-profile" ? (
          <p className="side-error">{targetParsed.message}</p>
        ) : null}
      </section>

      <section className="side-section">
        <button
          className="side-action-button migration-move-button"
          disabled={!canMove}
          onClick={moveSelectedBlock}
          type="button"
        >
          <MoveRight aria-hidden="true" size={13} strokeWidth={2} />
          移动块
        </button>
        {statusMessage ? <p className="side-status">{statusMessage}</p> : null}
      </section>
    </div>
  );
}
