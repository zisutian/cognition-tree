import { Button, Section } from "compact-ui";
import { RefreshCw } from "lucide-react";
import {
  projectRepositoryIssueActions,
  type RepositoryIssueActionView,
  type RepositoryIssueView,
  requiresManualLocalDeletion,
} from "../../../application/repository/index.ts";
import { createClassNames } from "../../ui/index.ts";
import repositoryStyles from "./repository.module.css";
const cx = createClassNames(repositoryStyles);

import type { RepositoryViewModel } from "../../../application/repository/index.ts";

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
      <Section title="处理">
        {manualDeletion ? (
          <p className={cx("repository-manual-removal")}>
            此格式仅支持手动删除
          </p>
        ) : null}
        <div className={cx("ui-actions")}>
          {manualDeletion ? (
            <Button
              disabled={busy}
              onClick={() => onRunAction(view.refreshRepositories)}
              type="button"
              variant="normal"
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
              variant="normal"
            >
              {action.label}
            </Button>
          ))}
        </div>
        {pendingAction?.issue.id === issue.id ? (
          <div
            aria-label={`确认${pendingAction.action.label}`}
            className={cx(
              "repository-inline-confirmation repository-issue-confirmation",
            )}
            role="group"
          >
            <p>{pendingAction.action.confirmation}</p>
            <div className={cx("repository-inline-confirmation-actions")}>
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
                variant="normal"
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
