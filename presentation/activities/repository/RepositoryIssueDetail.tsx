import { FormActions } from "compact-ui";
import { Button, Section, Stack, StatusText } from "compact-ui";
import { RefreshCw } from "lucide-react";
import {
  projectRepositoryIssueActions,
  type RepositoryIssueActionView,
  type RepositoryIssueView,
  requiresManualLocalDeletion,
} from "../../../application/repository/index.ts";

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
          <StatusText mode="live" tone="warning">
            此格式仅支持手动删除
          </StatusText>
        ) : null}
        <FormActions>
          {manualDeletion ? (
            <Button
              disabled={busy}
              onClick={() => onRunAction(view.refreshRepositories)}
              type="button"
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
            >
              {action.label}
            </Button>
          ))}
        </FormActions>
        {pendingAction?.issue.id === issue.id ? (
          <div aria-label={`确认${pendingAction.action.label}`} role="group">
            <Stack gap="tight">
              <StatusText>{pendingAction.action.confirmation}</StatusText>
              <FormActions>
                <Button
                  disabled={busy}
                  onClick={onConfirmAction}
                  type="button"
                  tone="danger"
                >
                  确认
                </Button>
                <Button
                  appearance="plain"
                  disabled={busy}
                  onClick={onCancelAction}
                  type="button"
                >
                  取消
                </Button>
              </FormActions>
            </Stack>
          </div>
        ) : null}
      </Section>
    </>
  );
}
