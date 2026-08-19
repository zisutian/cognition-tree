import {
  ChevronDown,
  ChevronRight,
  FileInput,
  FileOutput,
  FileText,
  Folder,
  GitBranch,
} from "lucide-react";
import { useState } from "react";
import type { StructureOperationActivityViewModel } from "../../../../application/workspace/notes/structure/structureOperationViewModel";
import { SegmentedControl } from "../../../ui/shared/primitives";
import { CompactContextStatusIcon } from
  "../../../ui/shared/CompactContextList";
import {
  NoteTree,
  TreeMoveQuickPick,
  type TreeNode,
} from "../../../ui/shared/tree";

type StructureOperationDirectoryMode = "betweenNotes" | "withinNote";
type StructureOperationNoteStatus = "source" | "structure" | "target" | "";

export function getStructureOperationDirectoryNoteStatus({
  mode,
  noteId,
  pairSelectionPhase,
  sourceNoteId,
  structureNoteId,
  targetNoteId,
}: {
  mode: StructureOperationDirectoryMode;
  noteId: string;
  pairSelectionPhase: StructureOperationActivityViewModel["pairSelectionPhase"];
  sourceNoteId: string;
  structureNoteId: string;
  targetNoteId: string;
}) {
  if (mode === "withinNote") {
    return noteId === structureNoteId ? "structure" : "";
  }

  if (noteId === sourceNoteId) {
    return "source";
  }

  return pairSelectionPhase === "selectSource" && noteId === targetNoteId
    ? "target"
    : "";
}

function StructureOperationDirectoryStatusIcon({
  status,
}: {
  status: Exclude<StructureOperationNoteStatus, "">;
}) {
  const iconProps = {
    "aria-hidden": true,
    size: 13,
    strokeWidth: 2,
  };
  const labelByStatus = {
    source: "源笔记",
    structure: "笔记结构",
    target: "目标笔记",
  };

  return (
    <CompactContextStatusIcon label={labelByStatus[status]}>
      {status === "source" ? <FileOutput {...iconProps} /> : null}
      {status === "target" ? <FileInput {...iconProps} /> : null}
      {status === "structure" ? <GitBranch {...iconProps} /> : null}
    </CompactContextStatusIcon>
  );
}

export function StructureOperationContext({
  view,
}: {
  view: StructureOperationActivityViewModel;
}) {
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [moveNode, setMoveNode] = useState<TreeNode | null>(null);
  const renameNode = (node: TreeNode, title: string) => {
    if (node.kind === "folder") {
      view.renameFolder(node.folderId, title);
    } else {
      view.renameNote(node.noteId, title);
    }
  };
  const deleteNode = (node: TreeNode) => {
    if (node.kind === "folder") {
      view.deleteFolder(node.folderId);
    } else {
      view.deleteNote(node.noteId);
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
  const selectNote = (noteId: string) => {
    view.onSelectDirectoryNote(noteId);
  };
  const getNoteStatus = (node: Extract<TreeNode, { kind: "note" }>) => {
    return getStructureOperationDirectoryNoteStatus({
      mode: view.mode,
      noteId: node.noteId,
      pairSelectionPhase: view.pairSelectionPhase,
      sourceNoteId: view.sourceNoteId,
      structureNoteId: view.structureNoteId,
      targetNoteId: view.targetNoteId,
    });
  };
  const renderNodeLeading = (
    node: TreeNode,
    state: { hasChildren: boolean; isCollapsed: boolean },
  ) => {
    if (node.kind === "folder") {
      return (
        <>
          {state.hasChildren ? (
            state.isCollapsed ? (
              <ChevronRight aria-hidden="true" size={13} />
            ) : (
              <ChevronDown aria-hidden="true" size={13} />
            )
          ) : (
            <span aria-hidden="true" className="ui-tree-toggle-spacer" />
          )}
          <Folder aria-hidden="true" size={13} />
        </>
      );
    }

    const status = getNoteStatus(node);

    return (
      <>
        <span aria-hidden="true" className="ui-tree-toggle-spacer" />
        {status ? (
          <StructureOperationDirectoryStatusIcon status={status} />
        ) : (
          <FileText aria-hidden="true" size={13} />
        )}
      </>
    );
  };
  const activeNoteId =
    view.mode === "withinNote"
      ? view.structureNoteId
      : view.sourceNoteId;

  return (
    <div className="activity-context-content">
      <SegmentedControl
        ariaLabel="结构操作模式"
        fill
        options={[
          { label: "源笔记 / 目标笔记", value: "betweenNotes" },
          { label: "笔记结构", value: "withinNote" },
        ]}
        value={view.mode}
        onChange={view.onSetMode}
      />
      <NoteTree
        activeNode={activeNoteId ? { kind: "note", noteId: activeNoteId } : null}
        collapsedFolderIds={collapsedFolderIds}
        nodes={view.noteTree}
        renderNodeLeading={renderNodeLeading}
        onDeleteNode={deleteNode}
        onMoveNode={view.moveTreeNode}
        onRenameNode={renameNode}
        onRequestMoveNode={setMoveNode}
        onSelectNote={selectNote}
        onToggleFolder={toggleFolder}
      />
      <TreeMoveQuickPick
        nodes={view.noteTree}
        sourceNode={moveNode}
        onClose={() => setMoveNode(null)}
        onMove={view.moveTreeNode}
      />
    </div>
  );
}
