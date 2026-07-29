import type { NotesViewModel } from "../../../../application/workspace/activities/notes/notesViewModel";
import "../../../ui/styles/activities/notes.css";
import type { ActivitySlots } from "../../../ui/activityTypes";
import {
  NoteDetailPanel,
  NoteEditorPanel,
  NotesContext,
} from "./NotesPanels";

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
  structure,
}: {
  edit: ActivitySlots;
  graph: ActivitySlots;
  mode: NotesMode;
  onModeChange(mode: NotesMode): void;
  structure: ActivitySlots;
}): ActivitySlots {
  const current = mode === "edit"
    ? edit
    : mode === "structure"
      ? structure
      : graph;

  return {
    context: current.context,
    detail: current.detail,
    main: (
      <div className="notes-workspace-main">
        <div
          aria-label="笔记视图"
          className="notes-mode-tabs"
          role="tablist"
        >
          {notesModes.map(({ id, label }) => (
            <button
              aria-controls={`notes-mode-panel-${id}`}
              aria-selected={mode === id}
              className={mode === id ? "is-active" : undefined}
              id={`notes-mode-tab-${id}`}
              key={id}
              onClick={() => onModeChange(id)}
              role="tab"
              tabIndex={mode === id ? 0 : -1}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <section
          aria-labelledby="notes-mode-tab-edit"
          className="notes-mode-panel"
          hidden={mode !== "edit"}
          id="notes-mode-panel-edit"
          role="tabpanel"
        >
          {edit.main}
        </section>
        {mode === "structure"
          ? (
            <section
              aria-labelledby="notes-mode-tab-structure"
              className="notes-mode-panel"
              id="notes-mode-panel-structure"
              role="tabpanel"
            >
              {structure.main}
            </section>
          )
          : null}
        {mode === "graph"
          ? (
            <section
              aria-labelledby="notes-mode-tab-graph"
              className="notes-mode-panel"
              id="notes-mode-panel-graph"
              role="tabpanel"
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
