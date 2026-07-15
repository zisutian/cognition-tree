import { useState, type FormEvent } from "react";
import {
  Button,
  Panel,
  PanelBody,
  PanelHeader,
  StatusLine,
} from "./shared/primitives";

export function RepositorySetupView({
  catalogLabel,
  onCreate,
}: {
  catalogLabel: string;
  onCreate: (input: { id: string; name: string }) => Promise<void>;
}) {
  const [repositoryId, setRepositoryId] = useState("default");
  const [name, setName] = useState("本地笔记库");
  const [errorMessage, setErrorMessage] = useState("");
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setErrorMessage("");

    try {
      await onCreate({ id: repositoryId.trim(), name: name.trim() });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "创建仓库失败。",
      );
      setCreating(false);
    }
  };

  return (
    <main className="session-state-frame">
      <Panel aria-label="创建仓库" className="repository-setup-panel">
        <PanelHeader title="创建仓库" />
        <PanelBody>
          <form className="repository-setup-form" onSubmit={handleSubmit}>
            <label>
              <span>仓库 ID</span>
              <input
                autoComplete="off"
                className="ui-input"
                disabled={creating}
                maxLength={64}
                onChange={(event) => setRepositoryId(event.target.value)}
                pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,63}"
                required
                value={repositoryId}
              />
            </label>
            <label>
              <span>名称</span>
              <input
                autoComplete="off"
                className="ui-input"
                disabled={creating}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                required
                value={name}
              />
            </label>
            <div className="repository-setup-meta">{catalogLabel}</div>
            {errorMessage ? (
              <StatusLine tone="error">{errorMessage}</StatusLine>
            ) : null}
            <div className="ui-actions">
              <Button disabled={creating} type="submit" variant="primary">
                {creating ? "创建中" : "创建"}
              </Button>
            </div>
          </form>
        </PanelBody>
      </Panel>
    </main>
  );
}
