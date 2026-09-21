import {
  Button,
  FieldRow,
  FormActions,
  FormLayout,
  InputControl,
} from "compact-ui";
import { useState, type FormEvent } from "react";
import type { CreateRepositoryRequest } from "../../../application/repository/index.ts";
import { useExclusiveAsyncAction } from "../../ui/index.ts";

export type RepositoryCreateFormDraft = { name: string };

export function createRepositoryCreateFormDraft(
  initialName = "",
): RepositoryCreateFormDraft {
  return { name: initialName };
}

export function createRepositoryRequest(
  draft: RepositoryCreateFormDraft,
): CreateRepositoryRequest {
  return { name: draft.name.trim() };
}

export function clearRepositoryCreateFormAfterSuccess(): RepositoryCreateFormDraft {
  return { name: "" };
}

export function RepositoryCreateForm({
  disabled = false,
  initialName = "",
  onCreate,
  onError,
}: {
  disabled?: boolean;
  initialName?: string;
  onCreate: (input: CreateRepositoryRequest) => Promise<void>;
  onError?: (error: unknown) => void;
}) {
  const [draft, setDraft] = useState<RepositoryCreateFormDraft>(() =>
    createRepositoryCreateFormDraft(initialName),
  );
  const [errorMessage, setErrorMessage] = useState("");
  const submission = useExclusiveAsyncAction();
  const submitting = submission.busy;
  const busy = disabled || submitting;
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    const pending = submission.run(() =>
      onCreate(createRepositoryRequest(draft)),
    );

    if (!pending) return;
    setErrorMessage("");

    try {
      await pending;
      setDraft(clearRepositoryCreateFormAfterSuccess());
    } catch (error) {
      const message = error instanceof Error ? error.message : "创建仓库失败。";

      setErrorMessage(message);
      onError?.(error);
    }
  };

  return (
    <FormLayout onSubmit={handleSubmit}>
      <FieldRow fieldId="repository-create-name" label="名称">
        {(accessibility) => (
          <InputControl
            {...accessibility}
            autoComplete="off"
            disabled={busy}
            error={errorMessage || undefined}
            maxLength={80}
            onChange={(event) => setDraft({ name: event.target.value })}
            required
            value={draft.name}
          />
        )}
      </FieldRow>
      <FormActions>
        <Button disabled={busy} type="submit" variant="normal">
          {submitting ? "创建中" : "创建仓库"}
        </Button>
      </FormActions>
    </FormLayout>
  );
}
