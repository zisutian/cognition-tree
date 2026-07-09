import {
  CircleHelp,
  ChevronRight,
  FileInput,
  FileOutput,
  Hash,
  RotateCcw,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { UiVisualizationViewModel } from "../../../application/workspace/projection/viewGraph";
import type { ViewModel } from "../../../application/workspace/view-model/useViewModel";
import {
  Button,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
  SegmentedControl,
  SymbolSlot,
} from "../../shared/primitives";
import { ReferenceGraphCanvas } from "./ReferenceGraphCanvas";
import {
  createVisibleReferenceGraph,
  type ReferenceGraphLocalDepth,
  type ReferenceGraphMode,
} from "./referenceGraphView";

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
      description: "创建笔记后会在这里显示引用图谱。",
      title: "没有笔记",
    };
  }

  if (mode === "local" && !hasActiveNote) {
    return {
      description: "选择一个笔记后显示它周围的引用关系。",
      title: "未选择笔记",
    };
  }

  if (query.trim()) {
    return {
      description: "当前标题搜索没有匹配节点。",
      title: "没有匹配节点",
    };
  }

  if (hideIsolated) {
    return {
      description: "过滤条件隐藏了全部孤立节点。",
      title: "没有可显示节点",
    };
  }

  return {
    description: "当前图谱没有可显示的引用关系。",
    title: "没有可显示节点",
  };
}

export function VisualizationPanel({ view }: { view: ViewModel }) {
  const [mode, setMode] = useState<ReferenceGraphMode>("global");
  const [localDepth, setLocalDepth] = useState<ReferenceGraphLocalDepth>(1);
  const [query, setQuery] = useState("");
  const [hideIsolated, setHideIsolated] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const visualization = view.visualization;
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
    <Panel className="visualization-panel" aria-label="可视化">
      <PanelHeader title="引用图谱" />
      <PanelBody className="graph-body">
        <div className="graph-toolbar" aria-label="图谱控制">
          <SegmentedControl
            ariaLabel="图谱范围"
            options={[
              { label: "全库", value: "global" },
              { label: "局部", value: "local" },
            ]}
            value={mode}
            onChange={setMode}
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
                setLocalDepth(Number(nextDepth) as ReferenceGraphLocalDepth)
              }
            />
          ) : null}
          <button
            aria-pressed={hideIsolated}
            className={hideIsolated ? "graph-toggle is-active" : "graph-toggle"}
            onClick={() => setHideIsolated((current) => !current)}
            type="button"
          >
            隐藏孤立点
          </button>
          <Button
            aria-label="重置图谱视图"
            onClick={() => setResetSignal((current) => current + 1)}
            title="重置图谱视图"
            type="button"
            variant="icon"
          >
            <RotateCcw aria-hidden="true" size={14} />
          </Button>
          <div className="graph-search-field">
            <input
              aria-label="搜索笔记标题"
              placeholder="笔记标题"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        <div className="graph-canvas">
          {visibleGraph.nodes.length > 0 ? (
            <ReferenceGraphCanvas
              graph={visibleGraph}
              resetSignal={resetSignal}
              selectedNoteId={visualization.activeNoteId}
              onSelectNote={visualization.onSelectNote}
            />
          ) : (
            <EmptyState
              description={emptyMessage.description}
              title={emptyMessage.title}
            />
          )}
        </div>
      </PanelBody>
    </Panel>
  );
}

