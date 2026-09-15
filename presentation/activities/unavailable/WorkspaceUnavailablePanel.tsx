// SPDX-License-Identifier: GPL-3.0-or-later

import { Button, EmptyState, Page, useFeedback } from "../../ui/index.ts";
import type { WorkbenchWorkspaceState } from "../../workspace/index.ts";

export function WorkspaceUnavailablePanel({
  onOpenRepository,
  workspace,
}: {
  onOpenRepository: () => void;
  workspace: Exclude<WorkbenchWorkspaceState, { status: "ready" }>;
}) {
  const feedback = useFeedback();
  const title =
    workspace.status === "loading"
      ? "正在载入笔记仓库"
      : workspace.status === "failed"
        ? "笔记仓库无法挂载"
        : "尚未创建笔记仓库";
  const description =
    workspace.status === "failed" ? workspace.errorMessage : undefined;

  return (
    <Page aria-label={title} kind="empty">
      <EmptyState
        action={
          <>
            {workspace.status === "failed" ? (
              <Button
                onClick={() => void feedback.runAction(workspace.retry)}
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
    </Page>
  );
}
