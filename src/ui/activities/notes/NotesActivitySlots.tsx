import type { NotesViewModel } from "../../../application/workspace/activities/notes/notesViewModel";
import type { WorkspaceShell } from "../../../application/workspace/runtime/useWorkspaceApplication";
import type { ActivitySlots } from "../../activityTypes";
import { WorkspaceSyntaxSetupView } from "../../WorkspaceSyntaxSetupView";
import {
  NoteDetailPanel,
  NoteEditorPanel,
  NotesContext,
} from "./NotesPanels";

export function createNotesActivitySlots({
  onCollapseDetail,
  onConfigureSyntax,
  shell,
  view,
}: {
  onCollapseDetail: () => void;
  onConfigureSyntax: () => void;
  shell: WorkspaceShell;
  view: NotesViewModel;
}): ActivitySlots {
  const syntaxSetup = (
    <WorkspaceSyntaxSetupView
      errorMessage={shell.errorMessage}
      onConfigureSyntax={onConfigureSyntax}
      onUseDefaultSyntax={shell.useDefaultSyntax}
    />
  );
  const isReady = shell.hasConfiguredSyntax && view.editor.hasParsedDocument;

  return {
    context: {
      content: <NotesContext view={view} />,
      title: "笔记",
    },
    detail: isReady ? (
      <NoteDetailPanel onCollapseDetail={onCollapseDetail} view={view} />
    ) : null,
    main: isReady ? <NoteEditorPanel view={view} /> : syntaxSetup,
  };
}
