import { Button, Toolbar } from "compact-ui";
import type { NotesViewModel } from "../../../../application/workspace/index.ts";
import type { ActivitySlots } from "../../../ui/index.ts";
import { NoteDetailPanel } from "./NoteDetailPanel.tsx";
import { NoteEditorPanel } from "./NoteEditorPanel.tsx";
import { NotesContext } from "./NotesContext.tsx";

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
  onModeChange(mode: NotesMode, intent?: "preview" | "pinned"): void;
  repositoryName: string;
  structure: ActivitySlots;
}): ActivitySlots {
  const current =
    mode === "edit" ? edit : mode === "structure" ? structure : graph;

  return {
    context: {
      ...current.context,
      toolbar: (
        <Toolbar label="笔记工具">
          {notesModes.map(({ id, label }) => (
            <Button
              key={id}
              type="button"
              aria-pressed={mode === id}
              onClick={() => onModeChange(id, "preview")}
              onDoubleClick={() => onModeChange(id, "pinned")}
            >
              {label}
            </Button>
          ))}
        </Toolbar>
      ),
      content: current.context?.content ?? null,
      title: repositoryName,
    },
    detail: current.detail,
    // EditorState is owned by the page session. Hidden editor instances must not
    // outlive closed pages or keep writing snapshots behind another tool page.
    main: current.main,
  };
}

export function createNotesActivitySlots({
  onReload,
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
          layout: "canvas",
          content: <NoteDetailPanel view={view} />,
        }
      : null,
    main: {
      title: view.activeNote?.title ?? "笔记",
      layout: "document",
      content: <NoteEditorPanel view={view} />,
    },
  };
}
