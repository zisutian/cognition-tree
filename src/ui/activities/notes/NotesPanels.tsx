import {
  ChevronRight,
  FolderPlus,
  Maximize2,
  Minimize2,
  Plus,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CtnEditor } from "../../../editor/CtnEditor";
import type { NotesViewModel } from "../../../application/workspace/activities/notes/notesViewModel";
import {
  Button,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
} from "../../shared/primitives";
import {
  NoteTree,
  StructureTree,
  TreeMoveQuickPick,
  type TreeNode,
} from "../../shared/tree";
import { useFeedback } from "../../shared/FeedbackProvider";
import { useReferenceNavigation } from "../../shared/useReferenceNavigation";
import { NoteTimeDetails } from "./NoteTimeDetails";

type NotesContextProps = {
  view: NotesViewModel;
};

export function submitNotesFolderCreation({
  directory,
  folderTitle,
  onCreated,
  runAction,
}: {
  directory: Pick<
    NotesViewModel["directory"],
    "activeFolderId" | "createFolder"
  >;
  folderTitle: string;
  onCreated: () => void;
  runAction: (action: () => void) => unknown;
}) {
  runAction(() => {
    directory.createFolder(directory.activeFolderId, folderTitle);
    onCreated();
  });
}

export function submitNotesEditorChange({
  authoritativeSource,
  change,
  onNormalized,
  onSynchronize,
  runAction,
  updateSource,
}: {
  authoritativeSource: string;
  change: Parameters<NotesViewModel["updateSource"]>[0];
  onNormalized: () => void;
  onSynchronize: (source: string) => void;
  runAction: (
    action: () => ReturnType<NotesViewModel["updateSource"]>,
  ) => ReturnType<NotesViewModel["updateSource"]> | undefined;
  updateSource: NotesViewModel["updateSource"];
}) {
  const result = runAction(() => updateSource(change));

  if (result?.titleNormalized) {
    onNormalized();
  }

  if (!result || result.authoritativeSource !== change.source) {
    onSynchronize(result?.authoritativeSource ?? authoritativeSource);
  }

  return result;
}

export function findNotesTreeAncestorFolderIds(
  nodes: NotesViewModel["directory"]["noteTree"],
  activeNode: NotesViewModel["directory"]["activeNode"],
) {
  if (!activeNode) return [];
  const pending = nodes.map((node) => ({
    ancestors: [] as string[],
    node,
  })).reverse();

  while (pending.length > 0) {
    const current = pending.pop();

    if (!current) continue;
    if (
      (activeNode.kind === "note" && current.node.kind === "note" &&
        current.node.noteId === activeNode.noteId) ||
      (activeNode.kind === "folder" && current.node.kind === "folder" &&
        current.node.folderId === activeNode.folderId)
    ) {
      return current.ancestors;
    }
    if (current.node.kind === "folder") {
      const ancestors = [...current.ancestors, current.node.folderId];

      for (let index = current.node.children.length - 1; index >= 0; index -= 1) {
        pending.push({ ancestors, node: current.node.children[index] });
      }
    }
  }
  return [];
}

export function NotesContext({ view }: NotesContextProps) {
  const feedback = useFeedback();
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderTitle, setFolderTitle] = useState("新文件夹");
  const [moveNode, setMoveNode] = useState<TreeNode | null>(null);
  const lastActiveNodeIdsRef = useRef<{
    folder: string | null;
    note: string | null;
  }>({ folder: null, note: null });
  const directory = view.directory;

  useEffect(() => {
    const activeNode = directory.activeNode;

    if (!activeNode) return;
    const activeNodeId = activeNode.kind === "note"
      ? activeNode.noteId
      : activeNode.folderId;

    if (lastActiveNodeIdsRef.current[activeNode.kind] === activeNodeId) return;
    lastActiveNodeIdsRef.current[activeNode.kind] = activeNodeId;
    const ancestors = findNotesTreeAncestorFolderIds(
      directory.noteTree,
      activeNode,
    );

    if (ancestors.length === 0) return;
    setCollapsedFolderIds((current) => {
      if (!ancestors.some((folderId) => current.has(folderId))) return current;
      const next = new Set(current);

      ancestors.forEach((folderId) => next.delete(folderId));
      return next;
    });
  }, [directory.activeNode, directory.noteTree]);

  const createFolder = () => {
    submitNotesFolderCreation({
      directory,
      folderTitle,
      onCreated: () => {
        setCreatingFolder(false);
        setFolderTitle("新文件夹");
      },
      runAction: (action) => feedback.runAction(action),
    });
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
            className="ui-input"
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
        onClearSelection={directory.clearFolderSelection}
        onDeleteNode={deleteNode}
        onMoveNode={directory.moveTreeNode}
        onRenameNode={renameNode}
        onRequestMoveNode={setMoveNode}
        onSelectFolder={directory.selectFolder}
        onSelectNote={directory.selectNote}
        onToggleFolder={toggleFolder}
      />
      <TreeMoveQuickPick
        nodes={directory.noteTree}
        sourceNode={moveNode}
        onClose={() => setMoveNode(null)}
        onMove={directory.moveTreeNode}
      />
      {directory.noteTree.length === 0 ? (
        <p className="context-empty">没有笔记。</p>
      ) : null}
    </div>
  );
}

