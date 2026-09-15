import type { NotesViewModel } from "../../../../application/workspace/index.ts";
import type { ActivitySlots } from "../../../ui/index.ts";
import {
  ChoiceGroup,
  createClassNames,
  FocusAction,
} from "../../../ui/index.ts";
import { NoteDetailPanel } from "./NoteDetailPanel.tsx";
import { NoteEditorPanel } from "./NoteEditorPanel.tsx";
import notesStyles from "./notes.module.css";
import { NotesContext } from "./NotesContext.tsx";
const cx = createClassNames(notesStyles);

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
  const current =
    mode === "edit" ? edit : mode === "structure" ? structure : graph;

  return {
    context: {
      toolbar: (
        <ChoiceGroup
          ariaLabel="笔记视图"
          mode="single"
          options={notesModes.map(({ id, label }) => ({
            label,
            value: id,
          }))}
          value={mode}
          onChange={onModeChange}
        />
      ),
      content: (
        <div className={cx("notes-workspace-context")}>
          <div className={cx("notes-mode-context")}>
            {current.context?.content ?? null}
          </div>
        </div>
      ),
      title: repositoryName,
    },
    detail: current.detail,
    main: {
      title: current.main.title,
      layout: current.main.layout,
      actions: current.main.actions,
      content: (
        <div className={cx("notes-workspace-main")}>
          <section
            aria-label="编辑视图"
            className={cx("notes-mode-panel")}
            hidden={mode !== "edit"}
          >
            {edit.main.content}
          </section>
          {mode === "structure" ? (
            <section aria-label="结构视图" className={cx("notes-mode-panel")}>
              {structure.main.content}
            </section>
          ) : null}
          {mode === "graph" ? (
            <section aria-label="图谱视图" className={cx("notes-mode-panel")}>
              {graph.main.content}
            </section>
          ) : null}
        </div>
      ),
    },
  };
}

export function createNotesActivitySlots({
  focusMode,
  onReload,
  onToggleFocusMode,
  repositoryName,
  view,
}: {
  focusMode: boolean;
  onReload: () => Promise<void>;
  onToggleFocusMode: () => void;
  repositoryName: string;
  view: NotesViewModel;
}): ActivitySlots {
  return {
    context: {
      content: <NotesContext onReload={onReload} view={view} />,
      title: repositoryName,
    },
    detail: view.activeNote
      ? {
          title: "结构",
          layout: "detail",
          content: <NoteDetailPanel view={view} />,
        }
      : null,
    main: {
      title: view.activeNote?.title ?? "笔记",
      layout: "document",
      actions: <FocusAction active={focusMode} onToggle={onToggleFocusMode} />,
      content: <NoteEditorPanel view={view} />,
    },
  };
}
