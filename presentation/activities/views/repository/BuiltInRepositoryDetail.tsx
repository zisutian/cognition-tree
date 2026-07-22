import { RefreshCw } from "lucide-react";
import type {
  BuiltInId,
  BuiltInIssueView,
  BuiltInOption,
  RepositoryViewModel,
} from "../../../../application/repository/repositoryViewModel";
import {
  Button,
  EmptyState,
  Section,
} from "../../../ui/shared/primitives";
import {
  RepositoryLocations,
  RepositoryMetadata,
} from "./RepositoryDetailShared";
import { builtInLabel } from "./repositoryViewHelpers";

export function BuiltInRepositoryDetail({
  busy,
  id,
  issue,
  repository,
  view,
  onCopy,
  onRunAction,
}: {
  busy: boolean;
  id: BuiltInId;
  issue: BuiltInIssueView | null;
  repository: BuiltInOption | null;
  view: RepositoryViewModel;
  onCopy: (label: string, value: string) => void;
  onRunAction: (action: () => Promise<void>) => void;
}) {
  if (issue) {
    return (
      <>
        <Section
          className="repository-section repository-status-section"
          title="状态"
        >
          <RepositoryMetadata rows={[
            { label: "状态", value: "故障" },
            { label: "数据 ID", value: issue.id },
            { label: "保护", value: "受保护内置数据" },
          ]} />
          <p className="repository-warning" role="alert">{issue.message}</p>
        </Section>
        <RepositoryLocations
          busy={busy}
          rows={issue.locationRows}
          onCopy={onCopy}
        />
        <Section className="repository-section" title="操作">
          <div className="repository-operation-strip">
            <Button
              disabled={busy || view.retryingBuiltInId !== null}
              onClick={() => onRunAction(() => view.retryBuiltIn(issue.id))}
              type="button"
              variant="secondary"
            >
              <RefreshCw aria-hidden="true" size={13} />
              重试
            </Button>
          </div>
        </Section>
      </>
    );
  }
  if (!repository) {
    return (
      <EmptyState
        action={view.builtInCatalogStatus === "failed"
          ? (
            <Button
              disabled={busy}
              onClick={() => onRunAction(view.reloadBuiltInCatalog)}
              type="button"
              variant="secondary"
            >
              重试内置数据
            </Button>
          )
          : undefined}
        description={view.builtInCatalogErrorMessage || "内置数据正在载入。"}
        title={builtInLabel(id)}
      />
    );
  }
  return (
    <>
      <Section
        className="repository-section repository-status-section"
        title="状态"
      >
        <RepositoryMetadata rows={[
          { label: "状态", value: repository.statusLabel },
          { label: "数据 ID", value: repository.id },
          { label: "保护", value: "受保护内置数据" },
        ]} />
        {repository.errorMessage ? (
          <p className="repository-warning" role="alert">
            {repository.errorMessage}
          </p>
        ) : null}
      </Section>
      <RepositoryLocations
        busy={busy}
        rows={repository.locationRows}
        onCopy={onCopy}
      />
      <Section className="repository-section" title="操作">
        <div className="repository-operation-strip">
          <Button
            disabled={busy}
            onClick={() => onRunAction(
              repository.recoveryAction?.run ?? repository.reload,
            )}
            type="button"
            variant="secondary"
          >
            <RefreshCw aria-hidden="true" size={13} />
            {repository.recoveryAction?.label ?? "重新加载"}
          </Button>
        </div>
      </Section>
    </>
  );
}
