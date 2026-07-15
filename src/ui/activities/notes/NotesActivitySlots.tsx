import type { NotesViewModel } from "../../../application/workspace/activities/notes/notesViewModel";
import "../../styles/activities/notes.css";
import type { ActivitySlots } from "../../activityTypes";
import {
  NoteDetailPanel,
  NoteEditorPanel,
  NotesContext,
} from "./NotesPanels";

export function createNotesActivitySlots({
  onCollapseDetail,
  view,
}: {
  onCollapseDetail: () => void;
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
    main: <NoteEditorPanel view={view} />,
  };
}
