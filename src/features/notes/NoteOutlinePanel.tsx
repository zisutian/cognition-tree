import { type CSSProperties, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import type { OutlineNode } from "../../ctn-parser/parseOutline";
import { NoteOutlineTree } from "./NoteOutlineTree";

const outlineZoomMin = 0.85;
const outlineZoomMax = 1.3;
const outlineZoomStep = 0.1;
const outlineZoomDefault = 1;

export function NoteOutlinePanel({
  nodes,
  onSelectLine,
}: {
  nodes: OutlineNode[];
  onSelectLine: (lineNumber: number) => void;
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
  const outlineBodyStyle = {
    "--outline-font-size": `${(12.5 * outlineZoom).toFixed(1)}px`,
  } as CSSProperties;
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
    <aside className="outline-panel note-outline-panel" aria-label="笔记结构预览">
      <header className="panel-header">
        <div>
          <h2>笔记结构</h2>
        </div>
        <div className="outline-zoom-controls" aria-label="笔记结构树缩放">
          <button
            aria-label="缩小笔记结构树"
            className="outline-icon-button"
            disabled={outlineZoom <= outlineZoomMin}
            onClick={() => changeOutlineZoom(-outlineZoomStep)}
            title="缩小笔记结构树"
            type="button"
          >
            <Minus aria-hidden="true" size={14} strokeWidth={2} />
          </button>
          <span className="outline-zoom-value">{outlineZoomPercent}%</span>
          <button
            aria-label="放大笔记结构树"
            className="outline-icon-button"
            disabled={outlineZoom >= outlineZoomMax}
            onClick={() => changeOutlineZoom(outlineZoomStep)}
            title="放大笔记结构树"
            type="button"
          >
            <Plus aria-hidden="true" size={14} strokeWidth={2} />
          </button>
          <button
            aria-label="重置笔记结构树缩放"
            className="outline-icon-button"
            disabled={outlineZoom === outlineZoomDefault}
            onClick={() => setOutlineZoom(outlineZoomDefault)}
            title="重置笔记结构树缩放"
            type="button"
          >
            <RotateCcw aria-hidden="true" size={14} strokeWidth={2} />
          </button>
        </div>
      </header>

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
    </aside>
  );
}
