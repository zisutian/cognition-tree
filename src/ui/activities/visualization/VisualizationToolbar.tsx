import { RotateCcw } from "lucide-react";
import {
  Button,
  SegmentedControl,
  ToggleButton,
} from "../../shared/primitives";
import type {
  ReferenceGraphLocalDepth,
  ReferenceGraphMode,
} from "../../../application/workspace/view-model/activityViewModels";

export function VisualizationToolbar({
  hideIsolated,
  localDepth,
  mode,
  query,
  onHideIsolatedChange,
  onLocalDepthChange,
  onModeChange,
  onQueryChange,
  onReset,
}: {
  hideIsolated: boolean;
  localDepth: ReferenceGraphLocalDepth;
  mode: ReferenceGraphMode;
  query: string;
  onHideIsolatedChange: (hideIsolated: boolean) => void;
  onLocalDepthChange: (localDepth: ReferenceGraphLocalDepth) => void;
  onModeChange: (mode: ReferenceGraphMode) => void;
  onQueryChange: (query: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="graph-toolbar" aria-label="图谱控制">
      <SegmentedControl
        ariaLabel="图谱范围"
        options={[
          { label: "全库", value: "global" },
          { label: "局部", value: "local" },
        ]}
        value={mode}
        onChange={onModeChange}
      />
      {mode === "local" ? (
        <SegmentedControl
          ariaLabel="局部图谱深度"
          options={[
            { label: "1 层", value: "1" },
            { label: "2 层", value: "2" },
          ]}
          value={String(localDepth)}
          onChange={(nextDepth) =>
            onLocalDepthChange(Number(nextDepth) as ReferenceGraphLocalDepth)
          }
        />
      ) : null}
      <ToggleButton
        onClick={() => onHideIsolatedChange(!hideIsolated)}
        pressed={hideIsolated}
      >
        隐藏孤立点
      </ToggleButton>
      <Button
        aria-label="重置图谱视图"
        onClick={onReset}
        title="重置图谱视图"
        type="button"
        variant="icon"
      >
        <RotateCcw aria-hidden="true" size={14} />
      </Button>
      <div className="graph-search-field">
        <input
          aria-label="搜索笔记标题"
          className="ui-input"
          placeholder="笔记标题"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>
    </div>
  );
}
