import type { UiMigrationView } from "../../../application/workspace/projection/viewMigration";
import {
  UiPanel,
  UiPanelHeader,
} from "../../shared/primitives";
import { BlockMigrationView } from "./BlockMigrationView";
import { BlockStructureView } from "./BlockStructureView";

type MigrationMainPanelProps = {
  view: UiMigrationView & {
    onMoveBlockToPosition: (
      sourceBlockLineNumberValue: string,
      targetPositionValue: string,
    ) => void;
    onMoveStructureBlock: (
      sourceBlockLineNumberValue: string,
      targetPositionValue: string,
    ) => void;
  };
};

export function MigrationMainPanel({
  view,
}: MigrationMainPanelProps) {
  const panelTitle =
    view.mode === "structure" ? "笔记结构调整" : "块迁移";

  return (
    <UiPanel
      className="migration-main-panel"
      aria-label={panelTitle}
      fullWidth
      variant="main"
    >
      <UiPanelHeader title={panelTitle} />

      {view.mode === "structure" ? (
        <BlockStructureView
          blocks={view.structureBlocks}
          note={view.structureNote}
          roots={view.structureRoots}
          onMoveStructureBlock={view.onMoveStructureBlock}
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
