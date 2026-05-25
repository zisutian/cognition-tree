import { type CSSProperties, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import type { OutlineNode } from "../ctn/parseOutline";
import { OutlineTree } from "./OutlineTree";

const outlineZoomMin = 0.85;
const outlineZoomMax = 1.3;
const outlineZoomStep = 0.1;
const outlineZoomDefault = 1;

export function OutlinePanel({
  diagnosticsCount,
  nodes,
  onSelectLine,
  totalBlocks,
}: {
  diagnosticsCount: number;
  nodes: OutlineNode[];
  onSelectLine: (lineNumber: number) => void;
  totalBlocks: number;
}) {
  const [outlineZoom, setOutlineZoom] = useState(outlineZoomDefault);
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
    "--outline-font-size": `${(13 * outlineZoom).toFixed(1)}px`,
  } as CSSProperties;

  return (
    <aside className="outline-panel" aria-label="结构预览">
      <header className="panel-header compact">
        <div>
          <p className="eyebrow">Outline</p>
          <h2>结构</h2>
        </div>
        <div className="outline-header-actions">
          <div className="outline-zoom-controls" aria-label="结构树缩放">
            <button
              aria-label="缩小结构树"
              className="outline-icon-button"
              disabled={outlineZoom <= outlineZoomMin}
              onClick={() => changeOutlineZoom(-outlineZoomStep)}
              title="缩小结构树"
              type="button"
            >
              <Minus aria-hidden="true" size={14} strokeWidth={2} />
            </button>
            <span className="outline-zoom-value">{outlineZoomPercent}%</span>
            <button
              aria-label="放大结构树"
              className="outline-icon-button"
              disabled={outlineZoom >= outlineZoomMax}
              onClick={() => changeOutlineZoom(outlineZoomStep)}
              title="放大结构树"
              type="button"
            >
              <Plus aria-hidden="true" size={14} strokeWidth={2} />
            </button>
            <button
              aria-label="重置结构树缩放"
              className="outline-icon-button"
              disabled={outlineZoom === outlineZoomDefault}
              onClick={() => setOutlineZoom(outlineZoomDefault)}
              title="重置结构树缩放"
              type="button"
            >
              <RotateCcw aria-hidden="true" size={14} strokeWidth={2} />
            </button>
          </div>
          <div className="stats compact-stats">
            <span>{totalBlocks} 块</span>
            <span>{diagnosticsCount} 诊断</span>
          </div>
        </div>
      </header>

      <div className="outline-body" style={outlineBodyStyle}>
        {nodes.length > 0 ? (
          <OutlineTree nodes={nodes} onSelectLine={onSelectLine} />
        ) : (
          <p className="empty-outline">没有可解析的结构</p>
        )}
      </div>
    </aside>
  );
}
