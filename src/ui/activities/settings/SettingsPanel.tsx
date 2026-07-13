import { RefreshCw, Undo2 } from "lucide-react";
import type { SettingsViewModel } from "../../../application/workspace/view-model/activityViewModels";
import {
  Button,
  Panel,
  PanelBody,
  PanelHeader,
  Section,
} from "../../shared/primitives";

export function SettingsPanel({ view }: { view: SettingsViewModel }) {
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
              <dd>{view.repositoryPath || "加载中"}</dd>
            </div>
          </dl>
        </Section>
      </PanelBody>
    </Panel>
  );
}
