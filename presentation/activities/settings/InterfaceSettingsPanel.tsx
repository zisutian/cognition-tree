// SPDX-License-Identifier: GPL-3.0-or-later

import {
  FieldRow,
  FormLayout,
  InputControl,
  ToolPanel,
  ToolPanelBody,
  ToolSection,
} from "../../ui/index.ts";

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
    <ToolPanel
      aria-label="界面设置"
      className="settings-panel"
      title="工作台布局"
    >
      <ToolPanelBody layout="form">
        <ToolSection aria-label="界面选项">
          <FormLayout layout="stacked">
            <FieldRow fieldId="settings-context-width" label="左侧栏宽度">
              {(accessibility) => (
                <InputControl
                  {...accessibility}
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
        </ToolSection>
      </ToolPanelBody>
    </ToolPanel>
  );
}
