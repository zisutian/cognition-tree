import { Plus, RefreshCw, Undo2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { SettingsViewModel } from "../../../application/workspace/activities/settings/settingsViewModel";
import {
  Button,
  Panel,
  PanelBody,
  PanelHeader,
  Section,
} from "../../shared/primitives";
import { useFeedback } from "../../shared/FeedbackProvider";

export type SettingsWorkbenchPreferences = {
  contextWidth: number;
  onContextWidthChange: (width: number) => void;
};

export function SettingsPanel({
  view,
  workbench,
}: {
  view: SettingsViewModel;
  workbench: SettingsWorkbenchPreferences;
}) {
  const feedback = useFeedback();
  const [repositoryId, setRepositoryId] = useState("");
  const [repositoryName, setRepositoryName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);

    try {
      await view.createRepository({
        id: repositoryId.trim(),
        name: repositoryName.trim(),
      });
      setRepositoryId("");
      setRepositoryName("");
    } catch (error) {
      feedback.notifyError(error);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Panel className="settings-panel" aria-label="设置">
      <PanelHeader
        title="设置"
        actions={
          <>
            {view.hasSaveConflict ? (
              <Button
                onClick={() => {
                  void feedback.runAction(
                    view.discardPendingChangesAndReload,
                  );
                }}
                type="button"
                variant="secondary"
              >
                <Undo2 aria-hidden="true" size={13} />
                放弃本地修改并重新加载
              </Button>
            ) : null}
            <Button
              onClick={() => {
                void feedback.runAction(view.reload);
              }}
              type="button"
              variant="secondary"
            >
              <RefreshCw aria-hidden="true" size={13} />
              刷新
            </Button>
          </>
        }
      />
      <PanelBody scroll>
        <Section title="仓库">
          <div className="settings-control-row">
            <label htmlFor="settings-repository-select">当前仓库</label>
            <select
              className="ui-input"
              id="settings-repository-select"
              onChange={(event) => {
                void view.selectRepository(event.target.value).catch(
                  feedback.notifyError,
                );
              }}
              value={view.activeRepositoryId}
            >
              {view.repositories.map((repository) => (
                <option key={repository.id} value={repository.id}>
                  {repository.label} ({repository.id})
                </option>
              ))}
            </select>
          </div>
          <dl className="settings-grid">
            <div>
              <dt>存储</dt>
              <dd>{view.storageLabel}</dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>{view.persistenceStatusLabel}</dd>
            </div>
            <div>
              <dt>路径</dt>
              <dd>{view.locationLabel}</dd>
            </div>
          </dl>
          <form className="settings-create-repository" onSubmit={handleCreate}>
            <input
              aria-label="新仓库 ID"
              autoComplete="off"
              className="ui-input"
              disabled={creating}
              maxLength={64}
              onChange={(event) => setRepositoryId(event.target.value)}
              pattern="[A-Za-z0-9][-A-Za-z0-9._]{0,63}"
              placeholder="仓库 ID"
              required
              value={repositoryId}
            />
            <input
              aria-label="新仓库名称"
              autoComplete="off"
              className="ui-input"
              disabled={creating}
              maxLength={80}
              onChange={(event) => setRepositoryName(event.target.value)}
              placeholder="名称"
              required
              value={repositoryName}
            />
            <Button
              aria-label="创建仓库"
              disabled={creating}
              title="创建仓库"
              type="submit"
              variant="icon"
            >
              <Plus aria-hidden="true" size={14} />
            </Button>
          </form>
        </Section>
        <Section title="工作台">
          <div className="settings-control-row">
            <label htmlFor="settings-context-width">左侧栏宽度</label>
            <input
              className="ui-input settings-width-input"
              id="settings-context-width"
              max={420}
              min={220}
              onChange={(event) => {
                const width = event.currentTarget.valueAsNumber;

                if (Number.isFinite(width)) {
                  workbench.onContextWidthChange(width);
                }
              }}
              step={1}
              type="number"
              value={workbench.contextWidth}
            />
            <span>px</span>
          </div>
        </Section>
      </PanelBody>
    </Panel>
  );
}
