import { RefreshCw } from "lucide-react";
import {
  projectRepositoryIssueActions,
  requiresManualLocalDeletion,
  type RepositoryIssueActionView,
  type RepositoryIssueView,
  type RepositoryViewModel,
} from "../../../application/repository/repositoryViewModel";
import { Button, Section } from "../../ui/shared/primitives";
import {
  RepositoryLocations,
  RepositoryMetadata,
} from "./RepositoryDetailShared";

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
  onCopy,
  onRunAction,
}: {
  busy: boolean;
  issue: RepositoryIssueView;
  pendingAction: PendingRepositoryIssueAction | null;
  view: RepositoryViewModel;
  onBeginAction: (pending: PendingRepositoryIssueAction) => void;
  onCancelAction: () => void;
  onConfirmAction: () => void;
  onCopy: (label: string, value: string) => void;
  onRunAction: (action: () => Promise<void>) => void;
}) {
  const actions = projectRepositoryIssueActions(issue);
  const manualDeletion = requiresManualLocalDeletion(issue);

  return (
    <>
      <Section
        className="repository-section repository-status-section"
        title="状态"
      >
        <RepositoryMetadata rows={[
          { label: "类型", value: issue.adapterLabel },
          {
            label: "状态",
            value: issue.status === "deleting" ? "正在清理" : "故障",
          },
          { label: "仓库 ID", value: issue.id },
        ]} />
        <p className="repository-warning" role="alert">
          {issue.message}
        </p>
      </Section>
      <RepositoryLocations
        busy={busy}
        rows={issue.locationRows}
        onCopy={onCopy}
      />
      <Section className="repository-section" title="处理">
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
              className={action.confirmation ? "ui-button-danger" : undefined}
              disabled={busy}
              key={`${action.mode}-${action.label}`}
              onClick={() => {
                if (action.confirmation) {
                  onBeginAction({ action, issue });
                  return;
                }
                onRunAction(() => view.deleteRepository({
                  id: issue.id,
                  mode: action.mode,
                }));
              }}
              type="button"
              variant="secondary"
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
                className="ui-button-danger"
                disabled={busy}
                onClick={onConfirmAction}
                type="button"
                variant="secondary"
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
      </Section>
    </>
  );
}
