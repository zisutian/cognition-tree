import { useEffect, useState, type FormEvent } from "react";
import type { RepositoryAdapterOption } from "../../application/workspace/activities/repository/repositoryViewModel";
import type { CreateRepositoryRequest } from "../../application/repository/repositoryCatalog";
import { Button, SegmentedControl, cx } from "./shared/primitives";

export type RepositoryCreateFormDraft = {
  authenticationType: "basic" | "none";
  name: string;
  password: string;
  url: string;
  username: string;
};

export const repositoryPasswordInputAttributes = {
  autoComplete: "new-password",
  maxLength: 4_096,
  type: "password",
} as const;

function selectInitialAdapter(adapters: RepositoryAdapterOption[]) {
  return adapters.some(({ value }) => value === "local")
    ? "local"
    : adapters[0]?.value ?? "browser";
}

export function createRepositoryCreateFormDraft(
  initialName = "",
): RepositoryCreateFormDraft {
  return {
    authenticationType: "none",
    name: initialName,
    password: "",
    url: "",
    username: "",
  };
}

export function createRepositoryRequest(
  adapter: RepositoryAdapterOption["value"],
  draft: RepositoryCreateFormDraft,
): CreateRepositoryRequest {
  const name = draft.name.trim();

  if (adapter === "webdav") {
    return {
      adapter,
      authentication: draft.authenticationType === "none"
        ? { type: "none" }
        : {
            password: draft.password,
            type: "basic",
            username: draft.username.trim(),
          },
      name,
      url: draft.url.trim(),
    };
  }

  return { adapter, name };
}

export function clearRepositoryCreateFormAfterSuccess(
  draft: RepositoryCreateFormDraft,
): RepositoryCreateFormDraft {
  return {
    ...draft,
    name: "",
    password: "",
    url: "",
    username: "",
  };
}

export function RepositoryCreateForm({
  adapters,
  className,
  disabled = false,
  initialName = "",
  onCreate,
  onError,
}: {
  adapters: RepositoryAdapterOption[];
  className?: string;
  disabled?: boolean;
  initialName?: string;
  onCreate: (input: CreateRepositoryRequest) => Promise<void>;
  onError?: (error: unknown) => void;
}) {
  const [adapter, setAdapter] = useState<RepositoryAdapterOption["value"]>(
    () => selectInitialAdapter(adapters),
  );
  const [draft, setDraft] = useState<RepositoryCreateFormDraft>(
    () => createRepositoryCreateFormDraft(initialName),
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!adapters.some(({ value }) => value === adapter)) {
      setAdapter(selectInitialAdapter(adapters));
    }
  }, [adapter, adapters]);

  if (adapters.length === 0) {
    return null;
  }

  const busy = disabled || submitting;
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setSubmitting(true);

    try {
      await onCreate(createRepositoryRequest(adapter, draft));
      setDraft(clearRepositoryCreateFormAfterSuccess);
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
      {adapters.length > 1 ? (
        <SegmentedControl
          ariaLabel="仓库存储类型"
          fill
          options={adapters}
          value={adapter}
          onChange={setAdapter}
        />
      ) : (
        <p className="repository-create-adapter">
          存储：{adapters[0]?.label}
        </p>
      )}
      <label>
        <span>名称</span>
        <input
          autoComplete="off"
          className="ui-input"
          disabled={busy}
          maxLength={80}
          onChange={(event) => setDraft((current) => ({
            ...current,
            name: event.target.value,
          }))}
          required
          value={draft.name}
        />
      </label>
      {adapter === "webdav" ? (
        <>
          <label>
            <span>地址</span>
            <input
              autoComplete="url"
              className="ui-input"
              disabled={busy}
              maxLength={2_048}
              onChange={(event) => setDraft((current) => ({
                ...current,
                url: event.target.value,
              }))}
              placeholder="https://dav.example/notes/"
              required
              type="url"
              value={draft.url}
            />
          </label>
          <label>
            <span>认证</span>
            <select
              className="ui-input"
              disabled={busy}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  authenticationType: event.target.value as "basic" | "none",
                }));
              }}
              value={draft.authenticationType}
            >
              <option value="none">无认证</option>
              <option value="basic">Basic</option>
            </select>
          </label>
          {draft.authenticationType === "basic" ? (
            <>
              <label>
                <span>用户名</span>
                <input
                  autoComplete="username"
                  className="ui-input"
                  disabled={busy}
                  maxLength={256}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    username: event.target.value,
                  }))}
                  required
                  value={draft.username}
                />
              </label>
              <label>
                <span>密码</span>
                <input
                  {...repositoryPasswordInputAttributes}
                  className="ui-input"
                  disabled={busy}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    password: event.target.value,
                  }))}
                  required
                  value={draft.password}
                />
              </label>
            </>
          ) : null}
        </>
      ) : null}
      {errorMessage ? (
        <p className="repository-create-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <div className="ui-actions">
        <Button disabled={busy} type="submit" variant="primary">
          {submitting ? "创建中" : adapter === "webdav" ? "添加连接" : "创建仓库"}
        </Button>
      </div>
    </form>
  );
}
