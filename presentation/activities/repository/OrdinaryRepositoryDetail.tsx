import { RefreshCw } from "lucide-react";
import type {
  RepositoryOption,
  RepositoryViewModel,
} from "../../../application/repository/index.ts";

import { Button, ToolSection } from "../../ui/index.ts";

import { RepositoryDangerZone } from "./RepositoryDangerZone.tsx";
import { RepositoryConflictActions } from "./RepositoryConflictResolution.tsx";

export function OrdinaryRepositoryDetail({
  busy,
  confirmingDelete,
  repository,
  view,
  onOpen,
  onCancelDelete,
  onDelete,
  onRunAction,
  onStartDelete,
}: {
  busy: boolean;
  confirmingDelete: boolean;
  repository: RepositoryOption;
  view: RepositoryViewModel;
  onOpen(repositoryId: string): Promise<void>;
  onCancelDelete: () => void;
  onDelete: () => Promise<boolean>;
  onRunAction: (action: () => Promise<void>) => void;
  onStartDelete: () => void;
}) {
  const active = repository.id === view.activeRepositoryId;
  const recoveryAction =
    active && !view.hasSaveConflict ? view.activeSessionRecoveryAction : null;

  return (
    <>
      <ToolSection>
        <div className="ui-actions">
          <Button
            disabled={busy}
            onClick={() => onRunAction(() => onOpen(repository.id))}
            type="button"
            variant="primary"
          >
            {active ? "继续编辑笔记" : "打开仓库"}
          </Button>
        </div>
      </ToolSection>
      {active && view.activeConflictResolution ? (
        <RepositoryConflictActions
          busy={busy}
          resolution={view.activeConflictResolution}
          onRunAction={onRunAction}
        />
      ) : null}
      {recoveryAction || !active ? (
        <ToolSection title="操作">
          <div className="ui-actions">
            {recoveryAction ? (
              <Button
                disabled={busy}
                onClick={() => onRunAction(recoveryAction.run)}
                type="button"
                variant="secondary"
              >
                <RefreshCw aria-hidden="true" size={13} />
                {recoveryAction.label}
              </Button>
            ) : null}
            {!active ? (
              <Button
                disabled={busy}
                onClick={() => onRunAction(view.refreshRepositories)}
                type="button"
                variant="secondary"
              >
                <RefreshCw aria-hidden="true" size={13} />
                重新检查仓库
              </Button>
            ) : null}
          </div>
        </ToolSection>
      ) : null}
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
