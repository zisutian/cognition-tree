import { useMemo, useState } from "react";
import { parseCtnDocument, type OutlineNode } from "./ctn/parseOutline";
import "./App.css";

const initialDocument = `认知树
  : 可配置语法的认知树笔记
  [?] 如何保持原文不丢失
    [条件] 缩进决定作用域
    [证据] 每一行都保留 rawText
  [理解] 下一步是接入 CodeMirror 6`;

function OutlineTree({
  nodes,
  depth = 0,
}: {
  nodes: OutlineNode[];
  depth?: number;
}) {
  return (
    <ul className="outline-list" data-depth={depth}>
      {nodes.map((node) => (
        <li key={node.id}>
          <div
            className={
              node.diagnostics.length > 0
                ? "outline-node has-diagnostics"
                : "outline-node"
            }
          >
            <span className="node-marker">{node.marker ?? "·"}</span>
            <div className="node-main">
              <span className="node-kind">{node.label}</span>
              <span className="node-text">{node.text}</span>
            </div>
            <span className="node-line">L{node.lineNumber}</span>
          </div>
          {node.children.length > 0 ? (
            <OutlineTree nodes={node.children} depth={depth + 1} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function App() {
  const [documentText, setDocumentText] = useState(initialDocument);
  const parsedDocument = useMemo(
    () => parseCtnDocument(documentText),
    [documentText],
  );
  const outline = parsedDocument.roots;
  const totalBlocks = parsedDocument.blocks.length;
  const lineCount = documentText.split("\n").length;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">认</span>
          <div>
            <h1>认知树</h1>
            <p>本地草稿</p>
          </div>
        </div>

        <nav className="note-list" aria-label="笔记">
          <button className="note-item active" type="button">
            <span>认知树</span>
            <small>{lineCount} 行</small>
          </button>
          <button className="note-item" type="button">
            <span>语法实验</span>
            <small>待整理</small>
          </button>
        </nav>
      </aside>

      <section className="editor-panel" aria-label="原文编辑">
        <header className="panel-header">
          <div>
            <p className="eyebrow">CTN Source</p>
            <h2>认知树</h2>
          </div>
          <div className="stats">
            <span>{lineCount} 行</span>
            <span>{totalBlocks} 个块</span>
            <span>{outline.length} 个根节点</span>
            <span>{parsedDocument.diagnostics.length} 个诊断</span>
          </div>
        </header>

        <textarea
          className="source-editor"
          spellCheck={false}
          value={documentText}
          onChange={(event) => setDocumentText(event.currentTarget.value)}
          aria-label="CTN 原文"
        />

        {parsedDocument.diagnostics.length > 0 ? (
          <section className="diagnostics-panel" aria-label="诊断">
            <h3>诊断</h3>
            <ul>
              {parsedDocument.diagnostics.map((diagnostic) => (
                <li key={diagnostic.id}>
                  <span className="diagnostic-location">
                    L{diagnostic.lineNumber}
                  </span>
                  <span>{diagnostic.message}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </section>

      <aside className="outline-panel" aria-label="结构预览">
        <header className="panel-header compact">
          <div>
            <p className="eyebrow">Outline</p>
            <h2>结构</h2>
          </div>
          <div className="stats compact-stats">
            <span>{totalBlocks} 块</span>
            <span>{parsedDocument.diagnostics.length} 诊断</span>
          </div>
        </header>

        <div className="outline-body">
          {outline.length > 0 ? (
            <OutlineTree nodes={outline} />
          ) : (
            <p className="empty-outline">没有可解析的结构</p>
          )}
        </div>
      </aside>
    </main>
  );
}

export default App;
