// SPDX-License-Identifier: GPL-3.0-or-later

import { FieldRow, FormLayout, InputControl, Section } from "compact-ui";

import { uiConfig, Page, PageBody } from "../../ui/index.ts";

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
    <Page aria-label="界面设置">
      <PageBody>
        <Section>
          <FormLayout layout="stacked">
            <FieldRow fieldId="settings-context-width" label="左侧栏宽度">
              {(accessibility) => (
                <InputControl
                  {...accessibility}
                  max={uiConfig.layout.context.max}
                  min={uiConfig.layout.context.min}
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
        </Section>
      </PageBody>
    </Page>
  );
}
