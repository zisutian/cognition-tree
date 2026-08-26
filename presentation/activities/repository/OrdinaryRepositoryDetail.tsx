import { RefreshCw } from "lucide-react";
import {
  projectRepositoryLabelIssueMessage,
  type RepositoryOption,
} from "../../../application/repository/ordinaryRepositoryViewModel";
import type { RepositoryViewModel } from
  "../../../application/repository/repositoryViewModel";
import { Button } from "../../ui/shared/primitives";
import { ToolSection } from "../../ui/shared/ToolSurface";
import { RepositoryDangerZone } from "./RepositoryDangerZone";
import {
  RepositoryLocations,
  RepositoryMetadata,
} from "./RepositoryDetailShared";
import { RepositoryConflictResolution } from "./RepositoryConflictResolution";

export function OrdinaryRepositoryDetail({
  busy,
  confirmingDelete,
  repository,
  view,
  onCancelDelete,
  onCopy,
  onDelete,
  onRunAction,
  onStartDelete,
}: {
  busy: boolean;
  confirmingDelete: boolean;
  repository: RepositoryOption;
  view: RepositoryViewModel;
  onCancelDelete: () => void;
  onCopy: (label: string, value: string) => void;
  onDelete: () => Promise<boolean>;
  onRunAction: (action: () => Promise<void>) => void;
  onStartDelete: () => void;
}) {
  const active = repository.id === view.activeRepositoryId;
  const recoveryAction = active && !view.hasSaveConflict
    ? view.activeSessionRecoveryAction
    : null;

  return (
    <>
      <ToolSection title="状态">
        <RepositoryMetadata rows={[
          {
            label: "状态",
            value: active ? view.persistenceStatusLabel : "未打开",
          },
          { label: "仓库 ID", value: repository.id },
        ]} />
        {repository.labelIssue ? (
          <p className="repository-warning" role="alert">
            {projectRepositoryLabelIssueMessage(repository.labelIssue)}
          </p>
        ) : null}
        {active && view.activeSessionErrorMessage ? (
          <p className="repository-warning" role="alert">
            {view.activeSessionErrorMessage}
          </p>
        ) : null}
      </ToolSection>
      <RepositoryLocations
        busy={busy}
        rows={repository.locationRows}
        onCopy={onCopy}
      />
      {active && view.activeConflictResolution
        ? (
            <RepositoryConflictResolution
              busy={busy}
              resolution={view.activeConflictResolution}
              onRunAction={onRunAction}
            />
          )
        : null}
      {recoveryAction || !active
        ? (
          <ToolSection title="操作">
            <div className="repository-operation-strip">
              {recoveryAction
                ? (
                  <Button
                    disabled={busy}
                    onClick={() => onRunAction(recoveryAction.run)}
                    type="button"
                    variant="secondary"
                  >
                    <RefreshCw aria-hidden="true" size={13} />
                    {recoveryAction.label}
                  </Button>
                )
                : null}
              {!active
                ? (
                  <Button
                    disabled={busy}
                    onClick={() => onRunAction(view.refreshRepositories)}
                    type="button"
                    variant="secondary"
                  >
                    <RefreshCw aria-hidden="true" size={13} />
                    重新检查仓库
                  </Button>
                )
                : null}
            </div>
          </ToolSection>
        )
        : null}
      <RepositoryDangerZone
        busy={busy}
        confirming={confirmingDelete}
        repository={repository}
        view={view}
        onCancel={onCancelDelete}
        onDelete={onDelete}
        onStart={onStartDelete}
      />
    </>
  );
}
