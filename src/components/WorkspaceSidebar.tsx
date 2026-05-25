import {
  Braces,
  Database,
  FileText,
  Folder,
  ListTree,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { OutlineNode } from "../ctn/parseOutline";
import type { NoteId, NoteRecord, NoteTreeNode } from "../domain/notes";

export type ActivityKey =
  | "notes"
  | "search"
  | "outline"
  | "syntax"
  | "data"
  | "settings";

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
  activeNoteId,
  diagnosticsCount,
  lineCount,
  notes,
  noteTree,
  repositoryPath,
  storageLabel,
  totalBlocks,
  onChangeRepositoryPath,
  onCreateNote,
  onDeleteNote,
  onReloadWorkspace,
  onSelectNote,
}: {
  activeNoteId: NoteId | null;
  diagnosticsCount: number;
  lineCount: number;
  notes: NoteRecord[];
  noteTree: NoteTreeNode[];
  repositoryPath: string;
  storageLabel: string;
  totalBlocks: number;
  onChangeRepositoryPath: (path: string) => void;
  onCreateNote: () => void;
  onDeleteNote: (noteId: NoteId) => void;
  onReloadWorkspace: () => void;
  onSelectNote: (noteId: NoteId) => void;
}) {
  const notesById = new Map(notes.map((note) => [note.id, note]));
  const requestRepositoryPath = () => {
    const nextPath = window.prompt("仓库文件夹路径", repositoryPath);

    if (nextPath) {
      onChangeRepositoryPath(nextPath);
    }
  };

  return (
    <div className="side-panel-body">
      <section className="side-section">
        <div className="side-section-header">
          <p className="side-section-title">笔记</p>
          <button
            className="side-action-button"
            onClick={onCreateNote}
            type="button"
          >
            <Plus aria-hidden="true" size={13} strokeWidth={2} />
            新建
          </button>
        </div>
        <nav className="note-tree" aria-label="笔记仓库">
          <NoteTree
            activeNoteId={activeNoteId}
            nodes={noteTree}
            notesById={notesById}
            onDeleteNote={onDeleteNote}
            onSelectNote={onSelectNote}
          />
        </nav>
      </section>

      <section className="side-section">
        <p className="side-section-title">当前</p>
        <div className="side-metrics">
          <div className="side-metric">
            <span>行</span>
            <strong>{lineCount}</strong>
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
        <div className="side-section-header">
          <p className="side-section-title">存储</p>
          <div className="side-action-group">
            <button
              className="side-action-button"
              onClick={onReloadWorkspace}
              type="button"
            >
              <RefreshCw aria-hidden="true" size={13} strokeWidth={2} />
              刷新
            </button>
            <button
              className="side-action-button"
              onClick={requestRepositoryPath}
              type="button"
            >
              更改
            </button>
          </div>
        </div>
        <div className="side-placeholder">
          <span>{storageLabel}</span>
          <strong>自动保存</strong>
          <code className="side-path">{repositoryPath || "加载中"}</code>
        </div>
      </section>
    </div>
  );
}

function NoteTree({
  activeNoteId,
  nodes,
  notesById,
  onDeleteNote,
  onSelectNote,
}: {
  activeNoteId: NoteId | null;
  nodes: NoteTreeNode[];
  notesById: Map<NoteId, NoteRecord>;
  onDeleteNote: (noteId: NoteId) => void;
  onSelectNote: (noteId: NoteId) => void;
}) {
  return (
    <>
      {nodes.map((node) => {
        if (node.kind === "folder") {
          return (
            <div className="note-folder" key={node.id}>
              <div className="note-folder-label">
                <Folder aria-hidden="true" size={14} strokeWidth={1.9} />
                <span>{node.title}</span>
                <small>{node.children.length}</small>
              </div>
              <div className="note-folder-children">
                {node.children.length > 0 ? (
                  <NoteTree
                    activeNoteId={activeNoteId}
                    nodes={node.children}
                    notesById={notesById}
                    onDeleteNote={onDeleteNote}
                    onSelectNote={onSelectNote}
                  />
                ) : (
                  <p className="side-muted">空</p>
                )}
              </div>
            </div>
          );
        }

        const note = notesById.get(node.noteId);

        if (!note) {
          return null;
        }

        const deleteNote = () => {
          if (window.confirm(`删除笔记「${note.title}」？`)) {
            onDeleteNote(note.id);
          }
        };

        return (
          <div className="note-item-row" key={node.id}>
            <button
              className={
                note.id === activeNoteId ? "note-item active" : "note-item"
              }
              onClick={() => onSelectNote(note.id)}
              type="button"
            >
              <FileText aria-hidden="true" size={14} strokeWidth={1.9} />
              <span>{note.title}</span>
              <small>{note.source.split("\n").length} 行</small>
            </button>
            <button
              aria-label={`删除 ${note.title}`}
              className="note-delete-button"
              onClick={deleteNote}
              title="删除笔记"
              type="button"
            >
              <Trash2 aria-hidden="true" size={13} strokeWidth={1.9} />
            </button>
          </div>
        );
      })}
    </>
  );
}

