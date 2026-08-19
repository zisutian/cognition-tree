import { useState } from "react";
import type { DeleteRepositoryRequest } from "../../../application/repository/repositoryCatalog";
import type { RepositoryOption } from "../../../application/repository/repositoryViewModel";
import { Button } from "../../ui/shared/primitives";

export function canDeleteManagedRepositoryData(
  repository: RepositoryOption,
  confirmation: string,
) {
  return confirmation === repository.label;
}

export function getRepositoryDeletionChoices(
  repository: RepositoryOption,
): Array<{
  label: string;
  mode: DeleteRepositoryRequest["mode"];
  requiresLabelConfirmation: boolean;
}> {
  return repository.adapter === "webdav"
    ? [
        {
          label: "仅移除连接",
          mode: "remove-connection",
          requiresLabelConfirmation: false,
        },
        {
          label: "删除远端数据",
          mode: "delete-managed-data",
          requiresLabelConfirmation: true,
        },
      ]
    : [{
        label: "永久删除",
        mode: "delete-managed-data",
        requiresLabelConfirmation: true,
      }];
}

export function RepositoryDeleteConfirmation({
  repository,
  warning,
  onCancel,
  onDelete,
}: {
  repository: RepositoryOption;
  warning: string;
  onCancel: () => void;
  onDelete: (mode: DeleteRepositoryRequest["mode"]) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const choices = getRepositoryDeletionChoices(repository);
  const removeConnection = choices.find(
    ({ mode }) => mode === "remove-connection",
  );
  const deleteManagedData = choices.find(
    ({ mode }) => mode === "delete-managed-data",
  )!;
  const runDeletion = async (mode: DeleteRepositoryRequest["mode"]) => {
    setBusy(true);
    try {
      if (await onDelete(mode)) {
        onCancel();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      aria-label={`确认删除仓库 ${repository.label}`}
      className="repository-inline-confirmation repository-delete-confirmation"
      role="group"
    >
      {warning ? <p className="repository-warning">{warning}</p> : null}
      {removeConnection ? (
        <div className="repository-delete-choice">
          <div>
            <strong>{removeConnection.label}</strong>
            <p>只移除本机连接，保留 WebDAV 远端数据。</p>
          </div>
          <div className="repository-inline-confirmation-actions">
            <Button
              disabled={busy}
              onClick={() => void runDeletion(removeConnection.mode)}
              type="button"
              variant="secondary"
            >
              确认
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
      ) : null}
      <div className="repository-delete-choice">
        <label className="repository-delete-confirmation-field">
          <span>
            {repository.adapter === "webdav"
              ? "删除远端数据前请输入仓库名称"
              : "永久删除前请输入仓库名称"}
          </span>
          <input
            autoComplete="off"
            className="ui-input"
            disabled={busy}
            onChange={(event) => setConfirmation(event.target.value)}
            value={confirmation}
          />
        </label>
        <div className="repository-inline-confirmation-actions">
          <Button
            className="ui-button-danger"
            disabled={busy || !canDeleteManagedRepositoryData(
              repository,
              confirmation,
            )}
            onClick={() => void runDeletion(deleteManagedData.mode)}
            type="button"
            variant="secondary"
          >
            {deleteManagedData.label}
          </Button>
          {removeConnection ? null : (
            <Button
              disabled={busy}
              onClick={onCancel}
              type="button"
              variant="secondary"
            >
              取消
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
