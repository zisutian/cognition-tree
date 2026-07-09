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
import type { ViewModel } from "../../../application/workspace/view-model/useViewModel";
import {
  SegmentedControl,
  SymbolSlot,
} from "../../shared/primitives";
import {
  NoteTree,
  type TreeMoveRequest,
  type TreeNode,
} from "../../shared/tree";

type StructureOperationDirectoryMode = "pair" | "structure";
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
  if (mode === "structure") {
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

function promptText(label: string, value = "") {
  return window.prompt(label, value)?.trim() ?? "";
}

export function StructureOperationContext({ view }: { view: ViewModel }) {
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

    view.migration.onPairNotesForMigration(
      request.source.noteId,
      request.target.noteId,
    );
    resetPairSelection();
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
  const selectNote = (noteId: string) => {
    if (view.migration.mode === "structure") {
      view.migration.onSelectStructureNote(noteId);
      return;
    }

    if (pairSelectionPhase === "selectTarget") {
      const sourceNoteId = pendingSourceNoteId ?? view.migration.sourceNoteId;

      if (noteId === sourceNoteId) {
        return;
      }

      view.migration.onPairNotesForMigration(sourceNoteId, noteId);
      resetPairSelection();
      return;
    }

    view.migration.onSelectMigrationSourceNote(noteId);
    setPendingSourceNoteId(noteId);
    setPairSelectionPhase("selectTarget");
  };
  const getNoteStatus = (node: Extract<TreeNode, { kind: "note" }>) => {
    return getStructureOperationDirectoryNoteStatus({
      mode: view.migration.mode,
      noteId: node.noteId,
      pairSelectionPhase,
      pendingSourceNoteId,
      sourceNoteId: view.migration.sourceNoteId,
      structureNoteId: view.migration.structureNoteId,
      targetNoteId: view.migration.targetNoteId,
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
    view.migration.mode === "structure"
      ? view.migration.structureNoteId
      : pairSelectionPhase === "selectTarget"
        ? pendingSourceNoteId ?? view.migration.sourceNoteId
        : view.migration.sourceNoteId;

  return (
    <div className="activity-context-content">
      <SegmentedControl
        ariaLabel="结构操作模式"
        fill
        options={[
          { label: "源笔记 / 目标笔记", value: "pair" },
          { label: "笔记结构", value: "structure" },
        ]}
        value={view.migration.mode}
        onChange={(nextMode) => {
          view.migration.onSetMigrationMode(nextMode);
          resetPairSelection();
        }}
      />
      <NoteTree
        actions={actions}
        activeNode={activeNoteId ? { kind: "note", noteId: activeNoteId } : null}
        canDragNode={(node) => node.kind === "note"}
        canDropNode={canPairStructureOperationDirectoryNodes}
        collapsedFolderIds={collapsedFolderIds}
        nodes={view.migration.noteTree}
        renderNodeLeading={renderNodeLeading}
        onMoveNode={moveNode}
        onSelectNote={selectNote}
        onToggleFolder={toggleFolder}
      />
    </div>
  );
}