function OutlinePanelSummary({
  diagnosticsCount,
  outline,
  totalBlocks,
  onSelectLine,
}: {
  diagnosticsCount: number;
  outline: OutlineNode[];
  totalBlocks: number;
  onSelectLine: (lineNumber: number) => void;
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

function ActivityPanel({
  activeActivity,
  activeNoteId,
  diagnosticsCount,
  lineCount,
  notes,
  noteTree,
  outline,
  repositoryPath,
  storageLabel,
  totalBlocks,
  onChangeRepositoryPath,
  onCreateNote,
  onDeleteNote,
  onReloadWorkspace,
  onSelectLine,
  onSelectNote,
}: {
  activeActivity: ActivityKey;
  activeNoteId: NoteId | null;
  diagnosticsCount: number;
  lineCount: number;
  notes: NoteRecord[];
  noteTree: NoteTreeNode[];
  outline: OutlineNode[];
  repositoryPath: string;
  storageLabel: string;
  totalBlocks: number;
  onChangeRepositoryPath: (path: string) => void;
  onCreateNote: () => void;
  onDeleteNote: (noteId: NoteId) => void;
  onReloadWorkspace: () => void;
  onSelectLine: (lineNumber: number) => void;
  onSelectNote: (noteId: NoteId) => void;
}) {
  if (activeActivity === "notes") {
    return (
      <NotesPanel
        activeNoteId={activeNoteId}
        diagnosticsCount={diagnosticsCount}
        lineCount={lineCount}
        notes={notes}
        noteTree={noteTree}
        repositoryPath={repositoryPath}
        storageLabel={storageLabel}
        totalBlocks={totalBlocks}
        onChangeRepositoryPath={onChangeRepositoryPath}
        onCreateNote={onCreateNote}
        onDeleteNote={onDeleteNote}
        onReloadWorkspace={onReloadWorkspace}
        onSelectNote={onSelectNote}
      />
    );
  }

  if (activeActivity === "outline") {
    return (
      <OutlinePanelSummary
        diagnosticsCount={diagnosticsCount}
        outline={outline}
        totalBlocks={totalBlocks}
        onSelectLine={onSelectLine}
      />
    );
  }

  const placeholders: Record<Exclude<ActivityKey, "notes" | "outline">, string[]> =
    {
      search: ["标题", "正文", "块类型"],
      syntax: ["默认符号", "行内符号", "版本"],
      data: ["文件库", "索引", "导入导出"],
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

export function WorkspaceSidebar({
  activeActivity,
  activeNoteId,
  diagnosticsCount,
  lineCount,
  notes,
  noteTree,
  outline,
  repositoryPath,
  storageLabel,
  totalBlocks,
  onActivityChange,
  onChangeRepositoryPath,
  onCreateNote,
  onDeleteNote,
  onReloadWorkspace,
  onSelectLine,
  onSelectNote,
}: {
  activeActivity: ActivityKey;
  activeNoteId: NoteId | null;
  diagnosticsCount: number;
  lineCount: number;
  notes: NoteRecord[];
  noteTree: NoteTreeNode[];
  outline: OutlineNode[];
  repositoryPath: string;
  storageLabel: string;
  totalBlocks: number;
  onActivityChange: (activity: ActivityKey) => void;
  onChangeRepositoryPath: (path: string) => void;
  onCreateNote: () => void;
  onDeleteNote: (noteId: NoteId) => void;
  onReloadWorkspace: () => void;
  onSelectLine: (lineNumber: number) => void;
  onSelectNote: (noteId: NoteId) => void;
}) {
  const activeActivityItem =
    activityItems.find((item) => item.id === activeActivity) ?? activityItems[0];

  return (
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
                onClick={() => onActivityChange(item.id)}
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
                onClick={() => onActivityChange(item.id)}
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
          activeNoteId={activeNoteId}
          diagnosticsCount={diagnosticsCount}
          lineCount={lineCount}
          notes={notes}
          noteTree={noteTree}
          outline={outline}
          repositoryPath={repositoryPath}
          storageLabel={storageLabel}
          totalBlocks={totalBlocks}
          onChangeRepositoryPath={onChangeRepositoryPath}
          onCreateNote={onCreateNote}
          onDeleteNote={onDeleteNote}
          onReloadWorkspace={onReloadWorkspace}
          onSelectLine={onSelectLine}
          onSelectNote={onSelectNote}
        />
      </section>
    </aside>
  );
}
