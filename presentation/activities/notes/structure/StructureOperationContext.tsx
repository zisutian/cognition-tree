import { ChoiceGroup, Stack } from "compact-ui";
import { FileInput, FileOutput, FileText, GitBranch } from "lucide-react";
import { useState } from "react";
import type { StructureOperationActivityViewModel } from "../../../../application/workspace/index.ts";
import { SymbolSlot, NoteTree, type TreeNode } from "../../../ui/index.ts";

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
    <SymbolSlot aria-label={labelByStatus[status]}>
      {status === "source" ? <FileOutput {...iconProps} /> : null}
      {status === "target" ? <FileInput {...iconProps} /> : null}
      {status === "structure" ? <GitBranch {...iconProps} /> : null}
    </SymbolSlot>
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
  const renderNodeLeading = (node: TreeNode) => {
    if (node.kind === "folder") return null;

    const status = getNoteStatus(node);

    return status ? (
      <StructureOperationDirectoryStatusIcon status={status} />
    ) : (
      <FileText aria-hidden="true" size={13} />
    );
  };
  const activeNoteId =
    view.mode === "withinNote" ? view.structureNoteId : view.sourceNoteId;

  return (
    <Stack fill>
      <ChoiceGroup
        ariaLabel="结构操作模式"
        mode="single"
        options={[
          { label: "笔记间迁移", value: "betweenNotes" },
          { label: "笔记内迁移", value: "withinNote" },
        ]}
        value={view.mode}
        onChange={view.onSetMode}
      />
      <NoteTree
        activeNode={
          activeNoteId ? { kind: "note", noteId: activeNoteId } : null
        }
        collapsedFolderIds={collapsedFolderIds}
        nodes={view.noteTree}
        renderNodeLeading={renderNodeLeading}
        onDeleteNode={deleteNode}
        onMoveNode={view.moveTreeNode}
        onRenameNode={renameNode}
        onSelectNote={selectNote}
        onToggleFolder={toggleFolder}
      />
    </Stack>
  );
}
