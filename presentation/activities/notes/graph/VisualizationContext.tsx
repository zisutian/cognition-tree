import { RotateCcw } from "lucide-react";
import type {
  ReferenceGraphLocalDepth,
  VisualizationViewModel,
} from "../../../../application/workspace/notes/graph/visualizationViewModel";
import {
  Button,
  SegmentedControl,
  ToggleButton,
} from "../../../ui/shared/primitives";
import { VisualizationGraphSettings } from "./VisualizationGraphSettings";
import type {
  ReferenceGraphSession,
} from "./useReferenceGraphSession";

export function VisualizationContext({
  session,
  view,
}: {
  session: ReferenceGraphSession;
  view: VisualizationViewModel;
}) {
  const { hideIsolated, localDepth, mode, query } = view.filter;

  return (
    <div
      aria-label="图谱控制"
      className="activity-context-content graph-context"
    >
      <label className="graph-context-field">
        <span className="graph-context-label">搜索</span>
        <input
          aria-label="搜索笔记标题"
          className="ui-input"
          placeholder="笔记标题"
          value={query}
          onChange={(event) => view.setQuery(event.target.value)}
        />
      </label>
      <div className="graph-context-field">
        <span className="graph-context-label">范围</span>
        <SegmentedControl
          ariaLabel="图谱范围"
          fill
          options={[
            { label: "全库", value: "global" },
            { label: "局部", value: "local" },
          ]}
          value={mode}
          onChange={view.setMode}
        />
      </div>
      {mode === "local" ? (
        <div className="graph-context-field">
          <span className="graph-context-label">深度</span>
          <SegmentedControl
            ariaLabel="局部图谱深度"
            fill
            options={[
              { label: "1 层", value: "1" },
              { label: "2 层", value: "2" },
            ]}
            value={String(localDepth)}
            onChange={(nextDepth) =>
              view.setLocalDepth(
                Number(nextDepth) as ReferenceGraphLocalDepth,
              )}
          />
        </div>
      ) : null}
      <ToggleButton
        className="graph-context-toggle"
        onClick={() => view.setHideIsolated(!hideIsolated)}
        pressed={hideIsolated}
      >
        隐藏孤立点
      </ToggleButton>
      <div className="graph-context-actions">
        <Button
          aria-label="重置图谱视图"
          onClick={session.resetView}
          title="重置图谱视图"
          type="button"
          variant="secondary"
        >
          <RotateCcw aria-hidden="true" size={14} />
          重置视图
        </Button>
        <VisualizationGraphSettings
          settings={session.settings}
          onChange={session.updateSettings}
          onReset={session.resetSettings}
        />
      </div>
    </div>
  );
}
