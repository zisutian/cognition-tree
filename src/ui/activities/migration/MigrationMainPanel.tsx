import type { UiMigrationView } from "../../../application/workspace/projection/viewMigration";
import {
  UiPanel,
  UiPanelHeader,
} from "../../shared/primitives";
import { BlockMigrationView } from "./BlockMigrationView";

type MigrationMainPanelProps = {
  view: UiMigrationView & {
    onMoveBlockToPosition: (
      sourceBlockLineNumberValue: string,
      targetPositionValue: string,
    ) => void;
  };
};

export function MigrationMainPanel({
  view,
}: MigrationMainPanelProps) {
  return (
    <UiPanel
      className="migration-main-panel"
      aria-label="块迁移"
      fullWidth
      variant="main"
    >
      <UiPanelHeader title="块迁移" />

      <BlockMigrationView
        onMoveBlockToPosition={view.onMoveBlockToPosition}
        sourceBlocks={view.sourceBlocks}
        sourceNote={view.sourceNote}
        sourceRoots={view.sourceRoots}
        targetNote={view.targetNote}
        targetRoots={view.targetRoots}
      />
    </UiPanel>
  );
}
