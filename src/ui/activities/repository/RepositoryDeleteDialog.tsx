import { useId, useRef, useState } from "react";
import type { RepositoryOption } from "../../../application/workspace/activities/repository/repositoryViewModel";
import type { DeleteRepositoryRequest } from "../../../application/workspace/session/useRepositoryCatalog";
import { Overlay } from "../../shared/Overlay";
import { Button } from "../../shared/primitives";

export function RepositoryDeleteDialog({
  repository,
  warning,
  onClose,
  onDelete,
}: {
  repository: RepositoryOption | null;
  warning: string;
  onClose: () => void;
  onDelete: (mode: DeleteRepositoryRequest["mode"]) => Promise<void>;
}) {
  if (!repository) {
    return null;
  }

  return (
    <RepositoryDeleteDialogContent
      key={repository.id}
      repository={repository}
      warning={warning}
      onClose={onClose}
      onDelete={onDelete}
    />
  );
}

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
    : [
        {
          label: "永久删除",
          mode: "delete-managed-data",
          requiresLabelConfirmation: true,
        },
      ];
}

function RepositoryDeleteDialogContent({
  repository,
  warning,
  onClose,
  onDelete,
}: {
  repository: RepositoryOption;
  warning: string;
  onClose: () => void;
  onDelete: (mode: DeleteRepositoryRequest["mode"]) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const descriptionId = useId();
  const titleId = useId();

  const isWebDav = repository.adapter === "webdav";
  const choices = getRepositoryDeletionChoices(repository);
  const runDeletion = async (mode: DeleteRepositoryRequest["mode"]) => {
    setBusy(true);
    setErrorMessage("");
    try {
      await onDelete(mode);
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "删除仓库失败。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay
      ariaDescribedBy={descriptionId}
      ariaLabelledBy={titleId}
      backdropClassName="ui-overlay-backdrop"
      className="ui-dialog repository-delete-dialog"
      initialFocusRef={cancelRef}
      modal
      role="alertdialog"
      trapFocus
      onDismiss={() => {
        if (!busy) {
          onClose();
        }
      }}
    >
      <h2 id={titleId}>删除仓库</h2>
      <div id={descriptionId}>
        <p>
          {isWebDav
            ? `请选择如何处理 WebDAV 仓库“${repository.label}”。`
            : `将永久删除仓库“${repository.label}”及其全部内容。`}
        </p>
        {warning ? <p className="repository-delete-warning">{warning}</p> : null}
      </div>
      <label className="repository-delete-confirmation">
        <span>
          {isWebDav
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
      {errorMessage ? (
        <p className="repository-create-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <div className="ui-dialog-actions">
        <Button
          disabled={busy}
          onClick={onClose}
          ref={cancelRef}
          type="button"
          variant="secondary"
        >
          取消
        </Button>
        {choices.map((choice) => (
          <Button
            className={choice.mode === "delete-managed-data"
              ? "ui-button-danger"
              : undefined}
            disabled={
              busy || (
                choice.requiresLabelConfirmation &&
                !canDeleteManagedRepositoryData(repository, confirmation)
              )
            }
            key={choice.mode}
            onClick={() => void runDeletion(choice.mode)}
            type="button"
            variant="secondary"
          >
            {choice.label}
          </Button>
        ))}
      </div>
    </Overlay>
  );
}
