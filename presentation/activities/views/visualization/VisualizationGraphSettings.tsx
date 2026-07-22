import { Settings2 } from "lucide-react";
import { useId } from "react";
import { Popover } from "../../../ui/shared/Popover";
import {
  Button,
  ToggleButton,
} from "../../../ui/shared/primitives";
import type { ReferenceGraphSettings } from "./referenceGraphSettings";

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
    <label className="graph-settings-range" htmlFor={inputId}>
      <span>{label}</span>
      <output>{value.toFixed(precision)}{suffix}</output>
      <input
        aria-label={label}
        id={inputId}
        max={maximum}
        min={minimum}
        step={step}
        type="range"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
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
  const updateDisplay = (
    next: Partial<ReferenceGraphSettings["display"]>,
  ) => onChange({
    ...settings,
    display: { ...settings.display, ...next },
  });
  const updateForces = (
    next: Partial<ReferenceGraphSettings["forces"]>,
  ) => onChange({
    ...settings,
    forces: { ...settings.forces, ...next },
  });

  return (
    <Popover
      ariaLabel="图谱设置"
      className="graph-settings-popover"
      panelClassName="graph-settings-panel"
      panelRole="dialog"
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
          variant="icon"
        >
          <Settings2 aria-hidden="true" size={14} />
        </Button>
      )}
    >
      {() => (
        <div className="graph-settings-content">
          <section className="graph-settings-section">
            <h3>显示</h3>
            <ToggleButton
              onClick={() =>
                updateDisplay({ showArrows: !settings.display.showArrows })
              }
              pressed={settings.display.showArrows}
            >
              显示箭头
            </ToggleButton>
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
              value={settings.display.nodeScale}
              onChange={(nodeScale) => updateDisplay({ nodeScale })}
            />
            <GraphRangeSetting
              label="连线粗细"
              maximum={2}
              minimum={0.5}
              step={0.1}
              value={settings.display.linkThickness}
              onChange={(linkThickness) => updateDisplay({ linkThickness })}
            />
          </section>
          <section className="graph-settings-section">
            <h3>力导向</h3>
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
              suffix="px"
              value={settings.forces.linkDistance}
              onChange={(linkDistance) => updateForces({ linkDistance })}
            />
          </section>
          <Button
            className="graph-settings-reset"
            onClick={onReset}
            type="button"
            variant="secondary"
          >
            恢复默认设置
          </Button>
        </div>
      )}
    </Popover>
  );
}
