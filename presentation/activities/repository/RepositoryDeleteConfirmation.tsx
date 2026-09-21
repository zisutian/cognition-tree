import {
  Button,
  FieldRow,
  FormActions,
  FormLayout,
  InputControl,
} from "compact-ui";
import { useState } from "react";
import type { RepositoryOption } from "../../../application/repository/index.ts";
import { useExclusiveAsyncAction } from "../../ui/index.ts";

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
    if (busy || !canDeleteManagedRepositoryData(repository, confirmation))
      return;
    const pending = deletion.run(onDelete);

    if (pending && (await pending)) {
      onCancel();
    }
  };

  return (
    <div aria-label={`确认删除仓库 ${repository.label}`} role="group">
      <FormLayout onSubmit={() => void runDeletion()}>
        <FieldRow label="仓库名称">
          {(accessibility) => (
            <InputControl
              {...accessibility}
              autoComplete="off"
              disabled={busy}
              onChange={(event) => setConfirmation(event.target.value)}
              value={confirmation}
            />
          )}
        </FieldRow>
        <FormActions>
          <Button
            disabled={
              busy || !canDeleteManagedRepositoryData(repository, confirmation)
            }
            type="submit"
            variant="danger"
          >
            永久删除
          </Button>
          <Button
            disabled={busy}
            onClick={onCancel}
            type="button"
            variant="normal"
          >
            取消
          </Button>
        </FormActions>
      </FormLayout>
    </div>
  );
}
