import { FormActions } from "compact-ui";
import { Button, EmptyState, Section } from "compact-ui";
import { RefreshCw } from "lucide-react";
import type {
  BuiltInId,
  BuiltInIssueView,
  BuiltInOption,
  RepositoryViewModel,
} from "../../../application/repository/index.ts";

import { RepositoryConflictActions } from "./RepositoryConflictResolution.tsx";
import { builtInLabel } from "./repositoryViewHelpers.ts";

export function BuiltInRepositoryDetail({
  busy,
  id,
  issue,
  repository,
  view,
  onRunAction,
}: {
  busy: boolean;
  id: BuiltInId;
  issue: BuiltInIssueView | null;
  repository: BuiltInOption | null;
  view: RepositoryViewModel;
  onRunAction: (action: () => Promise<void>) => void;
}) {
  if (issue) {
    return (
      <>
        <Section title="操作">
          <FormActions>
            <Button
              disabled={busy || view.retryingBuiltInId !== null}
              onClick={() => onRunAction(() => view.retryBuiltIn(issue.id))}
              type="button"
              variant="normal"
            >
              <RefreshCw aria-hidden="true" size={13} />
              重试
            </Button>
          </FormActions>
        </Section>
      </>
    );
  }
  if (!repository) {
    return (
      <EmptyState
        action={
          view.builtInCatalogStatus === "failed" ? (
            <Button
              disabled={busy}
              onClick={() => onRunAction(view.reloadBuiltInCatalog)}
              type="button"
              variant="normal"
            >
              重试内置数据
            </Button>
          ) : undefined
        }
        description={view.builtInCatalogErrorMessage || "内置数据正在载入。"}
        title={builtInLabel(id)}
      />
    );
  }
  return (
    <>
      {repository.conflictResolution ? (
        <RepositoryConflictActions
          busy={busy}
          resolution={repository.conflictResolution}
          onRunAction={onRunAction}
        />
      ) : null}
      {repository.conflictResolution ? null : (
        <Section title="操作">
          <FormActions>
            <Button
              disabled={busy}
              onClick={() =>
                onRunAction(repository.recoveryAction?.run ?? repository.reload)
              }
              type="button"
              variant="normal"
            >
              <RefreshCw aria-hidden="true" size={13} />
              {repository.recoveryAction?.label ?? "重新加载"}
            </Button>
          </FormActions>
        </Section>
      )}
    </>
  );
}
