import { useEffect, useState } from "react";
import type {
  RepositoryConflictResolutionView,
} from "../../../application/repository/index.ts";
import {
  Button,
  ToolPropertyList,
  ToolPropertyRow,
  ToolSection,
} from "../../ui/index.ts";


export function RepositoryConflictStatus({
  resolution,
}: {
  resolution: RepositoryConflictResolutionView;
}) {
  const [details, setDetails] = useState<
    | { status: "loading" }
    | {
        remoteRevision: string;
        status: "ready";
        unitIds: readonly string[];
      }
    | { message: string; status: "failed" }
  >({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    setDetails({ status: "loading" });
    void resolution.loadDetails().then((value) => {
      if (active) setDetails({ ...value, status: "ready" });
    }, (error: unknown) => {
      if (active) {
        setDetails({
          message: error instanceof Error
            ? error.message
            : "冲突详情读取失败。",
          status: "failed",
        });
      }
    });
    return () => {
      active = false;
    };
  }, [reloadKey, resolution]);

  return (
    <ToolPropertyList aria-label="同步冲突详情">
      <ToolPropertyRow label="同步冲突" value="存在" />
      {details.status === "ready" ? (
        <ToolPropertyRow
          label="远端 revision"
          value={<code>{details.remoteRevision}</code>}
        />
      ) : null}
      <ToolPropertyRow
        label="冲突单元"
        value={details.status === "loading"
          ? "正在读取…"
          : details.status === "failed"
            ? "读取失败"
            : details.unitIds.length > 0
              ? details.unitIds.join("、")
              : "整仓内容"}
      />
      {details.status === "failed" ? (
        <ToolPropertyRow
          actions={(
            <Button
              onClick={() => setReloadKey((current) => current + 1)}
              type="button"
            >
              重试
            </Button>
          )}
          label="详情错误"
          value={details.message}
        />
      ) : null}
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
