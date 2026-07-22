import type { WorkbenchWorkspaceState } from "../workbenchApplication";
import { Button, EmptyState, Panel } from "../../ui/shared/primitives";

export function WorkspaceUnavailablePanel({
  onOpenRepository,
  workspace,
}: {
  onOpenRepository: () => void;
  workspace: Exclude<WorkbenchWorkspaceState, { status: "ready" }>;
}) {
  const title = workspace.status === "loading"
    ? "正在载入笔记仓库"
    : workspace.status === "failed"
      ? "笔记仓库无法挂载"
      : "尚未创建笔记仓库";
  const description = workspace.status === "loading"
    ? `正在从${workspace.storageLabel}读取内容。`
    : workspace.status === "failed"
      ? workspace.errorMessage
      : "请先前往仓库活动创建一个普通仓库。";

  return (
    <Panel aria-label={title} className="placeholder-panel">
      <EmptyState
        action={
          <>
            {workspace.status === "failed" ? (
              <Button
                onClick={() => void workspace.retry()}
                type="button"
                variant="secondary"
              >
                重试挂载
              </Button>
            ) : null}
            <Button onClick={onOpenRepository} type="button" variant="primary">
              前往仓库
            </Button>
          </>
        }
        description={description}
        title={title}
      />
    </Panel>
  );
}
