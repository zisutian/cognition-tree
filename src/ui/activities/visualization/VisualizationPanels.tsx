import {
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { UiVisualizationViewModel } from "../../../application/workspace/projection/viewGraph";
import type { ViewModel } from "../../../application/workspace/view-model/useViewModel";
import {
  Button,
  EmptyState,
  Field,
  Metrics,
  Panel,
  PanelBody,
  PanelHeader,
  Section,
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
      <PanelHeader
        title="引用图谱"
        actions={
          <Metrics
            items={[
              { label: "点", value: visualization.graph.stats.nodeCount },
              { label: "边", value: visualization.graph.stats.edgeCount },
              { label: "孤立", value: visualization.graph.stats.isolatedCount },
            ]}
          />
        }
      />
      <PanelBody className="graph-body">
        <div className="graph-toolbar" aria-label="图谱控制">
          <div className="graph-segments" aria-label="图谱范围" role="group">
            <Button
              className={mode === "global" ? "is-active" : undefined}
              onClick={() => setMode("global")}
              type="button"
            >
              全库
            </Button>
            <Button
              className={mode === "local" ? "is-active" : undefined}
              onClick={() => setMode("local")}
              type="button"
            >
              局部
            </Button>
          </div>
          {mode === "local" ? (
            <div className="graph-segments" aria-label="局部图谱深度" role="group">
              <Button
                className={localDepth === 1 ? "is-active" : undefined}
                onClick={() => setLocalDepth(1)}
                type="button"
              >
                1 层
              </Button>
              <Button
                className={localDepth === 2 ? "is-active" : undefined}
                onClick={() => setLocalDepth(2)}
                type="button"
              >
                2 层
              </Button>
            </div>
          ) : null}
          <Field className="graph-search-field" label="搜索">
            <input
              placeholder="笔记标题"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </Field>
          <label className="graph-toggle">
            <input
              checked={hideIsolated}
              type="checkbox"
              onChange={(event) => setHideIsolated(event.target.checked)}
            />
            <span>隐藏孤立点</span>
          </label>
          <Button
            onClick={() => setResetSignal((current) => current + 1)}
            title="重置图谱视图"
            type="button"
          >
            <RotateCcw aria-hidden="true" size={14} />
            重置
          </Button>
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
      <PanelBody>
        <Metrics
          aria-label="图谱统计"
          items={[
            { label: "点", value: graph.stats.nodeCount },
            { label: "边", value: graph.stats.edgeCount },
            { label: "孤立", value: graph.stats.isolatedCount },
          ]}
        />
        <Section title="当前节点">
          {activeNode ? (
            <dl className="detail-list">
              <div>
                <dt>标题</dt>
                <dd>{activeNode.title}</dd>
              </div>
              <div>
                <dt>入链</dt>
                <dd>{activeNode.referencesIn}</dd>
              </div>
              <div>
                <dt>出链</dt>
                <dd>{activeNode.referencesOut}</dd>
              </div>
            </dl>
          ) : (
            <p className="ui-muted">选择图中的笔记节点查看详情。</p>
          )}
        </Section>
        <Section title="邻接关系">
          {incomingEdges.length + outgoingEdges.length > 0 ? (
            <ul className="dense-list">
              {incomingEdges.slice(0, 8).map((edge) => (
                <li key={`in-${edge.id}`}>
                  <span>{titleById.get(edge.sourceNoteId) ?? edge.sourceNoteId}</span>
                  <small>引用此笔记 × {edge.count}</small>
                </li>
              ))}
              {outgoingEdges.slice(0, 8).map((edge) => (
                <li key={`out-${edge.id}`}>
                  <span>{edge.targetTitle}</span>
                  <small>被此笔记引用 × {edge.count}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ui-muted">这个节点暂无引用关系。</p>
          )}
        </Section>
        <Section title="引用排名">
          {graph.mostReferencedNodes.length > 0 ? (
            <ul className="dense-list">
              {graph.mostReferencedNodes.map((node) => (
                <li key={node.id}>
                  <button
                    type="button"
                    onClick={() => visualization.onSelectNote(node.id)}
                  >
                    {node.title}
                    <span>{node.totalReferences}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ui-muted">暂无引用关系。</p>
          )}
        </Section>
        <Section title="未解析引用">
          {graph.unresolvedReferences.length > 0 ? (
            <ul className="dense-list">
              {graph.unresolvedReferences.slice(0, 24).map((reference) => (
                <li key={`${reference.sourceNoteId}-${reference.targetText}`}>
                  <span>{reference.sourceTitle}</span>
                  <strong>?</strong>
                  <span>{reference.targetText}</span>
                  {reference.count > 1 ? <small>× {reference.count}</small> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="ui-muted">没有需要处理的引用问题。</p>
          )}
        </Section>
      </PanelBody>
    </Panel>
  );
}
