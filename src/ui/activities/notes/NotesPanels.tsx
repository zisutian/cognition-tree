import {
  CircleAlert,
  ChevronRight,
  FolderPlus,
  Plus,
} from "lucide-react";
import { useEffect, useState } from "react";
import { CtnEditor } from "../../../editor/CtnEditor";
import type { ViewModel } from "../../../application/workspace/view-model/useViewModel";
import {
  Button,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
  SymbolSlot,
} from "../../shared/primitives";
import {
  NoteTree,
  OutlineTree,
  type NoteTreeActiveNode,
  type TreeNode,
} from "../../shared/tree";

type NotesContextProps = {
  view: ViewModel;
};

function promptText(label: string, value = "") {
  return window.prompt(label, value)?.trim() ?? "";
}

export function NotesContext({ view }: NotesContextProps) {
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [activeTreeNode, setActiveTreeNode] =
    useState<NoteTreeActiveNode | null>(() =>
      view.sidebar.activeNoteId
        ? { kind: "note", noteId: view.sidebar.activeNoteId }
        : view.sidebar.activeFolderId
          ? { folderId: view.sidebar.activeFolderId, kind: "folder" }
          : null,
    );
  useEffect(() => {
    if (view.sidebar.activeNoteId) {
      setActiveTreeNode({ kind: "note", noteId: view.sidebar.activeNoteId });
      return;
    }

    setActiveTreeNode(null);
  }, [view.sidebar.activeNoteId]);
  const createFolder = () => {
    const title = promptText("文件夹名称", "新文件夹");

    if (title) {
      view.createFolder(view.sidebar.activeFolderId, title);
    }
  };
  const actions = (node: TreeNode) =>
    node.kind === "folder"
      ? [
          {
            label: "改",
            onClick: () => {
              const title = promptText("文件夹名称", node.title);

              if (title) {
                view.renameFolder(node.folderId, title);
              }
            },
          },
          {
            label: "删",
            onClick: () => view.deleteFolder(node.folderId),
          },
        ]
      : [
          {
            label: "改",
            onClick: () => {
              const title = promptText("笔记名称", node.title);

              if (title) {
                view.renameNote(node.noteId, title);
              }
            },
          },
          {
            label: "删",
            onClick: () => view.deleteNote(node.noteId),
          },
      ];
  const toggleFolder = (folderId: string) => {
    setCollapsedFolderIds((current) => {
      const next = new Set(current);

      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }

      return next;
    });
  };

  return (
    <div className="activity-context-content">
      <div className="context-toolbar">
        <Button aria-label="新建笔记" onClick={view.createNote} title="新建笔记" type="button" variant="icon">
          <Plus aria-hidden="true" size={14} />
        </Button>
        <Button aria-label="新建文件夹" onClick={createFolder} title="新建文件夹" type="button" variant="icon">
          <FolderPlus aria-hidden="true" size={14} />
        </Button>
      </div>
      <NoteTree
        activeNode={activeTreeNode}
        actions={actions}
        collapsedFolderIds={collapsedFolderIds}
        nodes={view.sidebar.noteTree}
        onMoveNode={view.moveSidebarTreeNode}
        onSelectFolder={(folderId) => {
          setActiveTreeNode({ folderId, kind: "folder" });
          view.selectFolder(folderId);
        }}
        onSelectNote={(noteId) => {
          setActiveTreeNode({ kind: "note", noteId });
          view.selectNote(noteId);
        }}
        onToggleFolder={toggleFolder}
      />
      {view.sidebar.noteTree.length === 0 ? (
        <p className="context-empty">没有笔记。</p>
      ) : null}
    </div>
  );
}

export function NoteEditorPanel({ view }: NotesContextProps) {
  if (!view.editor.hasActiveNote) {
    return (
      <Panel className="note-editor-panel" aria-label="笔记编辑">
        <EmptyState
          action={
            <Button onClick={view.createNote} type="button" variant="primary">
              新建笔记
            </Button>
          }
          description="从左侧目录选择或创建笔记。"
          title="没有活动笔记"
        />
      </Panel>
    );
  }

  return (
    <Panel className="note-editor-panel" aria-label="笔记编辑">
      <PanelHeader
        title={view.editor.currentNoteTitle ?? "未命名笔记"}
        actions={
          view.editor.errorMessage ? (
            <span className="ui-error">{view.editor.errorMessage}</span>
          ) : null
        }
      />
      <CtnEditor
        focusTarget={view.editor.focusTarget}
        syntaxProfile={view.editor.syntaxProfile}
        value={view.editor.documentText}
        onChange={view.updateActiveNoteSource}
      />
    </Panel>
  );
}

export function NoteDetailPanel({
  onCollapseDetail,
  view,
}: NotesContextProps & {
  onCollapseDetail: () => void;
}) {
  return (
    <Panel className="note-detail-panel" aria-label="笔记详情" as="aside" tone="detail">
      <PanelHeader
        title="结构"
        actions={
          <Button aria-label="收回右侧详情" onClick={onCollapseDetail} title="收回右侧详情" type="button" variant="icon">
            <ChevronRight aria-hidden="true" size={13} />
          </Button>
        }
      />
      <PanelBody className="detail-panel-stack" scroll>
        <dl
          aria-label="笔记统计"
          className="detail-summary-strip"
        >
          <div>
            <dd>{view.editor.stats.lineCount}</dd>
            <dt>行</dt>
          </div>
          <div>
            <dd>{view.editor.stats.totalBlocks}</dd>
            <dt>块</dt>
          </div>
          <div>
            <dd>{view.editor.stats.rootCount}</dd>
            <dt>根</dt>
          </div>
          <div>
            <dd>{view.editor.stats.diagnosticCount}</dd>
            <dt>诊断</dt>
          </div>
        </dl>
        {view.outline.nodes.length > 0 ? (
          <OutlineTree
            indentUnitCount={view.editor.syntaxProfile.tabDisplayWidth}
            nodes={view.outline.nodes}
            onSelectLine={view.outline.onSelectLine}
          />
        ) : (
          <p className="ui-muted">没有可解析结构。</p>
        )}
        <div aria-hidden="true" className="detail-divider" />
        {view.editor.diagnostics.length > 0 ? (
          <ul aria-label="诊断" className="detail-line-list">
            {view.editor.diagnostics.map((diagnostic) => (
              <li key={diagnostic.id}>
                <button
                  className="detail-line-row detail-line-button"
                  type="button"
                  onClick={() => view.focusEditorLine(diagnostic.lineNumber)}
                >
                  <SymbolSlot
                    aria-hidden="true"
                    className="detail-line-marker"
                    tone="danger"
                  >
                    <CircleAlert aria-hidden="true" size={13} strokeWidth={2} />
                  </SymbolSlot>
                  <span className="detail-line-main">
                    L{diagnostic.lineNumber} · {diagnostic.message}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ui-muted">没有诊断。</p>
        )}
      </PanelBody>
    </Panel>
  );
}
