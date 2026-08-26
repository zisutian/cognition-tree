import { RefreshCw } from "lucide-react";
import type {
  BuiltInId,
} from "../../../application/repository/builtInCatalog";
import type {
  BuiltInIssueView,
  BuiltInOption,
} from "../../../application/repository/builtInRepositoryViewModel";
import type {
  RepositoryViewModel,
} from "../../../application/repository/repositoryViewModel";
import {
  Button,
  EmptyState,
} from "../../ui/shared/primitives";
import { ToolSection } from "../../ui/shared/ToolSurface";
import {
  RepositoryLocations,
  RepositoryMetadata,
} from "./RepositoryDetailShared";
import { builtInLabel } from "./repositoryViewHelpers";
import { RepositoryConflictResolution } from "./RepositoryConflictResolution";

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
        <ToolSection title="状态">
          <RepositoryMetadata rows={[
            { label: "状态", value: "故障" },
            { label: "数据 ID", value: issue.id },
            { label: "保护", value: "受保护内置数据" },
          ]} />
          <p className="repository-warning" role="alert">{issue.message}</p>
        </ToolSection>
        <RepositoryLocations
          busy={busy}
          rows={issue.locationRows}
          onCopy={onCopy}
        />
        <ToolSection title="操作">
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
        </ToolSection>
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
      <ToolSection title="状态">
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
      </ToolSection>
      <RepositoryLocations
        busy={busy}
        rows={repository.locationRows}
        onCopy={onCopy}
      />
      {repository.conflictResolution
        ? (
            <RepositoryConflictResolution
              busy={busy}
              resolution={repository.conflictResolution}
              onRunAction={onRunAction}
            />
          )
        : null}
      {repository.conflictResolution
        ? null
        : (
            <ToolSection title="操作">
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
            </ToolSection>
          )}
    </>
  );
}
