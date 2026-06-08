import { MoveRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  parseCtnDocument,
  type CtnBlock,
  type CtnSyntaxProfile,
} from "../ctn/parseOutline";
import type { NoteId, NoteRecord } from "../domain/notes";
import type {
  MoveNoteBlockActionResult,
  MoveNoteBlockRequest,
} from "../hooks/useNoteWorkspace";
import { getSyntaxProfileShapeError } from "../syntax/profileValidation";
import type { BlockMigrationPanelStatus } from "./BlockMigrationStatusPanel";

type BlockMigrationWorkspacePanelProps = {
  activeNoteId: NoteId | null;
  notes: NoteRecord[];
  syntaxProfiles: CtnSyntaxProfile[];
  onMoveNoteBlock: (request: MoveNoteBlockRequest) => MoveNoteBlockActionResult;
  onResultStatusChange: (status: BlockMigrationPanelStatus | null) => void;
  onSelectionStatusChange: (status: BlockMigrationPanelStatus) => void;
};

type ParsedMigrationNote =
  | {
      blocks: CtnBlock[];
      note: NoteRecord;
      profile: CtnSyntaxProfile;
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

  const shapeError = getSyntaxProfileShapeError(syntaxProfile);

  if (shapeError) {
    return {
      message: shapeError,
      note,
      status: "missing-profile",
    };
  }

  return {
    blocks: parseCtnDocument(note.source, { syntaxProfile }).blocks,
    note,
    profile: syntaxProfile,
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

function getSubtreeBlocks(blocks: CtnBlock[], sourceBlock: CtnBlock) {
  return blocks.filter(
    (block) =>
      block.lineNumber >= sourceBlock.lineNumber &&
      block.endLineNumber <= sourceBlock.endLineNumber,
  );
}

function collectMissingMarkers(
  sourceBlocks: CtnBlock[],
  targetProfile: CtnSyntaxProfile,
) {
  const targetMarkers = new Set(
    targetProfile.markerRules.map((rule) => rule.marker),
  );
  const sourceMarkers = [
    ...new Set(
      sourceBlocks
        .map((block) => block.marker)
        .filter((marker): marker is string => marker !== null),
    ),
  ];

  return sourceMarkers.filter((marker) => !targetMarkers.has(marker));
}

function createSelectionStatus({
  missingMarkers,
  notes,
  sourceBlock,
  sourceParsed,
  targetParsed,
}: {
  missingMarkers: string[];
  notes: NoteRecord[];
  sourceBlock: CtnBlock | null;
  sourceParsed: ParsedMigrationNote | null;
  targetParsed: ParsedMigrationNote | null;
}): BlockMigrationPanelStatus {
  if (notes.length < 2) {
    return {
      message: "至少需要两篇笔记。",
      status: "blocked",
    };
  }

  if (!sourceParsed || !targetParsed) {
    return {
      message: "源笔记或目标笔记未选定。",
      status: "idle",
    };
  }

  if (sourceParsed.status === "missing-profile") {
    return {
      message: sourceParsed.message,
      status: "blocked",
    };
  }

  if (targetParsed.status === "missing-profile") {
    return {
      message: targetParsed.message,
      status: "blocked",
    };
  }

  if (!sourceBlock) {
    return {
      message: "源笔记没有可移动块。",
      status: "blocked",
    };
  }

  if (missingMarkers.length > 0) {
    return {
      details: missingMarkers.map((marker) => `缺失 marker: ${marker}`),
      message: "目标笔记语法不兼容。",
      status: "blocked",
    };
  }

  return {
    message: "当前选择可迁移。",
    status: "ready",
  };
}

export function BlockMigrationWorkspacePanel({
  activeNoteId,
  notes,
  syntaxProfiles,
  onMoveNoteBlock,
  onResultStatusChange,
  onSelectionStatusChange,
}: BlockMigrationWorkspacePanelProps) {
  const [sourceNoteId, setSourceNoteId] = useState("");
  const [targetNoteId, setTargetNoteId] = useState("");
  const [sourceBlockLineNumber, setSourceBlockLineNumber] = useState("");
  const [targetPositionValue, setTargetPositionValue] = useState("end");
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
  const sourceBlock =
    sourceBlocks.find((block) => String(block.lineNumber) === sourceBlockLineNumber) ??
    null;
  const missingMarkers =
    sourceBlock && sourceParsed?.status === "parsed" && targetParsed?.status === "parsed"
      ? collectMissingMarkers(
          getSubtreeBlocks(sourceParsed.blocks, sourceBlock),
          targetParsed.profile,
        )
      : [];
  const missingMarkersKey = missingMarkers.join("\u0000");
  const selectionStatus = createSelectionStatus({
    missingMarkers,
    notes,
    sourceBlock,
    sourceParsed,
    targetParsed,
  });
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
    missingMarkersKey,
    notes.length,
    onSelectionStatusChange,
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
