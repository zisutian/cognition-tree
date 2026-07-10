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
import type { StructureOperationActivityViewModel } from "../../../application/workspace/view-model/activityViewModels";
import {
  SegmentedControl,
  SymbolSlot,
} from "../../shared/primitives";
import {
  NoteTree,
  type TreeMoveRequest,
  type TreeNode,
} from "../../shared/tree";

type StructureOperationDirectoryMode = "betweenNotes" | "withinNote";
type StructureOperationNoteStatus = "source" | "structure" | "target" | "";
type StructureOperationPairSelectionPhase = "selectSource" | "selectTarget";

export function getStructureOperationDirectoryNoteStatus({
  mode,
  noteId,
  pairSelectionPhase,
  pendingSourceNoteId,
  sourceNoteId,
  structureNoteId,
  targetNoteId,
}: {
  mode: StructureOperationDirectoryMode;
  noteId: string;
  pairSelectionPhase: StructureOperationPairSelectionPhase;
  pendingSourceNoteId: string | null;
  sourceNoteId: string;
  structureNoteId: string;
  targetNoteId: string;
}) {
  if (mode === "withinNote") {
    return noteId === structureNoteId ? "structure" : "";
  }

  const activeSourceNoteId =
    pairSelectionPhase === "selectTarget"
      ? pendingSourceNoteId ?? sourceNoteId
      : sourceNoteId;

  if (noteId === activeSourceNoteId) {
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
    <SymbolSlot
      aria-label={labelByStatus[status]}
      className="ui-tree-status"
      title={labelByStatus[status]}
      tone="strong"
    >
      {status === "source" ? <FileOutput {...iconProps} /> : null}
      {status === "target" ? <FileInput {...iconProps} /> : null}
      {status === "structure" ? <GitBranch {...iconProps} /> : null}
    </SymbolSlot>
  );
}

export function canPairStructureOperationDirectoryNodes(
  source: TreeMoveRequest["source"],
  target: TreeMoveRequest["target"],
) {
  return source.kind === "note" && target.kind === "note";
}

export function StructureOperationContext({
  view,
}: {
  view: StructureOperationActivityViewModel;
}) {
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [pairSelectionPhase, setPairSelectionPhase] =
    useState<StructureOperationPairSelectionPhase>("selectSource");
  const [pendingSourceNoteId, setPendingSourceNoteId] = useState<string | null>(
    null,
  );
  const resetPairSelection = () => {
    setPairSelectionPhase("selectSource");
    setPendingSourceNoteId(null);
  };
  const moveNode = (request: TreeMoveRequest) => {
    if (request.source.kind !== "note" || request.target.kind !== "note") {
      return;
    }

    view.onPairNotesForStructureOperation(
      request.source.noteId,
      request.target.noteId,
    );
    resetPairSelection();
  };
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
    if (view.mode === "withinNote") {
      view.onSelectStructureNote(noteId);
      return;
    }

    if (pairSelectionPhase === "selectTarget") {
      const sourceNoteId = pendingSourceNoteId ?? view.sourceNoteId;

      if (noteId === sourceNoteId) {
        return;
      }

      view.onPairNotesForStructureOperation(sourceNoteId, noteId);
      resetPairSelection();
      return;
    }

    view.onSelectSourceNote(noteId);
    setPendingSourceNoteId(noteId);
    setPairSelectionPhase("selectTarget");
  };
  const getNoteStatus = (node: Extract<TreeNode, { kind: "note" }>) => {
    return getStructureOperationDirectoryNoteStatus({
      mode: view.mode,
      noteId: node.noteId,
      pairSelectionPhase,
      pendingSourceNoteId,
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
      : pairSelectionPhase === "selectTarget"
        ? pendingSourceNoteId ?? view.sourceNoteId
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
        onChange={(nextMode) => {
          view.onSetMode(nextMode);
          resetPairSelection();
        }}
      />
      <NoteTree
        activeNode={activeNoteId ? { kind: "note", noteId: activeNoteId } : null}
        canDragNode={(node) => node.kind === "note"}
        canDropNode={canPairStructureOperationDirectoryNodes}
        collapsedFolderIds={collapsedFolderIds}
        nodes={view.noteTree}
        renderNodeLeading={renderNodeLeading}
        onDeleteNode={deleteNode}
        onMoveNode={moveNode}
        onRenameNode={renameNode}
        onSelectNote={selectNote}
        onToggleFolder={toggleFolder}
      />
    </div>
  );
}
