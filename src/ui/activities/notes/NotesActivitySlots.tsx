import type { NotesViewModel } from "../../../application/workspace/activities/notes/notesViewModel";
import "../../styles/activities/notes.css";
import type { ActivitySlots } from "../../activityTypes";
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
    detail: view.editor.hasParsedDocument ? (
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
