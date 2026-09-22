import { FormActions } from "compact-ui";
import { Button, Section } from "compact-ui";
import { RefreshCw } from "lucide-react";
import type {
  RepositoryOption,
  RepositoryViewModel,
} from "../../../application/repository/index.ts";

import { RepositoryConflictActions } from "./RepositoryConflictResolution.tsx";
import { RepositoryDangerZone } from "./RepositoryDangerZone.tsx";

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
      {!active ? (
        <Section>
          <FormActions>
            <Button
              disabled={busy}
              onClick={() => onRunAction(() => onOpen(repository.id))}
              type="button"
            >
              打开仓库
            </Button>
          </FormActions>
        </Section>
      ) : null}
      {active && view.activeConflictResolution ? (
        <RepositoryConflictActions
          busy={busy}
          resolution={view.activeConflictResolution}
          onRunAction={onRunAction}
        />
      ) : null}
      {recoveryAction || !active ? (
        <Section title="操作">
          <FormActions>
            {recoveryAction ? (
              <Button
                disabled={busy}
                onClick={() => onRunAction(recoveryAction.run)}
                type="button"
              >
                <RefreshCw aria-hidden="true" size={13} />
                {recoveryAction.label}
              </Button>
            ) : null}
            {!active ? (
              <Button
                appearance="plain"
                disabled={busy}
                onClick={() => onRunAction(view.refreshRepositories)}
                type="button"
              >
                <RefreshCw aria-hidden="true" size={13} />
                重新检查仓库
              </Button>
            ) : null}
          </FormActions>
        </Section>
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
