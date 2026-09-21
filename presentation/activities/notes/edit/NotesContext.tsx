import {
  EmptyState,
  FieldRow,
  FormActions,
  FormLayout,
  Section,
  Stack,
} from "compact-ui";
import { usePageNavigation, describePage } from "../../../navigation/index.ts";
import { Button, InputControl } from "compact-ui";
import { FolderPlus, Plus, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { NotesViewModel } from "../../../../application/workspace/index.ts";
import {
  NoteTree,
  type TreeNode,
  useExclusiveAsyncAction,
  useFeedback,
} from "../../../ui/index.ts";

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
  const pending = nodes
    .map((node) => ({
      ancestors: [] as string[],
      node,
    }))
    .reverse();

  while (pending.length > 0) {
    const current = pending.pop();

    if (!current) continue;
    if (
      (activeNode.kind === "note" &&
        current.node.kind === "note" &&
        current.node.noteId === activeNode.noteId) ||
      (activeNode.kind === "folder" &&
        current.node.kind === "folder" &&
        current.node.folderId === activeNode.folderId)
    ) {
      return current.ancestors;
    }
    if (current.node.kind === "folder") {
      const ancestors = [...current.ancestors, current.node.folderId];

      for (
        let index = current.node.children.length - 1;
        index >= 0;
        index -= 1
      ) {
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
  const pages = usePageNavigation();
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderTitle, setFolderTitle] = useState("新文件夹");
  const reloadAction = useExclusiveAsyncAction();
  const reloading = reloadAction.busy;
  const lastActiveNodeIdsRef = useRef<{
    folder: string | null;
    note: string | null;
  }>({ folder: null, note: null });
  const directory = view.directory;

  useEffect(() => {
    const activeNode = directory.activeNode;

    if (!activeNode) return;
    const activeNodeId =
      activeNode.kind === "note" ? activeNode.noteId : activeNode.folderId;

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
    const pending = reloadAction.run(() => feedback.runAction(onReload));

    if (pending) void pending;
  };

  return (
    <Stack fill>
      <Section
        children={null}
        title="文件"
        actions={
          <>
            <Button
              aria-label="重新扫描文件"
              disabled={reloading}
              onClick={reload}
              title="重新扫描文件"
              type="button"
              variant="icon"
            >
              <RefreshCw aria-hidden="true" size={16} />
            </Button>
            <Button
              aria-label="新建文件夹"
              disabled={reloading}
              onClick={() => setCreatingFolder(true)}
              title="新建文件夹"
              type="button"
              variant="icon"
            >
              <FolderPlus aria-hidden="true" size={16} />
            </Button>
            <Button
              aria-label="新建笔记"
              disabled={reloading}
              onClick={() =>
                pages.created("notes", () =>
                  feedback.runAction(directory.createNote),
                )
              }
              title="新建笔记"
              type="button"
              variant="icon"
            >
              <Plus aria-hidden="true" size={16} />
            </Button>
          </>
        }
      />
      {creatingFolder ? (
        <FormLayout
          onSubmit={(event) => {
            event.preventDefault();
            createFolder();
          }}
        >
          <FieldRow label="文件夹名称">
            {(accessibility) => (
              <InputControl
                {...accessibility}
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
            )}
          </FieldRow>
          <FormActions>
            <Button type="submit" variant="normal">
              确定
            </Button>
            <Button
              onClick={() => setCreatingFolder(false)}
              type="button"
              variant="normal"
            >
              取消
            </Button>
          </FormActions>
        </FormLayout>
      ) : null}
      <NoteTree
        onOpenNote={(id, intent) => {
          const node = (() => {
            const pending = [...directory.noteTree];
            while (pending.length) {
              const item = pending.pop()!;
              if (item.kind === "note" && item.noteId === id) return item;
              if (item.kind === "folder") pending.push(...item.children);
            }
            return null;
          })();
          const repositoryId = pages.getRepositoryId();
          if (node)
            pages.open(
              describePage("notes", "note", id, node.title, repositoryId),
              intent,
              () => directory.selectNote(id),
            );
        }}
        activeNode={directory.activeNode}
        collapsedFolderIds={collapsedFolderIds}
        nodes={directory.noteTree}
        onClearSelection={directory.clearFolderSelection}
        onDeleteNode={deleteNode}
        onMoveNode={directory.moveTreeNode}
        onRenameNode={renameNode}
        onSelectFolder={directory.selectFolder}
        onSelectNote={directory.selectNote}
        onToggleFolder={toggleFolder}
      />
      {directory.noteTree.length === 0 ? (
        <EmptyState title="没有笔记。" />
      ) : null}
    </Stack>
  );
}
