import { Tree, type TreeNode as UiTreeNode, type TreeMove } from "compact-ui";
import { useFeedback } from "../FeedbackProvider.tsx";
import { canDropTreeNode, getTreeNodeReference } from "./drag.ts";
import type { NoteTreeProps, TreeNode, TreeMoveRequest } from "./types.ts";

/** Translate workspace identities and commands; all directory interaction belongs to the library. */
export function NoteTree(props: NoteTreeProps) {
  const feedback = useFeedback();
  const index = new Map<string, TreeNode>();
  const expanded = new Set<string>();
  const convert = (nodes: TreeNode[]): UiTreeNode[] =>
    nodes.map((node) => {
      index.set(node.id, node);
      if (
        node.kind === "folder" &&
        !props.collapsedFolderIds?.has(node.folderId)
      )
        expanded.add(node.id);
      return {
        id: node.id,
        label: node.title,
        icon:
          node.kind === "note"
            ? props.renderNodeLeading?.(node, {
                hasChildren: false,
                isCollapsed: false,
                isFolder: false,
              })
            : undefined,
        canHaveChildren: node.kind === "folder",
        children: node.kind === "folder" ? convert(node.children) : undefined,
      };
    });
  const nodes = convert(props.nodes);
  const selected = [...index.values()].find(
    (node) =>
      node.kind === props.activeNode?.kind &&
      (node.kind === "note" && props.activeNode.kind === "note"
        ? node.noteId === props.activeNode.noteId
        : node.kind === "folder" &&
          props.activeNode.kind === "folder" &&
          node.folderId === props.activeNode.folderId),
  );
  const request = (move: TreeMove): TreeMoveRequest | null => {
    const source = index.get(move.sourceId);
    if (!source) return null;
    const target =
      move.target.position === "root" ? null : index.get(move.target.id);
    const destination =
      move.target.position === "root"
        ? { kind: "root" as const }
        : move.target.position === "inside"
          ? target?.kind === "folder"
            ? { kind: "inside" as const, folderId: target.folderId }
            : null
          : target
            ? {
                kind: move.target.position,
                target: getTreeNodeReference(target),
              }
            : null;
    return destination
      ? { source: getTreeNodeReference(source), destination }
      : null;
  };
  return (
    <Tree
      label="笔记目录"
      nodes={nodes}
      selectedId={selected?.id ?? null}
      expandedIds={expanded}
      onSelect={(id) => {
        const node = id ? index.get(id) : null;
        if (node?.kind === "folder") props.onSelectFolder?.(node.folderId);
        else if (!node) props.onClearSelection?.();
      }}
      onOpen={(id, intent) => {
        const node = index.get(id);
        if (node?.kind === "note") {
          if (props.onOpenNote) props.onOpenNote(node.noteId, intent);
          else props.onSelectNote?.(node.noteId);
        }
      }}
      onExpandedChange={(next) => {
        for (const node of index.values())
          if (
            node.kind === "folder" &&
            expanded.has(node.id) !== next.has(node.id)
          )
            props.onToggleFolder?.(node.folderId);
      }}
      capabilities={{
        rename: !!props.onRenameNode,
        delete: !!props.onDeleteNode,
        drag: (node) => {
          const original = index.get(node.id)!;
          return (
            !!props.onMoveNode &&
            original.canDrag &&
            (props.canDragNode?.(original) ?? true)
          );
        },
      }}
      canDrop={(move) => {
        const value = request(move);
        return (
          !!value &&
          canDropTreeNode({
            source: value.source,
            destination: value.destination,
            nodes: props.nodes,
            canDropDestination: props.canDropDestination,
          })
        );
      }}
      onRename={(id, title) => props.onRenameNode?.(index.get(id)!, title)}
      onDelete={(id) => props.onDeleteNode?.(index.get(id)!)}
      onMove={(move) => {
        const value = request(move);
        if (value) props.onMoveNode?.(value);
      }}
      onActionError={(error) =>
        feedback.runAction(() => {
          throw error;
        })
      }
    />
  );
}
