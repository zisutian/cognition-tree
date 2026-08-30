import { useState } from "react";
import type { RepositoryOption } from
  "../../../application/repository/ordinaryRepositoryViewModel";
import { Button } from "../../ui/shared/primitives";
import { InputControl } from "../../ui/shared/controls";
import { useExclusiveAsyncAction } from
  "../../ui/shared/useExclusiveAsyncAction";

export function canDeleteManagedRepositoryData(
  repository: RepositoryOption,
  confirmation: string,
) {
  return confirmation === repository.label;
}

export function RepositoryDeleteConfirmation({
  repository,
  onCancel,
  onDelete,
}: {
  repository: RepositoryOption;
  onCancel: () => void;
  onDelete: () => Promise<boolean>;
}) {
  const [confirmation, setConfirmation] = useState("");
  const deletion = useExclusiveAsyncAction();
  const busy = deletion.busy;
  const runDeletion = async () => {
    const pending = deletion.run(onDelete);

    if (pending && await pending) {
      onCancel();
    }
  };

  return (
    <div
      aria-label={`确认删除仓库 ${repository.label}`}
      className="repository-inline-confirmation repository-delete-confirmation"
      role="group"
    >
      <div className="repository-delete-choice">
        <label className="repository-delete-confirmation-field">
          <span>永久删除前请输入仓库名称</span>
          <InputControl
            autoComplete="off"
            disabled={busy}
            onChange={(event) => setConfirmation(event.target.value)}
            value={confirmation}
          />
        </label>
        <div className="repository-inline-confirmation-actions">
          <Button
            disabled={busy || !canDeleteManagedRepositoryData(
              repository,
              confirmation,
            )}
            onClick={() => void runDeletion()}
            type="button"
            variant="danger"
          >
            永久删除
          </Button>
          <Button
            disabled={busy}
            onClick={onCancel}
            type="button"
            variant="secondary"
          >
            取消
          </Button>
        </div>
      </div>
    </div>
  );
}
