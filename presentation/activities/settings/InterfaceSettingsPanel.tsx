// SPDX-License-Identifier: GPL-3.0-or-later

import { FieldRow, FormLayout } from "../../ui/shared/FormLayout";
import { InputControl } from "../../ui/shared/controls";
import {
  ToolPanel,
  ToolPanelBody,
  ToolSection,
} from "../../ui/shared/ToolSurface";

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
    <ToolPanel aria-label="设置" className="settings-panel" title="界面">
      <ToolPanelBody layout="form">
        <ToolSection aria-label="界面选项">
          <FormLayout>
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