export function VisualizationDetailPanel({
  onCollapseDetail,
  view,
}: {
  onCollapseDetail: () => void;
  view: ViewModel;
}) {
  const visualization: UiVisualizationViewModel = view.visualization;
  const graph = visualization.graph;
  const activeNode = visualization.activeNoteId
    ? graph.nodes.find((node) => node.id === visualization.activeNoteId) ?? null
    : null;
  const incomingEdges = activeNode
    ? graph.edges.filter((edge) => edge.targetNoteId === activeNode.id)
    : [];
  const outgoingEdges = activeNode
    ? graph.edges.filter((edge) => edge.sourceNoteId === activeNode.id)
    : [];
  const titleById = new Map(graph.nodes.map((node) => [node.id, node.title]));

  return (
    <Panel aria-label="图谱详情" as="aside" tone="detail">
      <PanelHeader
        title="图谱详情"
        actions={
          <Button
            aria-label="收回右侧详情"
            onClick={onCollapseDetail}
            title="收回右侧详情"
            type="button"
            variant="icon"
          >
            <ChevronRight aria-hidden="true" size={14} />
          </Button>
        }
      />
      <PanelBody className="detail-panel-stack" scroll>
        <dl
          aria-label="图谱统计"
          className="detail-summary-strip"
        >
          <div>
            <dd>{graph.stats.nodeCount}</dd>
            <dt>点</dt>
          </div>
          <div>
            <dd>{graph.stats.edgeCount}</dd>
            <dt>边</dt>
          </div>
          <div>
            <dd>{graph.stats.isolatedCount}</dd>
            <dt>孤立</dt>
          </div>
        </dl>
        {activeNode ? (
          <div className="detail-primary-row">
            <p>{activeNode.title}</p>
            <dl className="detail-meta-line" aria-label="当前节点引用">
              <div>
                <dd>{activeNode.referencesIn}</dd>
                <dt>入链</dt>
              </div>
              <div>
                <dd>{activeNode.referencesOut}</dd>
                <dt>出链</dt>
              </div>
            </dl>
          </div>
        ) : (
          <p className="ui-muted">选择图中的笔记节点查看详情。</p>
        )}
        <div aria-hidden="true" className="detail-divider" />
        {incomingEdges.length + outgoingEdges.length > 0 ? (
          <ul aria-label="邻接关系" className="detail-line-list">
            {incomingEdges.slice(0, 8).map((edge) => (
              <li key={`in-${edge.id}`}>
                <div className="detail-line-row">
                  <SymbolSlot
                    aria-hidden="true"
                    className="detail-line-marker"
                    tone="muted"
                  >
                    <FileInput aria-hidden="true" size={13} strokeWidth={2} />
                  </SymbolSlot>
                  <span className="detail-line-main">
                    {titleById.get(edge.sourceNoteId) ?? edge.sourceNoteId}
                  </span>
                  <span className="detail-line-meta">× {edge.count}</span>
                </div>
              </li>
            ))}
            {outgoingEdges.slice(0, 8).map((edge) => (
              <li key={`out-${edge.id}`}>
                <div className="detail-line-row">
                  <SymbolSlot
                    aria-hidden="true"
                    className="detail-line-marker"
                    tone="muted"
                  >
                    <FileOutput aria-hidden="true" size={13} strokeWidth={2} />
                  </SymbolSlot>
                  <span className="detail-line-main">{edge.targetTitle}</span>
                  <span className="detail-line-meta">× {edge.count}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ui-muted">这个节点暂无引用关系。</p>
        )}
        <div aria-hidden="true" className="detail-divider" />
        {graph.mostReferencedNodes.length > 0 ? (
          <ul aria-label="引用排名" className="detail-line-list">
            {graph.mostReferencedNodes.map((node) => (
              <li key={node.id}>
                <button
                  className="detail-line-row detail-line-button"
                  type="button"
                  onClick={() => visualization.onSelectNote(node.id)}
                >
                  <SymbolSlot
                    aria-hidden="true"
                    className="detail-line-marker"
                    tone="muted"
                  >
                    <Hash aria-hidden="true" size={13} strokeWidth={2} />
                  </SymbolSlot>
                  <span className="detail-line-main">{node.title}</span>
                  <span className="detail-line-meta">{node.totalReferences}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ui-muted">暂无引用关系。</p>
        )}
        <div aria-hidden="true" className="detail-divider" />
        {graph.unresolvedReferences.length > 0 ? (
          <ul aria-label="未解析引用" className="detail-line-list">
            {graph.unresolvedReferences.slice(0, 24).map((reference) => (
              <li key={`${reference.sourceNoteId}-${reference.targetText}`}>
                <div className="detail-line-row">
                  <SymbolSlot
                    aria-hidden="true"
                    className="detail-line-marker"
                    tone="muted"
                  >
                    <CircleHelp aria-hidden="true" size={13} strokeWidth={2} />
                  </SymbolSlot>
                  <span className="detail-line-main">{reference.sourceTitle}</span>
                  <span className="detail-line-meta">
                    {reference.targetText}
                    {reference.count > 1 ? ` × ${reference.count}` : ""}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ui-muted">没有需要处理的引用问题。</p>
        )}
      </PanelBody>
    </Panel>
  );
}
