import { RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import type {
  UiVisualizationViewModel,
} from "../../../application/workspace/projection/viewGraph";
import {
  UiButton,
  UiEmptyState,
  UiField,
  UiPanel,
  UiPanelHeader,
} from "../../shared/primitives";
import { NoteReferenceGraphCanvas } from "./NoteReferenceGraphCanvas";
import {
  createVisibleReferenceGraph,
  type ReferenceGraphLocalDepth,
  type ReferenceGraphMode,
} from "./referenceGraphView";

type NoteReferenceGraphPanelProps = {
  visualization: UiVisualizationViewModel;
};

function getEmptyGraphMessage({
  graphNodeCount,
  hasActiveNote,
  hideIsolated,
  mode,
  query,
}: {
  graphNodeCount: number;
  hasActiveNote: boolean;
  hideIsolated: boolean;
  mode: ReferenceGraphMode;
  query: string;
}) {
  if (graphNodeCount === 0) {
    return {
      description: "创建笔记后会在这里显示点状引用图谱。",
      title: "没有笔记",
    };
  }

  if (mode === "local" && !hasActiveNote) {
    return {
      description: "选择一个笔记后会显示它周围的引用关系。",
      title: "未选择笔记",
    };
  }

  if (query.trim()) {
    return {
      description: "调整搜索内容后重新查看图谱。",
      title: "没有匹配节点",
    };
  }

  if (hideIsolated) {
    return {
      description: "当前过滤条件隐藏了全部孤立节点。",
      title: "没有可显示节点",
    };
  }

  return {
    description: "当前图谱没有可显示的引用关系。",
    title: "没有可显示节点",
  };
}

export function NoteReferenceGraphPanel({
  visualization,
}: NoteReferenceGraphPanelProps) {
  const [mode, setMode] = useState<ReferenceGraphMode>("global");
  const [localDepth, setLocalDepth] =
    useState<ReferenceGraphLocalDepth>(1);
  const [query, setQuery] = useState("");
  const [hideIsolated, setHideIsolated] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const visibleGraph = useMemo(
    () =>
      createVisibleReferenceGraph(visualization.graph, {
        activeNoteId: visualization.activeNoteId,
        hideIsolated,
        localDepth,
        mode,
        query,
      }),
    [hideIsolated, localDepth, mode, query, visualization],
  );
  const emptyMessage = getEmptyGraphMessage({
    graphNodeCount: visualization.graph.nodes.length,
    hasActiveNote: Boolean(visualization.activeNoteId),
    hideIsolated,
    mode,
    query,
  });

  return (
    <UiPanel className="visualization-main-panel" aria-label="可视化" variant="main">
      <UiPanelHeader title="笔记引用图谱" />

      <div className="visualization-toolbar" aria-label="图谱控制">
        <div className="visualization-segmented-control" aria-label="图谱范围" role="group">
          <UiButton
            className={mode === "global" ? "is-active" : undefined}
            onClick={() => setMode("global")}
            type="button"
            variant="secondary"
          >
            全库
          </UiButton>
          <UiButton
            className={mode === "local" ? "is-active" : undefined}
            onClick={() => setMode("local")}
            type="button"
            variant="secondary"
          >
            局部
          </UiButton>
        </div>

        {mode === "local" ? (
          <div
            className="visualization-segmented-control"
            aria-label="局部图谱深度"
            role="group"
          >
            <UiButton
              className={localDepth === 1 ? "is-active" : undefined}
              onClick={() => setLocalDepth(1)}
              type="button"
              variant="secondary"
            >
              1 层
            </UiButton>
            <UiButton
              className={localDepth === 2 ? "is-active" : undefined}
              onClick={() => setLocalDepth(2)}
              type="button"
              variant="secondary"
            >
              2 层
            </UiButton>
          </div>
        ) : null}

        <UiField className="visualization-search-field" label="搜索">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="笔记标题"
          />
        </UiField>

        <label className="visualization-toggle">
          <input
            checked={hideIsolated}
            type="checkbox"
            onChange={(event) => setHideIsolated(event.target.checked)}
          />
          <span>隐藏孤立点</span>
        </label>

        <UiButton
          className="visualization-reset-button"
          onClick={() => setResetSignal((current) => current + 1)}
          type="button"
          variant="secondary"
        >
          <RotateCcw aria-hidden="true" size={14} strokeWidth={2} />
          重置视图
        </UiButton>
      </div>

      <div className="visualization-graph-surface">
        {visibleGraph.nodes.length > 0 ? (
          <NoteReferenceGraphCanvas
            graph={visibleGraph}
            resetSignal={resetSignal}
            selectedNoteId={visualization.activeNoteId}
            onSelectNote={visualization.onSelectNote}
          />
        ) : (
          <UiEmptyState
            className="visualization-empty-state"
            description={emptyMessage.description}
            fill
            title={emptyMessage.title}
          />
        )}
      </div>
    </UiPanel>
  );
}
