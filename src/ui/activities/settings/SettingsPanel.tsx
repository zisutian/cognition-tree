import { PanelLeft } from "lucide-react";
import {
  Panel,
  PanelBody,
  PanelHeader,
} from "../../shared/primitives";

export type SettingsWorkbenchPreferences = {
  contextWidth: number;
  onContextWidthChange: (width: number) => void;
};

export function SettingsContext() {
  return (
    <div className="activity-context-content settings-context">
      <ul className="ui-tree settings-list">
        <li className="ui-tree-row-frame settings-row-frame is-selected">
          <div
            aria-current="page"
            className="ui-tree-row settings-row is-selected"
          >
            <PanelLeft aria-hidden="true" size={13} />
            <span className="ui-tree-text">界面</span>
          </div>
        </li>
      </ul>
    </div>
  );
}

export function SettingsPanel({
  workbench,
}: {
  workbench: SettingsWorkbenchPreferences;
}) {
  return (
    <Panel aria-label="设置" className="settings-panel">
      <PanelHeader title="界面" />
      <PanelBody scroll>
        <div className="settings-content-column">
          <div className="settings-form-row">
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
        </div>
      </PanelBody>
    </Panel>
  );
}
