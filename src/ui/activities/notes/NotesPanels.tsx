import {
  ChevronRight,
  FolderPlus,
  Plus,
} from "lucide-react";
import { useState } from "react";
import { CtnEditor } from "../../../editor/CtnEditor";
import type { ViewModel } from "../../../application/workspace/view-model/useViewModel";
import {
  Button,
  EmptyState,
  Metrics,
  Panel,
  PanelBody,
  PanelHeader,
  Section,
} from "../../shared/primitives";
import {
  NoteTree,
  OutlineTree,
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
        activeFolderId={view.sidebar.activeFolderId}
        activeNoteId={view.sidebar.activeNoteId}
        actions={actions}
        collapsedFolderIds={collapsedFolderIds}
        nodes={view.sidebar.noteTree}
        onMoveNode={view.moveSidebarTreeNode}
        onSelectFolder={view.selectFolder}
        onSelectNote={view.selectNote}
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
      <PanelBody scroll>
        <Metrics
          aria-label="笔记统计"
          items={[
            { label: "行", value: view.editor.stats.lineCount },
            { label: "块", value: view.editor.stats.totalBlocks },
            { label: "根", value: view.editor.stats.rootCount },
            { label: "诊断", value: view.editor.stats.diagnosticCount },
          ]}
        />
        <Section title="结构树">
          {view.outline.nodes.length > 0 ? (
            <OutlineTree
              nodes={view.outline.nodes}
              onSelectLine={view.outline.onSelectLine}
            />
          ) : (
            <p className="ui-muted">没有可解析结构。</p>
          )}
        </Section>
        <Section title="诊断">
          {view.editor.diagnostics.length > 0 ? (
            <ul className="dense-list">
              {view.editor.diagnostics.map((diagnostic) => (
                <li key={diagnostic.id}>
                  <button type="button" onClick={() => view.focusEditorLine(diagnostic.lineNumber)}>
                    L{diagnostic.lineNumber} · {diagnostic.message}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ui-muted">没有诊断。</p>
          )}
        </Section>
      </PanelBody>
    </Panel>
  );
}
