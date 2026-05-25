import type { OutlineNode } from "../../ctn/parseOutline";

type SidebarOutlineSummaryProps = {
  diagnosticsCount: number;
  outline: OutlineNode[];
  totalBlocks: number;
  onSelectLine: (lineNumber: number) => void;
};

export function SidebarOutlineSummary({
  diagnosticsCount,
  outline,
  totalBlocks,
  onSelectLine,
}: SidebarOutlineSummaryProps) {
  return (
    <div className="side-panel-body">
      <section className="side-section">
        <p className="side-section-title">统计</p>
        <div className="side-metrics">
          <div className="side-metric">
            <span>根</span>
            <strong>{outline.length}</strong>
          </div>
          <div className="side-metric">
            <span>块</span>
            <strong>{totalBlocks}</strong>
          </div>
          <div className="side-metric">
            <span>诊断</span>
            <strong>{diagnosticsCount}</strong>
          </div>
        </div>
      </section>

      <section className="side-section">
        <p className="side-section-title">根节点</p>
        <div className="side-entry-list">
          {outline.length > 0 ? (
            outline.slice(0, 6).map((node) => (
              <button
                className="side-entry"
                key={node.id}
                onClick={() => onSelectLine(node.lineNumber)}
                type="button"
              >
                {node.text}
              </button>
            ))
          ) : (
            <p className="side-muted">空</p>
          )}
        </div>
      </section>
    </div>
  );
}
