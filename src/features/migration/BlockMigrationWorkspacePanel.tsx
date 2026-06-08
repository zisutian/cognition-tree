import { MoveRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CtnBlock } from "../../ctn/parseOutline";
import type { NoteId, NoteWorkspace } from "../../domain/notes";
import type {
  MoveNoteBlockActionResult,
  MoveNoteBlockRequest,
} from "../../workspace/useNoteWorkspace";
import { resolveParsedNote } from "../../workspace/parsedNote";
import { previewWorkspaceBlockMigration } from "../../workspace/workspaceBlockMigration";
import type { BlockMigrationPanelStatus } from "./BlockMigrationStatusPanel";

type BlockMigrationWorkspacePanelProps = {
  activeNoteId: NoteId | null;
  onMoveNoteBlock: (request: MoveNoteBlockRequest) => MoveNoteBlockActionResult;
  onResultStatusChange: (status: BlockMigrationPanelStatus | null) => void;
  onSelectionStatusChange: (status: BlockMigrationPanelStatus) => void;
  workspace: NoteWorkspace;
};

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

export function BlockMigrationWorkspacePanel({
  activeNoteId,
  onMoveNoteBlock,
  onResultStatusChange,
  onSelectionStatusChange,
  workspace,
}: BlockMigrationWorkspacePanelProps) {
  const notes = workspace.notes;
  const [sourceNoteId, setSourceNoteId] = useState("");
  const [targetNoteId, setTargetNoteId] = useState("");
  const [sourceBlockLineNumber, setSourceBlockLineNumber] = useState("");
  const [targetPositionValue, setTargetPositionValue] = useState("end");
  const parsedNotesById = useMemo(
    () =>
      new Map(
        notes.map((note) => [
          note.id,
          resolveParsedNote(workspace, note),
        ]),
      ),
    [notes, workspace],
  );
  const sourceNote = notes.find((note) => note.id === sourceNoteId) ?? null;
  const targetNote = notes.find((note) => note.id === targetNoteId) ?? null;
  const sourceParsed = sourceNote ? parsedNotesById.get(sourceNote.id) ?? null : null;
  const targetParsed = targetNote ? parsedNotesById.get(targetNote.id) ?? null : null;
  const sourceBlocks =
    sourceParsed?.status === "parsed" ? sourceParsed.document.blocks : [];
  const targetBlocks =
    targetParsed?.status === "parsed" ? targetParsed.document.blocks : [];
  const sourceBlock =
    sourceBlocks.find((block) => String(block.lineNumber) === sourceBlockLineNumber) ??
    null;
  const sourceBlockLineNumberValue = sourceBlock
    ? Number(sourceBlockLineNumber)
    : null;
  const selectionStatus = previewWorkspaceBlockMigration(workspace, {
    sourceBlockLineNumber: sourceBlockLineNumberValue,
    sourceNoteId: sourceNote?.id ?? null,
    targetNoteId: targetNote?.id ?? null,
    targetPosition: parseTargetPosition(targetPositionValue),
  });
  const selectionStatusDetailsKey = selectionStatus.details?.join("\u0000") ?? "";
  const canMove =
    selectionStatus.status === "ready" &&
    Boolean(sourceNote) &&
    Boolean(targetNote) &&
    sourceNote?.id !== targetNote?.id;

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

  useEffect(() => {
    onSelectionStatusChange(selectionStatus);
  }, [
    notes.length,
    onSelectionStatusChange,
    selectionStatusDetailsKey,
    selectionStatus.message,
    selectionStatus.status,
  ]);

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

    onResultStatusChange({
      message: result.message,
      status: result.status === "moved" ? "success" : "failed",
    });
  };

  return (
    <section className="workspace-main-panel migration-workspace-panel" aria-label="块迁移">
      <header className="panel-header">
        <div>
          <p className="eyebrow">Block Migration</p>
          <h2>块迁移</h2>
        </div>
        <button
          className="primary-action-button"
          disabled={!canMove}
          onClick={moveSelectedBlock}
          type="button"
        >
          <MoveRight aria-hidden="true" size={14} strokeWidth={2} />
          移动块
        </button>
      </header>

      <div className="migration-workspace-grid">
        <section className="migration-workspace-column">
          <p className="workspace-detail-title">源</p>
          <select
            className="workspace-select"
            value={sourceNoteId}
            onChange={(event) => {
              setSourceNoteId(event.target.value);
              onResultStatusChange(null);
            }}
          >
            {notes.map((note) => (
              <option key={note.id} value={note.id}>
                {note.title}
              </option>
            ))}
          </select>
          <select
            className="workspace-select block-select"
            disabled={sourceBlocks.length === 0}
            size={Math.min(Math.max(sourceBlocks.length, 4), 12)}
            value={sourceBlockLineNumber}
            onChange={(event) => {
              setSourceBlockLineNumber(event.target.value);
              onResultStatusChange(null);
            }}
          >
            {sourceBlocks.map((block) => (
              <option key={block.id} value={block.lineNumber}>
                {blockOptionLabel(block)}
              </option>
            ))}
          </select>
        </section>

        <section className="migration-workspace-column">
          <p className="workspace-detail-title">目标</p>
          <select
            className="workspace-select"
            value={targetNoteId}
            onChange={(event) => {
              setTargetNoteId(event.target.value);
              onResultStatusChange(null);
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
            className="workspace-select block-select"
            size={Math.min(Math.max(targetBlocks.length + 1, 4), 12)}
            value={targetPositionValue}
            onChange={(event) => {
              setTargetPositionValue(event.target.value);
              onResultStatusChange(null);
            }}
          >
            <option value="end">文末，作为根块</option>
            {targetBlocks.map((block) => (
              <option key={block.id} value={`after:${block.lineNumber}`}>
                {blockOptionLabel(block)} 之后
              </option>
            ))}
          </select>
        </section>
      </div>
    </section>
  );
}
