import { Settings2 } from "lucide-react";
import { useId } from "react";
import {
  Button,
  FieldRow,
  FormLayout,
  Section,
  SectionStack,
  Popover,
  RangeControl,
  ToggleButton,
} from "../../../ui/index.ts";

import type { ReferenceGraphSettings } from "./referenceGraphSettings.ts";

function GraphRangeSetting({
  label,
  maximum,
  minimum,
  step,
  suffix = "",
  value,
  onChange,
}: {
  label: string;
  maximum: number;
  minimum: number;
  step: number;
  suffix?: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const inputId = useId();
  const precision = step < 0.1 ? 2 : step < 1 ? 1 : 0;
  return (
    <FieldRow fieldId={inputId} label={label}>
      {(accessibility) => (
        <RangeControl
          {...accessibility}
          aria-label={label}
          max={maximum}
          min={minimum}
          step={step}
          value={value}
          valueLabel={`${value.toFixed(precision)}${suffix}`}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      )}
    </FieldRow>
  );
}

function GraphToggleSetting({
  ariaLabel,
  label,
  value,
  onChange,
}: {
  ariaLabel: string;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const inputId = useId();
  return (
    <FieldRow fieldId={inputId} label={label}>
      {(accessibility) => (
        <ToggleButton
          {...accessibility}
          aria-label={ariaLabel}
          onClick={() => onChange(!value)}
          pressed={value}
        >
          {value ? "显示" : "隐藏"}
        </ToggleButton>
      )}
    </FieldRow>
  );
}

export function VisualizationGraphSettings({
  settings,
  onChange,
  onReset,
}: {
  settings: ReferenceGraphSettings;
  onChange: (settings: ReferenceGraphSettings) => void;
  onReset: () => void;
}) {
  const updateDisplay = (next: Partial<ReferenceGraphSettings["display"]>) =>
    onChange({
      ...settings,
      display: { ...settings.display, ...next },
    });
  const updateForces = (next: Partial<ReferenceGraphSettings["forces"]>) =>
    onChange({
      ...settings,
      forces: { ...settings.forces, ...next },
    });

  return (
    <Popover
      ariaLabel="图谱设置"
      panelRole="dialog"
      size="regular"
      renderTrigger={({ isOpen, panelId, toggle, triggerRef }) => (
        <Button
          aria-controls={panelId}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-label="图谱设置"
          onClick={toggle}
          ref={triggerRef}
          title="图谱设置"
          type="button"
          variant="secondary"
          sizing="container"
        >
          <Settings2 aria-hidden="true" size={14} />
          图谱设置
        </Button>
      )}
    >
      {() => (
        <SectionStack>
          <Section title="显示">
            <FormLayout layout="compact">
              <GraphToggleSetting
                ariaLabel="显示箭头"
                label="箭头"
                value={settings.display.showArrows}
                onChange={(showArrows) => updateDisplay({ showArrows })}
              />
              <GraphRangeSetting
                label="文字密度"
                maximum={100}
                minimum={0}
                step={5}
                suffix="%"
                value={settings.display.labelDensity}
                onChange={(labelDensity) => updateDisplay({ labelDensity })}
              />
              <GraphRangeSetting
                label="节点大小"
                maximum={2}
                minimum={0.5}
                step={0.1}
                suffix="×"
                value={settings.display.nodeScale}
                onChange={(nodeScale) => updateDisplay({ nodeScale })}
              />
              <GraphRangeSetting
                label="连线粗细"
                maximum={2}
                minimum={0.5}
                step={0.1}
                suffix="×"
                value={settings.display.linkThickness}
                onChange={(linkThickness) => updateDisplay({ linkThickness })}
              />
            </FormLayout>
          </Section>
          <Section title="力导向">
            <FormLayout layout="compact">
              <GraphRangeSetting
                label="中心力"
                maximum={1}
                minimum={0}
                step={0.05}
                value={settings.forces.centerStrength}
                onChange={(centerStrength) => updateForces({ centerStrength })}
              />
              <GraphRangeSetting
                label="排斥力"
                maximum={600}
                minimum={50}
                step={10}
                value={settings.forces.repulsion}
                onChange={(repulsion) => updateForces({ repulsion })}
              />
              <GraphRangeSetting
                label="连接力"
                maximum={1}
                minimum={0.05}
                step={0.05}
                value={settings.forces.linkStrength}
                onChange={(linkStrength) => updateForces({ linkStrength })}
              />
              <GraphRangeSetting
                label="连接距离"
                maximum={220}
                minimum={50}
                step={5}
                suffix=" px"
                value={settings.forces.linkDistance}
                onChange={(linkDistance) => updateForces({ linkDistance })}
              />
            </FormLayout>
          </Section>
          <Button
            onClick={onReset}
            type="button"
            variant="secondary"
            sizing="container"
          >
            恢复默认设置
          </Button>
        </SectionStack>
      )}
    </Popover>
  );
}
