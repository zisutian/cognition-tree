import { RefreshCw } from "lucide-react";
import {
  projectRepositoryLabelIssueMessage,
  type RepositoryOption,
} from "../../../application/repository/ordinaryRepositoryViewModel";
import type { RepositoryViewModel } from
  "../../../application/repository/repositoryViewModel";
import { Button, Section } from "../../ui/shared/primitives";
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

  return (
    <>
      <Section
        className="repository-section repository-status-section"
        title="状态"
      >
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
      </Section>
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
      <Section className="repository-section" title="操作">
        <div className="repository-operation-strip">
          {active && view.activeSessionRecoveryAction && !view.hasSaveConflict
            ? (
              <Button
                disabled={busy}
                onClick={() =>
                  onRunAction(view.activeSessionRecoveryAction!.run)}
                type="button"
                variant="secondary"
              >
                <RefreshCw aria-hidden="true" size={13} />
                {view.activeSessionRecoveryAction.label}
              </Button>
            )
            : null}
          {!active || (!view.activeSessionRecoveryAction && !view.hasSaveConflict)
            ? (
              <Button
                disabled={busy}
                onClick={() => onRunAction(
                  active ? view.reload : view.refreshRepositories,
                )}
                type="button"
                variant="secondary"
              >
                <RefreshCw aria-hidden="true" size={13} />
                {active ? "重新扫描文件" : "重新检查仓库"}
              </Button>
            )
            : null}
        </div>
      </Section>
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
