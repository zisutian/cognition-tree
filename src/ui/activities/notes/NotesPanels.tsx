import {
  CircleAlert,
  ChevronRight,
  FolderPlus,
  Plus,
} from "lucide-react";
import { useState } from "react";
import { CtnEditor } from "../../../editor/CtnEditor";
import type { NotesViewModel } from "../../../application/workspace/view-model/activityViewModels";
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
  type TreeNode,
} from "../../shared/tree";

type NotesContextProps = {
  view: NotesViewModel;
};

export function NotesContext({ view }: NotesContextProps) {
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderTitle, setFolderTitle] = useState("新文件夹");
  const directory = view.directory;
  const createFolder = () => {
    const title = folderTitle.trim();

    if (!title) {
      return;
    }

    directory.createFolder(directory.activeFolderId, title);
    setCreatingFolder(false);
    setFolderTitle("新文件夹");
  };
  const renameNode = (node: TreeNode, title: string) => {
    if (node.kind === "folder") {
      directory.renameFolder(node.folderId, title);
    } else {
      directory.renameNote(node.noteId, title);
    }
  };
  const deleteNode = (node: TreeNode) => {
    if (node.kind === "folder") {
      directory.deleteFolder(node.folderId);
    } else {
      directory.deleteNote(node.noteId);
    }
  };
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
        <Button aria-label="新建笔记" onClick={directory.createNote} title="新建笔记" type="button" variant="icon">
          <Plus aria-hidden="true" size={14} />
        </Button>
        <Button
          aria-label="新建文件夹"
          onClick={() => setCreatingFolder(true)}
          title="新建文件夹"
          type="button"
          variant="icon"
        >
          <FolderPlus aria-hidden="true" size={14} />
        </Button>
      </div>
      {creatingFolder ? (
        <form
          className="directory-create-row"
          onSubmit={(event) => {
            event.preventDefault();
            createFolder();
          }}
        >
          <input
            autoFocus
            aria-label="文件夹名称"
            value={folderTitle}
            onChange={(event) => setFolderTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setCreatingFolder(false);
              }
            }}
          />
          <Button type="submit" variant="secondary">确定</Button>
          <Button onClick={() => setCreatingFolder(false)} type="button" variant="ghost">取消</Button>
        </form>
      ) : null}
      <NoteTree
        activeNode={directory.activeNode}
        collapsedFolderIds={collapsedFolderIds}
        nodes={directory.noteTree}
        onDeleteNode={deleteNode}
        onMoveNode={directory.moveTreeNode}
        onRenameNode={renameNode}
        onSelectFolder={directory.selectFolder}
        onSelectNote={directory.selectNote}
        onToggleFolder={toggleFolder}
      />
      {directory.noteTree.length === 0 ? (
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
            <Button onClick={view.directory.createNote} type="button" variant="primary">
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
        onChange={view.updateSource}
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
                  onClick={() => view.outline.onSelectLine(diagnostic.lineNumber)}
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
