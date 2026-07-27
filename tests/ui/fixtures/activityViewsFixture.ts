import type { JournalViewModel } from "../../../application/journal";
import type { RepositoryViewModel } from "../../../application/repository/repositoryViewModel";
import type { SyntaxViewModel } from "../../../application/syntax/syntaxViewModel";
import type { TodoViewModel } from "../../../application/todo";
import type {
  NotesViewModel,
} from "../../../application/workspace/activities/notes/notesViewModel";
import type {
  StructureOperationActivityViewModel,
} from "../../../application/workspace/activities/structure-operation/structureOperationViewModel";
import type {
  VisualizationViewModel,
} from "../../../application/workspace/activities/visualization/visualizationViewModel";
import type {
  WorkspaceShell,
} from "../../../presentation/activities/bindings/workspace/runtime/useWorkspaceApplication";
import { createJournalView } from "./journalViewFixture";
import { createNotesView } from "./notesViewFixture";
import { createRepositoryView } from "./repositoryViewFixture";
import { createStructureOperationView } from "./structureOperationViewFixture";
import { createSyntaxView } from "./syntaxViewFixture";
import { createTodoView } from "./todoViewFixture";
import { createVisualizationView } from "./visualizationViewFixture";
import { createWorkspaceShell } from "./workspaceShellFixture";

export type TestActivityViews = {
  journal: JournalViewModel;
  notes: NotesViewModel;
  repository: RepositoryViewModel;
  shell: WorkspaceShell;
  structureOperation: StructureOperationActivityViewModel;
  syntax: SyntaxViewModel;
  todo: TodoViewModel;
  visualization: VisualizationViewModel;
};

export function createActivityViews(
  overrides: Partial<TestActivityViews> = {},
): TestActivityViews {
  return {
    journal: createJournalView(),
    notes: createNotesView(),
    repository: createRepositoryView(),
    shell: createWorkspaceShell(),
    structureOperation: createStructureOperationView(),
    syntax: createSyntaxView(),
    todo: createTodoView(),
    visualization: createVisualizationView(),
    ...overrides,
  };
}
