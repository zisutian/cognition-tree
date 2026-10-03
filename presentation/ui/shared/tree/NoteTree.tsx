import {
  Button, QuickPick, Toolbar, Tree, TreeDragScope,
  type TreeDragScopeHandle, type TreeMoveRequest as FrameworkMoveRequest,
  type TreeMoveSession, type TreeMoveTarget, type TreeNode as UiTreeNode,
} from "compact-ui";
import { useRef, useState } from "react";
import { useFeedback } from "../FeedbackProvider.tsx";
import { canDropTreeNode, getTreeNodeReference } from "./drag.ts";
import type { NoteTreeProps, TreeNode, TreeMoveRequest } from "./types.ts";

const treeId = "note-directory";

/** Adapt workspace identities; selection and move interaction belong to the library. */
export function NoteTree(props: NoteTreeProps) {
  const feedback = useFeedback();
  const scopeRef = useRef<TreeDragScopeHandle>(null);
  const [pickerSession, setPickerSession] = useState<TreeMoveSession | null>(null);
  const index = new Map<string, TreeNode>();
  const expanded = new Set<string>();
  const convert = (nodes: TreeNode[]): UiTreeNode[] => nodes.map((node) => {
    index.set(node.id, node);
    if (node.kind === "folder" && !props.collapsedFolderIds?.has(node.folderId)) expanded.add(node.id);
    return {
      id: node.id, label: node.title,
      icon: node.kind === "note" ? props.renderNodeLeading?.(node, {
        hasChildren: false, isCollapsed: false, isFolder: false,
      }) : undefined,
      canHaveChildren: node.kind === "folder",
      children: node.kind === "folder" ? convert(node.children) : undefined,
    };
  });
  const nodes = convert(props.nodes);
  const request = (move: FrameworkMoveRequest): TreeMoveRequest | null => {
    if (move.source.treeId !== treeId || move.target.treeId !== treeId ||
      move.source.contentKey !== props.contentKey || move.target.contentKey !== props.contentKey ||
      move.source.nodeIds.length === 0 || !props.canMutate) return null;
    const sources = move.source.nodeIds.map((id) => index.get(id));
    if (sources.some((node) => !node || !node.canDrag || props.canDragNode?.(node) === false)) return null;
    const target = move.target.position === "root-end" ? null : index.get(move.target.nodeId);
    const destination = move.target.position === "root-end" ? { kind: "root" as const }
      : move.target.position === "inside" ? target?.kind === "folder"
        ? { kind: "inside" as const, folderId: target.folderId } : null
      : target ? { kind: move.target.position, target: getTreeNodeReference(target) } : null;
    return destination ? { sources: sources.map((node) => getTreeNodeReference(node!)), destination } : null;
  };
  const canDrop = (move: FrameworkMoveRequest) => {
    const value = request(move);
    return !!value && value.sources.every((source) => canDropTreeNode({
      source, destination: value.destination, nodes: props.nodes,
      canDropDestination: props.canDropDestination,
    }));
  };
  const closePicker = () => {
    const session = pickerSession;
    setPickerSession(null);
    if (session) queueMicrotask(() => scopeRef.current?.cancelMove(session.sessionId));
  };
  const options: { id: string; label: string; target: TreeMoveTarget }[] = [
    { id: "root", label: "根目录", target: { treeId, contentKey: props.contentKey, position: "root-end" as const } },
    ...[...index.values()].filter((node) => node.kind === "folder").map((node) => ({
      id: node.id, label: node.title,
      target: { treeId, contentKey: props.contentKey, nodeId: node.id, position: "inside" as const },
    })),
  ].filter((option) => !pickerSession || canDrop({ ...pickerSession, target: option.target }));
  return (
    <TreeDragScope ref={scopeRef} onMoveRequest={(move) => {
      try {
        const value = request(move);
        if (!value || !canDrop(move) || !props.onMoveNodes) throw new Error("无法移动目录项：源或目标已失效，请重新选择。");
        props.onMoveNodes(value);
        return { status: "success" };
      } catch (error) {
        return { status: "failure", message: error instanceof Error ? error.message : "无法移动目录项。" };
      }
    }}>
      {props.onMoveNodes && <Toolbar aria-label="目录移动操作">
        <Button type="button" appearance="plain" disabled={!props.canMutate || props.selectedIds.size === 0}
          onClick={() => {
            const session = scopeRef.current?.beginMove(treeId);
            if (session) setPickerSession(session);
          }}>移动选中项…</Button>
      </Toolbar>}
      <Tree aria-label="笔记目录" nodes={nodes}
        selectionMode={props.selectionMode ?? "single"}
        selectedIds={props.selectedIds} onSelectionChange={props.onSelectionChange}
        expandedIds={expanded}
        onOpen={(id, intent) => {
          const node = index.get(id);
          if (node?.kind === "note") props.onOpenNote?.(node.noteId, intent);
        }}
        onExpandedChange={(next) => {
          for (const node of index.values()) if (node.kind === "folder" && expanded.has(node.id) !== next.has(node.id)) props.onToggleFolder?.(node.folderId);
        }}
        capabilities={{ rename: !!props.onRenameNode && props.canMutate !== false, delete: !!props.onDeleteNode && props.canMutate !== false }}
        dragDrop={props.onMoveNodes ? {
          treeId, contentKey: props.contentKey, endDropLabel: "根目录末尾",
          canDrag: (id) => !!props.canMutate && !!index.get(id)?.canDrag && (props.canDragNode?.(index.get(id)!) ?? true),
          canDrop,
        } : undefined}
        onRename={(id, title) => props.onRenameNode?.(index.get(id)!, title)}
        onDelete={(id) => props.onDeleteNode?.(index.get(id)!)}
        onActionError={(error) => feedback.runAction(() => { throw error; })}
      />
      <QuickPick aria-label="移动到" open={pickerSession !== null && pickerSession.source.contentKey === props.contentKey}
        options={options} onClose={closePicker} onSelect={(id) => {
          const option = options.find((candidate) => candidate.id === id);
          if (pickerSession && option) void scopeRef.current?.requestMove({ ...pickerSession, target: option.target });
        }} />
    </TreeDragScope>
  );
}
