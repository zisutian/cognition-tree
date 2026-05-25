import type { OutlineNode } from "../ctn/parseOutline";

export function NoteOutlineTree({
  nodes,
  onSelectLine,
  depth = 0,
}: {
  nodes: OutlineNode[];
  onSelectLine: (lineNumber: number) => void;
  depth?: number;
}) {
  return (
    <ul className="outline-list" data-depth={depth}>
      {nodes.map((node) => (
        <li key={node.id}>
          <button
            className={
              node.diagnostics.length > 0
                ? "outline-node has-diagnostics"
                : "outline-node"
            }
            onClick={() => onSelectLine(node.lineNumber)}
            type="button"
          >
            <span className="node-marker">{node.marker ?? "·"}</span>
            <div className="node-main">
              <span className="node-kind">{node.label}</span>
              <span className="node-text">{node.text}</span>
            </div>
            <span className="node-meta">
              <span>层 {node.level + 1}</span>
            </span>
          </button>
          {node.children.length > 0 ? (
            <NoteOutlineTree
              nodes={node.children}
              onSelectLine={onSelectLine}
              depth={depth + 1}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
