import { type CSSProperties, useState } from "react";
import {
  ChevronRight,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import type { UiOutlineNode } from "../../../application/workspace/projection/viewBlocks";
import {
  UiButton,
  UiMetrics,
  UiPanel,
  UiPanelHeader,
} from "../../shared/primitives";
import { NoteOutlineTree } from "./NoteOutlineTree";

const outlineZoomMin = 0.8;
const outlineZoomMax = 1.3;
const outlineZoomStep = 0.1;
const outlineZoomDefault = 1;

type OutlineBodyStyle = CSSProperties & {
  [key: `--${string}`]: string;
};

function toScaledPx(baseValue: number, zoom: number) {
  return `${(baseValue * zoom).toFixed(1)}px`;
}

function createOutlineBodyStyle(outlineZoom: number): OutlineBodyStyle {
  return {
    "--outline-font-size": toScaledPx(12, outlineZoom),
    "--outline-list-indent": toScaledPx(13, outlineZoom),
    "--outline-row-min-height": toScaledPx(26, outlineZoom),
    "--outline-row-radius": toScaledPx(5, outlineZoom),
    "--outline-toggle-column-width": toScaledPx(18, outlineZoom),
    "--outline-toggle-height": toScaledPx(24, outlineZoom),
    "--outline-toggle-icon-size": toScaledPx(13, outlineZoom),
    "--outline-main-gap": toScaledPx(6, outlineZoom),
    "--outline-main-min-height": toScaledPx(26, outlineZoom),
    "--outline-main-compact-min-height": toScaledPx(24, outlineZoom),
    "--outline-main-padding-block": toScaledPx(3, outlineZoom),
    "--outline-main-padding-inline": toScaledPx(5, outlineZoom),
    "--outline-main-compact-padding-start": toScaledPx(3, outlineZoom),
  };
}

export function NoteOutlinePanel({
  nodes,
  onCollapseDetail,
  onSelectLine,
  stats,
}: {
  nodes: UiOutlineNode[];
  onCollapseDetail?: () => void;
  onSelectLine: (lineNumber: number) => void;
  stats: {
    diagnosticCount: number;
    lineCount: number;
    rootCount: number;
    totalBlocks: number;
  };
}) {
  const [outlineZoom, setOutlineZoom] = useState(outlineZoomDefault);
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const changeOutlineZoom = (delta: number) => {
    setOutlineZoom((current) =>
      Math.min(
        outlineZoomMax,
        Math.max(outlineZoomMin, Number((current + delta).toFixed(2))),
      ),
    );
  };
  const outlineZoomPercent = Math.round(outlineZoom * 100);
  const outlineBodyStyle = createOutlineBodyStyle(outlineZoom);
  const toggleNode = (nodeId: string) => {
    setCollapsedNodeIds((current) => {
      const next = new Set(current);

      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }

      return next;
    });
  };

  return (
    <UiPanel
      as="aside"
      className="note-outline-panel"
      aria-label="笔记结构预览"
      variant="outline"
    >
      <UiPanelHeader
        className="ui-panel-header-stacked"
        leadingActions={
          onCollapseDetail ? (
            <UiButton
              aria-label="收回右侧栏"
              className="detail-header-collapse-button"
              onClick={onCollapseDetail}
              title="收回右侧栏"
              type="button"
              variant="icon"
            >
              <ChevronRight aria-hidden="true" size={15} strokeWidth={2} />
            </UiButton>
          ) : null
        }
        title="笔记结构"
      />

      <UiMetrics
        aria-label="笔记统计"
        items={[
          { label: "行", value: stats.lineCount },
          { label: "个块", value: stats.totalBlocks },
          { label: "个根节点", value: stats.rootCount },
          { label: "个诊断", value: stats.diagnosticCount },
        ]}
      />

      <div className="outline-structure-area">
        <div className="outline-zoom-controls" aria-label="笔记结构树缩放">
          <UiButton
            aria-label="缩小笔记结构树"
            className="outline-icon-button"
            disabled={outlineZoom <= outlineZoomMin}
            onClick={() => changeOutlineZoom(-outlineZoomStep)}
            title="缩小笔记结构树"
            type="button"
            variant="icon"
          >
            <Minus aria-hidden="true" size={12} strokeWidth={1.8} />
          </UiButton>
          <span className="outline-zoom-value">{outlineZoomPercent}%</span>
          <UiButton
            aria-label="放大笔记结构树"
            className="outline-icon-button"
            disabled={outlineZoom >= outlineZoomMax}
            onClick={() => changeOutlineZoom(outlineZoomStep)}
            title="放大笔记结构树"
            type="button"
            variant="icon"
          >
            <Plus aria-hidden="true" size={12} strokeWidth={1.8} />
          </UiButton>
          <UiButton
            aria-label="重置笔记结构树缩放"
            className="outline-icon-button"
            disabled={outlineZoom === outlineZoomDefault}
            onClick={() => setOutlineZoom(outlineZoomDefault)}
            title="重置笔记结构树缩放"
            type="button"
            variant="icon"
          >
            <RotateCcw aria-hidden="true" size={12} strokeWidth={1.8} />
          </UiButton>
        </div>

        <div className="outline-body" style={outlineBodyStyle}>
          {nodes.length > 0 ? (
            <NoteOutlineTree
              collapsedNodeIds={collapsedNodeIds}
              nodes={nodes}
              onSelectLine={onSelectLine}
              onToggleNode={toggleNode}
            />
          ) : (
            <p className="empty-outline">没有可解析的结构</p>
          )}
        </div>
      </div>
    </UiPanel>
  );
}
