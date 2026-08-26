import { useState, type FormEvent } from "react";
import type { CreateRepositoryRequest } from
  "../../application/repository/repositoryCatalog";
import { Button, cx } from "./shared/primitives";
import {
  FieldRow,
  FormActions,
  FormLayout,
} from "./shared/FormLayout";

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
  className,
  disabled = false,
  initialName = "",
  onCreate,
  onError,
}: {
  className?: string;
  disabled?: boolean;
  initialName?: string;
  onCreate: (input: CreateRepositoryRequest) => Promise<void>;
  onError?: (error: unknown) => void;
}) {
  const [draft, setDraft] = useState<RepositoryCreateFormDraft>(
    () => createRepositoryCreateFormDraft(initialName),
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const busy = disabled || submitting;
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setSubmitting(true);

    try {
      await onCreate(createRepositoryRequest(draft));
      setDraft(clearRepositoryCreateFormAfterSuccess());
    } catch (error) {
      const message = error instanceof Error ? error.message : "创建仓库失败。";

      setErrorMessage(message);
      onError?.(error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      className={cx("repository-create-form", className)}
      onSubmit={handleSubmit}
    >
      <FormLayout>
        <FieldRow fieldId="repository-create-name" label="名称">
          {(accessibility) => (
            <input
              {...accessibility}
              autoComplete="off"
              className="ui-input"
              disabled={busy}
              maxLength={80}
              onChange={(event) => setDraft({ name: event.target.value })}
              required
              value={draft.name}
            />
          )}
        </FieldRow>
        {errorMessage ? (
          <p className="repository-create-error" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <FormActions>
          <Button disabled={busy} type="submit" variant="primary">
            {submitting ? "创建中" : "创建仓库"}
          </Button>
        </FormActions>
      </FormLayout>
    </form>
  );
}
