import type { NotesViewModel } from "../../../../application/workspace/activities/notes/notesViewModel";
import "../../../ui/styles/activities/notes.css";
import type { ActivitySlots } from "../../../ui/activityTypes";
import {
  NoteDetailPanel,
  NoteEditorPanel,
  NotesContext,
} from "./NotesPanels";

export function createNotesActivitySlots({
  focusMode,
  onCollapseDetail,
  onToggleFocusMode,
  view,
}: {
  focusMode: boolean;
  onCollapseDetail: () => void;
  onToggleFocusMode: () => void;
  view: NotesViewModel;
}): ActivitySlots {
  return {
    context: {
      content: <NotesContext view={view} />,
      title: "笔记",
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
