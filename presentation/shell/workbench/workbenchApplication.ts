import type { JournalApplication } from "../../../application/journal/journalApplication";
import type { RepositoryApplication } from "../../../application/repository/repositoryApplication";
import type { TodoApplication } from "../../../application/todo/todoApplicationState";
import type { WorkspaceApplication } from "../bindings/application/workspace/runtime/useWorkspaceApplication";

export type WorkbenchWorkspaceState =
  | { status: "absent" }
  | { status: "loading"; storageLabel: string }
  | {
      errorMessage: string;
      retry: () => Promise<void>;
      status: "failed";
      storageLabel: string;
    }
  | { application: WorkspaceApplication; status: "ready" };

export type WorkbenchApplication = {
  journal: JournalApplication;
  repository: RepositoryApplication;
  todo: TodoApplication;
  workspace: WorkbenchWorkspaceState;
};
