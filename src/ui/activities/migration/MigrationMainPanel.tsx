import { useState } from "react";
import type { UiMigrationView } from "../../../application/workspace/projection/viewMigration";
import {
  UiPanel,
  UiPanelHeader,
} from "../../shared/primitives";
import { BlockMigrationView } from "./BlockMigrationView";
import { MigrationNoteSelectionView } from "./MigrationNoteSelectionView";

type MigrationMode = "note" | "block";

type MigrationMainPanelProps = {
  view: UiMigrationView & {
    onMoveBlockToPosition: (
      sourceBlockLineNumberValue: string,
      targetPositionValue: string,
    ) => void;
    onSourceNoteChange: (id: string) => void;
    onTargetNoteChange: (id: string) => void;
  };
};

export function MigrationMainPanel({
  view,
}: MigrationMainPanelProps) {
  const [mode, setMode] = useState<MigrationMode>("note");

  return (
    <UiPanel
      className="migration-main-panel"
      aria-label="块迁移"
      fullWidth
      variant="main"
    >
      <UiPanelHeader stats={["拖拽释放即迁移"]} title="块迁移" />

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
        <MigrationNoteSelectionView
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
    </UiPanel>
  );
}
