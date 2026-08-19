import type { NotesViewModel } from "../../../../application/workspace/notes/edit/notesViewModel";
import "./notes.css";
import type { ActivitySlots } from "../../../ui/activityTypes";
import { SegmentedControl } from "../../../ui/shared/primitives";
import { NoteDetailPanel } from "./NoteDetailPanel";
import { NoteEditorPanel } from "./NoteEditorPanel";
import { NotesContext } from "./NotesContext";

export type NotesMode = "edit" | "graph" | "structure";

const notesModes = [
  { id: "edit", label: "编辑" },
  { id: "structure", label: "结构" },
  { id: "graph", label: "图谱" },
] as const satisfies ReadonlyArray<{ id: NotesMode; label: string }>;

export function createNotesWorkspaceActivitySlots({
  edit,
  graph,
  mode,
  onModeChange,
  repositoryName,
  structure,
}: {
  edit: ActivitySlots;
  graph: ActivitySlots;
  mode: NotesMode;
  onModeChange(mode: NotesMode): void;
  repositoryName: string;
  structure: ActivitySlots;
}): ActivitySlots {
  const current = mode === "edit"
    ? edit
    : mode === "structure"
      ? structure
      : graph;

  return {
    context: {
      content: (
        <div className="notes-workspace-context">
          <SegmentedControl
            ariaLabel="笔记视图"
            className="notes-mode-switch"
            fill
            options={notesModes.map(({ id, label }) => ({
              label,
              value: id,
            }))}
            value={mode}
            onChange={onModeChange}
          />
          <div className="notes-mode-context">
            {current.context?.content ?? null}
          </div>
        </div>
      ),
      title: repositoryName,
    },
    detail: current.detail,
    main: (
      <div className="notes-workspace-main">
        <section
          aria-label="编辑视图"
          className="notes-mode-panel"
          hidden={mode !== "edit"}
        >
          {edit.main}
        </section>
        {mode === "structure"
          ? (
            <section
              aria-label="结构视图"
              className="notes-mode-panel"
            >
              {structure.main}
            </section>
          )
          : null}
        {mode === "graph"
          ? (
            <section
              aria-label="图谱视图"
              className="notes-mode-panel"
            >
              {graph.main}
            </section>
          )
          : null}
      </div>
    ),
  };
}

export function createNotesActivitySlots({
  focusMode,
  onCollapseDetail,
  onToggleFocusMode,
  repositoryName,
  view,
}: {
  focusMode: boolean;
  onCollapseDetail: () => void;
  onToggleFocusMode: () => void;
  repositoryName: string;
  view: NotesViewModel;
}): ActivitySlots {
  return {
    context: {
      content: <NotesContext view={view} />,
      title: repositoryName,
    },
    detail: view.activeNote ? (
      <NoteDetailPanel onCollapseDetail={onCollapseDetail} view={view} />
    ) : null,
    main: (
      <NoteEditorPanel
        focusMode={focusMode}
        onToggleFocusMode={onToggleFocusMode}
        view={view}
      />
    ),
  };
}
