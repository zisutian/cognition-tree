import { RefreshCw, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { SettingsViewModel } from "../../../application/workspace/view-model/activityViewModels";
import {
  Button,
  Panel,
  PanelBody,
  PanelHeader,
  Section,
} from "../../shared/primitives";

export function SettingsPanel({ view }: { view: SettingsViewModel }) {
  const [editingPath, setEditingPath] = useState(false);
  const [repositoryPath, setRepositoryPath] = useState(view.repositoryPath);

  useEffect(() => {
    if (!editingPath) {
      setRepositoryPath(view.repositoryPath);
    }
  }, [editingPath, view.repositoryPath]);

  const changeRepositoryPath = async () => {
    const nextPath = repositoryPath.trim();

    if (!view.canChangeRepositoryPath || !nextPath) {
      return;
    }

    await view.changeRepositoryPath(nextPath);
    setEditingPath(false);
  };

  return (
    <Panel className="settings-panel" aria-label="设置">
      <PanelHeader
        title="设置"
        actions={
          <>
            {view.hasSaveConflict ? (
              <Button
                onClick={() => void view.discardPendingChangesAndReload()}
                type="button"
                variant="secondary"
              >
                <Undo2 aria-hidden="true" size={13} />
                放弃本地修改并重新加载
              </Button>
            ) : null}
            <Button onClick={() => void view.reload()} type="button" variant="secondary">
              <RefreshCw aria-hidden="true" size={13} />
              刷新
            </Button>
            {view.canChangeRepositoryPath ? (
              <Button onClick={() => setEditingPath(true)} type="button" variant="secondary">
                更改仓库
              </Button>
            ) : null}
          </>
        }
      />
      <PanelBody scroll>
        <Section title="仓库">
          <dl className="settings-grid">
            <div>
              <dt>存储</dt>
              <dd>{view.storageLabel}</dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>{view.saveStatusLabel}</dd>
            </div>
            <div>
              <dt>路径</dt>
              <dd>
                {editingPath ? (
                  <form
                    className="settings-path-editor"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void changeRepositoryPath();
                    }}
                  >
                    <input
                      autoFocus
                      aria-label="仓库文件夹路径"
                      value={repositoryPath}
                      onChange={(event) => setRepositoryPath(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          setEditingPath(false);
                        }
                      }}
                    />
                    <Button type="submit" variant="secondary">应用</Button>
                    <Button onClick={() => setEditingPath(false)} type="button" variant="ghost">取消</Button>
                  </form>
                ) : (
                  view.repositoryPath || "加载中"
                )}
              </dd>
            </div>
          </dl>
        </Section>
      </PanelBody>
    </Panel>
  );
}
