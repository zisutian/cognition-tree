import { useState } from "react";
import type { UiMigrationView } from "../../../application/workspace/viewTypes";
import { BlockMigrationView } from "./BlockMigrationView";
import { NoteSelectionView } from "./NoteSelectionView";

type MigrationMode = "note" | "block";

type BlockMigrationMainPanelProps = {
  view: UiMigrationView & {
    onMoveBlockToPosition: (
      sourceBlockLineNumberValue: string,
      targetPositionValue: string,
    ) => void;
    onSourceNoteChange: (id: string) => void;
    onTargetNoteChange: (id: string) => void;
  };
};

export function BlockMigrationMainPanel({
  view,
}: BlockMigrationMainPanelProps) {
  const [mode, setMode] = useState<MigrationMode>("note");

  return (
    <section
      className="activity-main-panel migration-full-width migration-main-panel"
      aria-label="块迁移"
    >
      <header className="panel-header">
        <div>
          <h2>块迁移</h2>
        </div>
        <div className="stats">
          <span>拖拽释放即迁移</span>
        </div>
      </header>

      <div className="migration-mode-tabs">
        <button
          type="button"
          className={`migration-mode-tab ${mode === "note" ? "is-active" : ""}`}
          onClick={() => setMode("note")}
        >
          笔记选择
        </button>
        <button
          type="button"
          className={`migration-mode-tab ${mode === "block" ? "is-active" : ""}`}
          onClick={() => setMode("block")}
        >
          块迁移
        </button>
      </div>

      {mode === "note" ? (
        <NoteSelectionView
          noteTree={view.noteTree}
          notes={view.notes}
          sourceNoteId={view.sourceNoteId}
          targetNoteId={view.targetNoteId}
          onSourceNoteChange={view.onSourceNoteChange}
          onTargetNoteChange={view.onTargetNoteChange}
          onComplete={() => setMode("block")}
        />
      ) : (
        <BlockMigrationView
          onMoveBlockToPosition={view.onMoveBlockToPosition}
          sourceBlocks={view.sourceBlocks}
          sourceNote={view.sourceNote}
          sourceRoots={view.sourceRoots}
          targetNote={view.targetNote}
          targetRoots={view.targetRoots}
        />
      )}
    </section>
  );
}
