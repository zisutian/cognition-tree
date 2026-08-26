// SPDX-License-Identifier: GPL-3.0-or-later

import {
  Panel,
  PanelBody,
  PanelHeader,
} from "../../ui/shared/primitives";
import { FieldRow, FormLayout } from "../../ui/shared/FormLayout";

export type SettingsWorkbenchPreferences = {
  contextWidth: number;
  onContextWidthChange: (width: number) => void;
};

export function InterfaceSettingsPanel({
  workbench,
}: {
  workbench: SettingsWorkbenchPreferences;
}) {
  return (
    <Panel aria-label="设置" className="settings-panel">
      <PanelHeader title="界面" />
      <PanelBody scroll>
        <div className="settings-content-column">
          <FormLayout>
            <FieldRow
              description="范围 220–420 px。"
              fieldId="settings-context-width"
              label="左侧栏宽度"
            >
              {(accessibility) => (
                <input
                  {...accessibility}
                  className="ui-input settings-width-input"
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
              )}
            </FieldRow>
          </FormLayout>
        </div>
      </PanelBody>
    </Panel>
  );
}
