import { useEffect, useState } from "react";
import type { NoteId } from "../../workspace/model/workspaceData";
import {
  findWorkspaceNote,
  getWorkspaceTree,
  listWorkspaceNoteSummaries,
  listWorkspaceNotes,
} from "../../workspace/queries/workspaceQueries";
import type { WorkspaceBlockMigrationRequest } from "../../workspace/workflows/blockMigrationWorkflow";
import type { WorkspaceRuntime } from "../../workspace/runtime/workspaceRuntime";
import { BlockMigrationView } from "./BlockMigrationView";
import { NoteSelectionView } from "./NoteSelectionView";

type MigrationMode = "note" | "block";

type BlockMigrationWorkspacePanelProps = {
  activeNoteId: NoteId | null;
  onMoveNoteBlock: (request: WorkspaceBlockMigrationRequest) => {
    message: string;
    status: "failed" | "moved";
  };
  workspace: WorkspaceRuntime;
};

export function BlockMigrationWorkspacePanel({
  activeNoteId,
  onMoveNoteBlock,
  workspace,
}: BlockMigrationWorkspacePanelProps) {
  const notes = listWorkspaceNotes(workspace);
  const [mode, setMode] = useState<MigrationMode>("note");
  const [sourceNoteId, setSourceNoteId] = useState("");
  const [targetNoteId, setTargetNoteId] = useState("");

  useEffect(() => {
    if (sourceNoteId && findWorkspaceNote(workspace, sourceNoteId)) {
      return;
    }

    if (activeNoteId && findWorkspaceNote(workspace, activeNoteId)) {
      setSourceNoteId(activeNoteId);
      return;
    }

    setSourceNoteId(notes[0]?.id ?? "");
  }, [activeNoteId, notes, sourceNoteId, workspace]);

  useEffect(() => {
    if (
      targetNoteId &&
      targetNoteId !== sourceNoteId &&
      findWorkspaceNote(workspace, targetNoteId)
    ) {
      return;
    }

    setTargetNoteId(notes.find((note) => note.id !== sourceNoteId)?.id ?? "");
  }, [notes, sourceNoteId, targetNoteId, workspace]);

  const noteRecords = listWorkspaceNoteSummaries(workspace);

  return (
    <section
      className="workspace-main-panel migration-full-width migration-workspace-panel"
      aria-label="块迁移"
    >
      <header className="panel-header">
        <div>
          <h2>块迁移</h2>
        </div>
        <div className="stats">
          <span>拖拽释放即迁移</span>
        </div>
      </header>

      <div className="migration-mode-tabs">
        <button
          type="button"
          className={`migration-mode-tab ${mode === "note" ? "is-active" : ""}`}
          onClick={() => setMode("note")}
        >
          笔记选择
        </button>
        <button
          type="button"
          className={`migration-mode-tab ${mode === "block" ? "is-active" : ""}`}
          onClick={() => setMode("block")}
        >
          块迁移
        </button>
      </div>

      {mode === "note" ? (
        <NoteSelectionView
          noteTree={getWorkspaceTree(workspace)}
          notes={noteRecords}
          sourceNoteId={sourceNoteId}
          targetNoteId={targetNoteId}
          onSourceNoteChange={setSourceNoteId}
          onTargetNoteChange={setTargetNoteId}
          onComplete={() => setMode("block")}
        />
      ) : (
        <BlockMigrationView
          onMoveNoteBlock={onMoveNoteBlock}
          sourceNoteId={sourceNoteId}
          targetNoteId={targetNoteId}
          workspace={workspace}
        />
      )}
    </section>
  );
}
