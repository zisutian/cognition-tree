import { useEffect, useState } from "react";
import type {
  RepositoryConflictResolutionView,
} from "../../../application/repository/repositoryViewTypes";
import { Button } from "../../ui/shared/primitives";
import {
  ToolPropertyList,
  ToolPropertyRow,
  ToolSection,
} from "../../ui/shared/ToolSurface";

export function RepositoryConflictStatus({
  resolution,
}: {
  resolution: RepositoryConflictResolutionView;
}) {
  const [unitIds, setUnitIds] = useState<string[] | null>(null);

  useEffect(() => {
    let active = true;

    void resolution.loadUnitIds().then((ids) => {
      if (active) setUnitIds(ids);
    }, () => {
      if (active) setUnitIds([]);
    });
    return () => {
      active = false;
    };
  }, [resolution]);

  return (
    <ToolPropertyList aria-label="同步冲突详情">
      <ToolPropertyRow label="同步冲突" value="存在" />
      <ToolPropertyRow
        label="冲突单元"
        value={unitIds === null
          ? "正在读取…"
          : unitIds.length > 0
            ? unitIds.join("、")
            : "整仓内容"}
      />
    </ToolPropertyList>
  );
}

export function RepositoryConflictActions({
  busy,
  resolution,
  onRunAction,
}: {
  busy: boolean;
  resolution: RepositoryConflictResolutionView;
  onRunAction(action: () => Promise<void>): void;
}) {
  return (
    <ToolSection title="同步冲突">
      <div className="repository-operation-strip">
        <Button
          disabled={busy}
          onClick={() => onRunAction(resolution.keepLocal)}
          type="button"
          variant="primary"
        >
          保留本地
        </Button>
        <Button
          disabled={busy}
          onClick={() => onRunAction(resolution.useRemote)}
          type="button"
        >
          采用远端
        </Button>
        <Button
          disabled={busy}
          onClick={() => onRunAction(resolution.recoverLocalCopy)}
          type="button"
        >
          远端并另存本地
        </Button>
      </div>
    </ToolSection>
  );
}
