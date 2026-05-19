import { useMemo, useState } from "react";
import "./App.css";

type OutlineNode = {
  id: string;
  marker: string;
  label: string;
  text: string;
  children: OutlineNode[];
};

const initialDocument = `# 认知树
  = 定义: 可配置语法的认知树笔记
  ? 问题: 如何保持原文不丢失
    - 条件: 缩进决定作用域
    - 证据: 每一行都保留 rawText
  + 下一步: 接入 CodeMirror 6`;

const markerLabels: Record<string, string> = {
  "#": "主题",
  "=": "定义",
  "?": "问题",
  "-": "条件",
  "+": "行动",
};

function parseOutline(source: string): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const stack: Array<{ level: number; node: OutlineNode }> = [];

  source.split("\n").forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return;
    }

    const indent = line.match(/^\s*/)?.[0].replace(/\t/g, "  ").length ?? 0;
    const level = Math.floor(indent / 2);
    const marker = markerLabels[trimmed[0]] ? trimmed[0] : "text";
    const text = marker === "text" ? trimmed : trimmed.slice(1).trim();
    const node: OutlineNode = {
      id: `${index}-${level}`,
      marker,
      label: markerLabels[marker] ?? "文本",
      text,
      children: [],
    };

    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1]?.node;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }

    stack.push({ level, node });
  });

  return roots;
}

function OutlineTree({ nodes }: { nodes: OutlineNode[] }) {
  return (
    <ul className="outline-list">
      {nodes.map((node) => (
        <li key={node.id}>
          <div className="outline-node">
            <span className="node-kind">{node.label}</span>
            <span className="node-text">{node.text}</span>
          </div>
          {node.children.length > 0 ? <OutlineTree nodes={node.children} /> : null}
        </li>
      ))}
    </ul>
  );
}

function App() {
  const [documentText, setDocumentText] = useState(initialDocument);
  const outline = useMemo(() => parseOutline(documentText), [documentText]);
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
            <small>6 行</small>
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
            <span>{outline.length} 个根节点</span>
          </div>
        </header>

        <textarea
          className="source-editor"
          spellCheck={false}
          value={documentText}
          onChange={(event) => setDocumentText(event.currentTarget.value)}
          aria-label="CTN 原文"
        />
      </section>

      <aside className="outline-panel" aria-label="结构预览">
        <header className="panel-header compact">
          <div>
            <p className="eyebrow">Outline</p>
            <h2>结构</h2>
          </div>
        </header>

        <OutlineTree nodes={outline} />
      </aside>
    </main>
  );
}

export default App;
