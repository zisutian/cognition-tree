import type { JournalApplication } from "../journal/journalApplication";
import type { RepositoryApplication } from "../repository/repositoryApplication";
import type { TodoApplication } from "../todo/useTodoApplication";
import type { WorkspaceApplication } from "../workspace/runtime/useWorkspaceApplication";

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
