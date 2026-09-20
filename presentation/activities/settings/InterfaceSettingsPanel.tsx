// SPDX-License-Identifier: GPL-3.0-or-later

import {
  designMetrics,
  FieldRow,
  FormLayout,
  InputControl,
  Page,
  PageBody,
  Section,
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
    <Page aria-label="界面设置">
      <PageBody>
        <Section aria-label="界面选项">
          <FormLayout layout="stacked">
            <FieldRow fieldId="settings-context-width" label="左侧栏宽度">
              {(accessibility) => (
                <InputControl
                  {...accessibility}
                  max={designMetrics.context.max}
                  min={designMetrics.context.min}
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