export function NoteEditorPanel({
  focusMode,
  onToggleFocusMode,
  view,
}: NotesContextProps & {
  focusMode: boolean;
  onToggleFocusMode: () => void;
}) {
  const feedback = useFeedback();
  const [editorSyncSource, setEditorSyncSource] = useState<{
    noteId: string;
    source: string;
  } | null>(null);
  const [editorSyncVersion, setEditorSyncVersion] = useState(0);
  const referenceNavigation = useReferenceNavigation(
    view.referenceNavigation,
  );
  const activeNote = view.activeNote;

  useEffect(() => {
    if (
      editorSyncSource &&
      (!activeNote ||
        editorSyncSource.noteId !== activeNote.id ||
        editorSyncSource.source === view.editor.documentText)
    ) {
      setEditorSyncSource(null);
    }
  }, [activeNote, editorSyncSource, view.editor.documentText]);

  if (!activeNote) {
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
        title={activeNote.title}
        actions={
          <>
            {view.editor.errorMessage ? (
              <span className="ui-error">{view.editor.errorMessage}</span>
            ) : null}
            <Button
              aria-label={focusMode ? "退出专注模式" : "进入专注模式"}
              onClick={onToggleFocusMode}
              title={focusMode ? "退出专注模式" : "进入专注模式"}
              type="button"
              variant="icon"
            >
              {focusMode ? (
                <Minimize2 aria-hidden="true" size={14} />
              ) : (
                <Maximize2 aria-hidden="true" size={14} />
              )}
            </Button>
          </>
        }
      />
      <CtnEditor
        key={activeNote.id}
        contentMode={view.editor.mode === "raw"
          ? { kind: "raw" }
          : { kind: "document" }}
        focusTarget={view.editor.focusTarget}
        syntaxProfile={view.editor.syntaxProfile}
        value={editorSyncSource?.noteId === activeNote.id
          ? editorSyncSource.source
          : view.editor.documentText}
        valueSyncVersion={editorSyncVersion}
        onActiveLineChange={view.editor.onActiveLineChange}
        onChange={(change) => {
          submitNotesEditorChange({
            authoritativeSource: view.editor.documentText,
            change,
            onNormalized: () => feedback.notify(
              "笔记标题已按可移植名称规则规范化。",
            ),
            onSynchronize: (source) => {
              setEditorSyncSource({ noteId: activeNote.id, source });
              setEditorSyncVersion((current) => current + 1);
            },
            runAction: (action) => feedback.runAction(action),
            updateSource: view.updateSource,
          });
        }}
        onConsumeFocusTarget={view.editor.onConsumeFocusTarget}
        onOpenReference={referenceNavigation.openReference}
      />
      {referenceNavigation.picker}
    </Panel>
  );
}

export function NoteDetailPanel({
  onCollapseDetail,
  view,
}: NotesContextProps & {
  onCollapseDetail: () => void;
}) {
  if (!view.activeNote) {
    return null;
  }

  const selectedBlock = view.outline.activeBlock;
  const selectedLineNumbers = selectedBlock
    ? new Set([selectedBlock.lineNumber])
    : undefined;

  return (
    <Panel
      className="note-detail-panel"
      aria-label="笔记详情"
      tone="detail"
    >
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
        </dl>
        <NoteTimeDetails
          blockMetadata={selectedBlock?.metadata ?? null}
          noteMetadata={view.activeNote}
        />
        {view.outline.nodes.length > 0 ? (
          <StructureTree
            indentUnitCount={view.editor.syntaxProfile.tabDisplayWidth}
            nodes={view.outline.nodes}
            selectedLineNumbers={selectedLineNumbers}
            onSelectLine={view.outline.onSelectLine}
          />
        ) : (
          <p className="ui-muted">没有可解析结构。</p>
        )}
      </PanelBody>
    </Panel>
  );
}
