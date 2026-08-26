import { FolderPlus, Plus, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { NotesViewModel } from "../../../../application/workspace/notes/edit/notesViewModel";
import { Button } from "../../../ui/shared/primitives";
import { InputControl } from "../../../ui/shared/controls";
import {
  NoteTree,
  TreeMoveQuickPick,
  type TreeNode,
} from "../../../ui/shared/tree";
import { useFeedback } from "../../../ui/shared/FeedbackProvider";

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

export function NotesContext({
  onReload,
  view,
}: {
  onReload: () => Promise<void>;
  view: NotesViewModel;
}) {
  const feedback = useFeedback();
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderTitle, setFolderTitle] = useState("新文件夹");
  const [moveNode, setMoveNode] = useState<TreeNode | null>(null);
  const [reloading, setReloading] = useState(false);
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
  const reload = () => {
    if (reloading) return;
    setReloading(true);
    void feedback.runAction(onReload).finally(() => setReloading(false));
  };

  return (
    <div className="activity-context-content">
      <div className="context-toolbar">
        <Button
          aria-label="重新扫描文件"
          disabled={reloading}
          onClick={reload}
          title="重新扫描文件"
          type="button"
          variant="icon"
        >
          <RefreshCw aria-hidden="true" size={14} />
        </Button>
        <Button
          aria-label="新建文件夹"
          disabled={reloading}
          onClick={() => setCreatingFolder(true)}
          title="新建文件夹"
          type="button"
          variant="icon"
        >
          <FolderPlus aria-hidden="true" size={14} />
        </Button>
        <Button
          aria-label="新建笔记"
          disabled={reloading}
          onClick={directory.createNote}
          title="新建笔记"
          type="button"
          variant="icon"
        >
          <Plus aria-hidden="true" size={14} />
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
          <InputControl
            autoFocus
            aria-label="文件夹名称"
            sizing="container"
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
