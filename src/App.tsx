import { useMemo, useState } from "react";
import { CtnEditor } from "./CtnEditor";
import { parseCtnDocument, type OutlineNode } from "./ctn/parseOutline";
import "./App.css";

const initialDocument = `认知树
  : 本地优先的可配置语法认知树笔记
  [理解] 当前编辑器已经接入 CodeMirror 6
    [证据] 行号、活动行、Tab 缩进和基础高亮可用
    [证据] 右侧结构树会随原文实时更新
  [?] 下一步如何靠近真实笔记体验
    [条件] 先补齐悬浮诊断提示和结构树定位
    [条件] 再接入 SQLite 保存笔记和块
  [组分] 第一阶段闭环
    [例子] 原文编辑
    [例子] 结构预览
    [例子] 本地保存
    [例子] 纯文本和 JSON 导出`;

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

        <CtnEditor value={documentText} onChange={setDocumentText} />

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
