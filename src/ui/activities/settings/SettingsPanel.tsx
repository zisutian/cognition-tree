import { RefreshCw } from "lucide-react";
import type { ViewModel } from "../../../application/workspace/view-model/useViewModel";
import {
  Button,
  Panel,
  PanelBody,
  PanelHeader,
  Section,
} from "../../shared/primitives";

export function SettingsPanel({ view }: { view: ViewModel }) {
  const changeRepositoryPath = () => {
    if (!view.canChangeRepositoryPath) {
      return;
    }

    const nextPath = window.prompt("仓库文件夹路径", view.sidebar.repositoryPath);

    if (nextPath) {
      void view.changeRepositoryPath(nextPath);
    }
  };

  return (
    <Panel className="settings-panel" aria-label="设置">
      <PanelHeader
        title="设置"
        actions={
          <>
            <Button onClick={() => void view.reload()} type="button" variant="secondary">
              <RefreshCw aria-hidden="true" size={13} />
              刷新
            </Button>
            {view.canChangeRepositoryPath ? (
              <Button onClick={changeRepositoryPath} type="button" variant="secondary">
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
              <dd>{view.sidebar.storageLabel}</dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>{view.sidebar.saveStatusLabel}</dd>
            </div>
            <div>
              <dt>路径</dt>
              <dd>{view.sidebar.repositoryPath || "加载中"}</dd>
            </div>
          </dl>
        </Section>
      </PanelBody>
    </Panel>
  );
}
