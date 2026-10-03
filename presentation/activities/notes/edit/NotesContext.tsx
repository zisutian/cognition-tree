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
import { useEffect, useState } from "react";
import type { NotesViewModel, UiDirectoryActiveNode } from "../../../../application/workspace/index.ts";
import type { NotesDirectorySelection } from "../useNotesDirectorySelection.ts";
import {
  NoteTree,
  type TreeNode,
  useExclusiveAsyncAction,
  useFeedback,
} from "../../../ui/index.ts";

export function submitNotesFolderCreation({
  directory,
  folderTitle,
  parentFolderId,
  onCreated,
  runAction,
}: {
  directory: Pick<
    NotesViewModel["directory"],
    "createFolder"
  >;
  folderTitle: string;
  parentFolderId: string | null;
  onCreated: () => void;
  runAction: (action: () => void) => unknown;
}) {
  runAction(() => {
    directory.createFolder(parentFolderId, folderTitle);
    onCreated();
  });
}

export function findNotesTreeAncestorFolderIds(
  nodes: NotesViewModel["directory"]["noteTree"],
  activeNode: UiDirectoryActiveNode | null,
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

function NotesContextSession({
  onReload,
  view,
  repositoryId,
  directorySelection,
}: {
  onReload: () => Promise<void>;
  view: NotesViewModel;
  repositoryId: string;
  directorySelection: NotesDirectorySelection;
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
  const { selectedIds, onSelectionChange } = directorySelection;
  const directory = view.directory;
  const nodeById = new Map<string, TreeNode>();
  const pending = [...directory.noteTree];
  while (pending.length) {
    const node = pending.pop()!;
    nodeById.set(node.id, node);
    if (node.kind === "folder") pending.push(...node.children);
  }
  const selectedFolder = selectedIds.size === 1 ? nodeById.get([...selectedIds][0]) : null;
  const parentFolderId = selectedFolder?.kind === "folder" ? selectedFolder.folderId : null;
  useEffect(() => {
    const request = directory.focusRequest;
    if (!request) return;
    const node = [...nodeById.values()].find((item) => item.kind === request.node.kind &&
      (item.kind === "folder" && request.node.kind === "folder" ? item.folderId === request.node.folderId :
        item.kind === "note" && request.node.kind === "note" && item.noteId === request.node.noteId));
    if (!node) return;
    onSelectionChange(new Set([node.id]));
    const ancestors = new Set(findNotesTreeAncestorFolderIds(directory.noteTree, request.node));
    setCollapsedFolderIds((current) => new Set([...current].filter((id) => !ancestors.has(id))));
    directory.onConsumeFocusRequest(request.requestId);
  }, [directory.focusRequest, directory.noteTree, directory.onConsumeFocusRequest, onSelectionChange]);

  const createFolder = () => {
    submitNotesFolderCreation({
      directory,
      folderTitle,
      parentFolderId,
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
              appearance="plain"
              iconOnly
            >
              <RefreshCw aria-hidden="true" size={16} />
            </Button>
            <Button
              aria-label="新建文件夹"
              disabled={reloading}
              onClick={() => setCreatingFolder(true)}
              title="新建文件夹"
              type="button"
              appearance="plain"
              iconOnly
            >
              <FolderPlus aria-hidden="true" size={16} />
            </Button>
            <Button
              aria-label="新建笔记"
              disabled={reloading}
              onClick={() =>
                pages.created("notes", () =>
                  feedback.runAction(() => directory.createNote(parentFolderId)),
                )
              }
              title="新建笔记"
              type="button"
              appearance="plain"
              iconOnly
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
                sizing="fill"
                value={folderTitle}
                onChange={(event) => setFolderTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key !== "Escape" ||
                    event.nativeEvent.isComposing ||
                    event.nativeEvent.keyCode === 229
                  ) return;
                  event.preventDefault();
                  event.stopPropagation();
                  setCreatingFolder(false);
                }}
              />
            )}
          </FieldRow>
          <FormActions>
            <Button type="submit">确定</Button>
            <Button
              appearance="plain"
              onClick={() => setCreatingFolder(false)}
              type="button"
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
        contentKey={repositoryId}
        selectionMode="multiple"
        selectedIds={selectedIds}
        onSelectionChange={onSelectionChange}
        canMutate={directory.canMutate}
        collapsedFolderIds={collapsedFolderIds}
        nodes={directory.noteTree}
        onDeleteNode={deleteNode}
        onMoveNodes={directory.moveTreeNodes}
        onRenameNode={renameNode}
        onToggleFolder={toggleFolder}
      />
      {directory.noteTree.length === 0 ? (
        <EmptyState title="没有笔记。" />
      ) : null}
    </Stack>
  );
}

export function NotesContext(props: { onReload: () => Promise<void>; view: NotesViewModel; repositoryId: string; directorySelection: NotesDirectorySelection }) {
  return <NotesContextSession {...props} key={props.repositoryId} />;
}
