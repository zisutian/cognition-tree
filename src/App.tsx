import { useMemo, useState } from "react";
import {
  Braces,
  Database,
  FileText,
  ListTree,
  Search,
  Settings,
  type LucideIcon,
} from "lucide-react";
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

type ActivityKey = "notes" | "search" | "outline" | "syntax" | "data" | "settings";

type ActivityItem = {
  id: ActivityKey;
  label: string;
  icon: LucideIcon;
};

const activityItems: ActivityItem[] = [
  { id: "notes", label: "笔记", icon: FileText },
  { id: "search", label: "搜索", icon: Search },
  { id: "outline", label: "结构", icon: ListTree },
  { id: "syntax", label: "语法", icon: Braces },
  { id: "data", label: "数据", icon: Database },
  { id: "settings", label: "设置", icon: Settings },
];

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

function PlaceholderPanel({
  label,
  entries,
}: {
  label: string;
  entries: string[];
}) {
  return (
    <div className="side-panel-body">
      <section className="side-section">
        <div className="side-placeholder">
          <span>待接入</span>
          <strong>{label}</strong>
        </div>
      </section>

      <section className="side-section">
        <p className="side-section-title">入口</p>
        <div className="side-entry-list">
          {entries.map((entry) => (
            <button className="side-entry" disabled key={entry} type="button">
              {entry}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function NotesPanel({
  lineCount,
  totalBlocks,
  diagnosticsCount,
}: {
  lineCount: number;
  totalBlocks: number;
  diagnosticsCount: number;
}) {
  return (
    <div className="side-panel-body">
      <section className="side-section">
        <p className="side-section-title">笔记</p>
        <nav className="note-list" aria-label="笔记">
          <button className="note-item active" type="button">
            <span>认知树</span>
            <small>{lineCount} 行</small>
          </button>
          <button className="note-item" type="button">
            <span>语法实验</span>
            <small>草稿</small>
          </button>
        </nav>
      </section>

      <section className="side-section">
        <p className="side-section-title">当前</p>
        <div className="side-metrics">
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
    </div>
  );
}

function OutlinePanelSummary({
  outline,
  totalBlocks,
  diagnosticsCount,
}: {
  outline: OutlineNode[];
  totalBlocks: number;
  diagnosticsCount: number;
}) {
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
              <button className="side-entry" key={node.id} type="button">
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

function ActivityPanel({
  activeActivity,
  lineCount,
  totalBlocks,
  diagnosticsCount,
  outline,
}: {
  activeActivity: ActivityKey;
  lineCount: number;
  totalBlocks: number;
  diagnosticsCount: number;
  outline: OutlineNode[];
}) {
  if (activeActivity === "notes") {
    return (
      <NotesPanel
        diagnosticsCount={diagnosticsCount}
        lineCount={lineCount}
        totalBlocks={totalBlocks}
      />
    );
  }

  if (activeActivity === "outline") {
    return (
      <OutlinePanelSummary
        diagnosticsCount={diagnosticsCount}
        outline={outline}
        totalBlocks={totalBlocks}
      />
    );
  }

  const placeholders: Record<Exclude<ActivityKey, "notes" | "outline">, string[]> =
    {
      search: ["标题", "正文", "块类型"],
      syntax: ["默认符号", "行内符号", "版本"],
      data: ["SQLite", "导入", "导出"],
      settings: ["外观", "快捷键", "许可证"],
    };

  return (
    <PlaceholderPanel
      entries={placeholders[activeActivity]}
      label={
        activityItems.find((item) => item.id === activeActivity)?.label ??
        "功能"
      }
    />
  );
}

function App() {
  const [activeActivity, setActiveActivity] = useState<ActivityKey>("notes");
  const [documentText, setDocumentText] = useState(initialDocument);
  const parsedDocument = useMemo(
    () => parseCtnDocument(documentText),
    [documentText],
  );
  const outline = parsedDocument.roots;
  const totalBlocks = parsedDocument.blocks.length;
  const lineCount = documentText.split("\n").length;
  const activeActivityItem =
    activityItems.find((item) => item.id === activeActivity) ?? activityItems[0];

  return (
    <main className="app-shell">
      <aside className="workspace-sidebar">
        <nav className="activity-bar" aria-label="工作区功能">
          <div className="activity-brand" aria-hidden="true">
            认
          </div>
          <div className="activity-group">
            {activityItems.slice(0, 5).map((item) => {
              const Icon = item.icon;

              return (
                <button
                  aria-label={item.label}
                  className={
                    item.id === activeActivity
                      ? "activity-button active"
                      : "activity-button"
                  }
                  key={item.id}
                  onClick={() => setActiveActivity(item.id)}
                  title={item.label}
                  type="button"
                >
                  <Icon aria-hidden="true" size={20} strokeWidth={1.9} />
                </button>
              );
            })}
          </div>
          <div className="activity-group activity-group-bottom">
            {activityItems.slice(5).map((item) => {
              const Icon = item.icon;

              return (
                <button
                  aria-label={item.label}
                  className={
                    item.id === activeActivity
                      ? "activity-button active"
                      : "activity-button"
                  }
                  key={item.id}
                  onClick={() => setActiveActivity(item.id)}
                  title={item.label}
                  type="button"
                >
                  <Icon aria-hidden="true" size={20} strokeWidth={1.9} />
                </button>
              );
            })}
          </div>
        </nav>

        <section className="side-panel" aria-label={activeActivityItem.label}>
          <header className="side-panel-header">
            <p className="eyebrow">Workspace</p>
            <h1>{activeActivityItem.label}</h1>
          </header>
          <ActivityPanel
            activeActivity={activeActivity}
            diagnosticsCount={parsedDocument.diagnostics.length}
            lineCount={lineCount}
            outline={outline}
            totalBlocks={totalBlocks}
          />
        </section>
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
