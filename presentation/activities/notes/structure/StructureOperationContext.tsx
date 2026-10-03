import { ChoiceGroup, Stack } from "compact-ui";
import { FileInput, FileOutput, FileText, GitBranch } from "lucide-react";
import { useState } from "react";
import type { StructureOperationActivityViewModel } from "../../../../application/workspace/index.ts";
import { NoteTree, type TreeNode } from "../../../ui/index.ts";
import type { NotesDirectorySelection } from "../useNotesDirectorySelection.ts";

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
  const labelByStatus = {
    source: "源笔记",
    structure: "笔记结构",
    target: "目标笔记",
  };
  const Icon =
    status === "source"
      ? FileOutput
      : status === "target"
        ? FileInput
        : GitBranch;
  return <Icon role="img" aria-label={labelByStatus[status]} />;
}

export function StructureOperationContext({
  view,
  directorySelection,
}: {
  view: StructureOperationActivityViewModel;
  directorySelection: NotesDirectorySelection;
}) {
  const { selectedIds, onSelectionChange } = directorySelection;
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
      <FileText aria-hidden="true" />
    );
  };
  return (
    <Stack fill>
      <ChoiceGroup
        aria-label="结构操作模式"
        mode="single"
        options={[
          { label: "笔记间迁移", value: "betweenNotes" },
          { label: "笔记内迁移", value: "withinNote" },
        ]}
        value={view.mode}
        onChange={view.onSetMode}
      />
      <NoteTree
        contentKey={view.repositoryId}
        selectedIds={selectedIds}
        onSelectionChange={onSelectionChange}
        selectionMode="multiple"
        canMutate={view.canMutate}
        collapsedFolderIds={collapsedFolderIds}
        nodes={view.noteTree}
        renderNodeLeading={renderNodeLeading}
        onDeleteNode={deleteNode}
        onMoveNodes={view.moveTreeNodes}
        onRenameNode={renameNode}
        onOpenNote={selectNote}
        onToggleFolder={toggleFolder}
      />
    </Stack>
  );
}
