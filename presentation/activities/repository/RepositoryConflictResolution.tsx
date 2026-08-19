import { useEffect, useState } from "react";
import type {
  RepositoryConflictResolutionView,
} from "../../../application/repository/repositoryViewModel";
import { Button, Section } from "../../ui/shared/primitives";

export function RepositoryConflictResolution({
  busy,
  resolution,
  onRunAction,
}: {
  busy: boolean;
  resolution: RepositoryConflictResolutionView;
  onRunAction(action: () => Promise<void>): void;
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
    <Section className="repository-section" title="同步冲突">
      <p className="repository-warning" role="alert">
        本地与远端修改均已保留。选择一方前不会覆盖当前本地编辑。
      </p>
      <dl className="repository-conflict-units">
        <dt>冲突单元</dt>
        <dd>
          {unitIds === null
            ? "正在读取…"
            : unitIds.length > 0
              ? unitIds.join("、")
              : "整仓内容"}
        </dd>
      </dl>
      <div className="repository-operation-strip">
        <Button
          disabled={busy}
          onClick={() => onRunAction(resolution.keepLocal)}
          type="button"
          variant="primary"
        >
          以当前远端版本保留本地
        </Button>
        <Button
          disabled={busy}
          onClick={() => onRunAction(resolution.useRemote)}
          type="button"
          variant="secondary"
        >
          采用远端
        </Button>
        <Button
          disabled={busy}
          onClick={() => onRunAction(resolution.recoverLocalCopy)}
          type="button"
          variant="secondary"
        >
          采用远端并另存本地正文
        </Button>
      </div>
    </Section>
  );
}
