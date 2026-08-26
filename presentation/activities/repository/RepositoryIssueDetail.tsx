import { RefreshCw } from "lucide-react";
import {
  projectRepositoryIssueActions,
  type RepositoryIssueActionView,
  type RepositoryIssueView,
} from "../../../application/repository/ordinaryRepositoryViewModel";
import { requiresManualLocalDeletion } from
  "../../../application/repository/repositoryIssueProjection";
import type { RepositoryViewModel } from
  "../../../application/repository/repositoryViewModel";
import { Button } from "../../ui/shared/primitives";
import { ToolSection } from "../../ui/shared/ToolSurface";

export type PendingRepositoryIssueAction = {
  action: RepositoryIssueActionView;
  issue: RepositoryIssueView;
};

export function RepositoryIssueDetail({
  busy,
  issue,
  pendingAction,
  view,
  onBeginAction,
  onCancelAction,
  onConfirmAction,
  onRunAction,
}: {
  busy: boolean;
  issue: RepositoryIssueView;
  pendingAction: PendingRepositoryIssueAction | null;
  view: RepositoryViewModel;
  onBeginAction: (pending: PendingRepositoryIssueAction) => void;
  onCancelAction: () => void;
  onConfirmAction: () => void;
  onRunAction: (action: () => Promise<void>) => void;
}) {
  const actions = projectRepositoryIssueActions(issue);
  const manualDeletion = requiresManualLocalDeletion(issue);

  return (
    <>
      <ToolSection title="处理">
        {manualDeletion ? (
          <p className="repository-manual-removal">
            该格式不受支持，请在文件系统中手工删除上述目录。
          </p>
        ) : null}
        <div className="repository-operation-strip">
          {manualDeletion ? (
            <Button
              disabled={busy}
              onClick={() => onRunAction(view.refreshRepositories)}
              type="button"
              variant="secondary"
            >
              <RefreshCw aria-hidden="true" size={13} />
              重新检查
            </Button>
          ) : null}
          {actions.map((action) => (
            <Button
              disabled={busy}
              key={action.label}
              onClick={() => {
                if (action.confirmation) {
                  onBeginAction({ action, issue });
                  return;
                }
                onRunAction(() => view.deleteRepository({ id: issue.id }));
              }}
              type="button"
              variant={action.confirmation ? "danger" : "secondary"}
            >
              {action.label}
            </Button>
          ))}
        </div>
        {pendingAction?.issue.id === issue.id ? (
          <div
            aria-label={`确认${pendingAction.action.label}`}
            className="repository-inline-confirmation repository-issue-confirmation"
            role="group"
          >
            <p>{pendingAction.action.confirmation}</p>
            <div className="repository-inline-confirmation-actions">
              <Button
                disabled={busy}
                onClick={onConfirmAction}
                type="button"
                variant="danger"
              >
                确认
              </Button>
              <Button
                disabled={busy}
                onClick={onCancelAction}
                type="button"
                variant="secondary"
              >
                取消
              </Button>
            </div>
          </div>
        ) : null}
      </ToolSection>
    </>
  );
}
