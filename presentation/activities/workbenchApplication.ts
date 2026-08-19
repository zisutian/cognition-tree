import type { JournalApplication } from "../../application/journal/journalApplication";
import type { RepositoryApplication } from "../../application/repository/repositoryApplication";
import type { TodoApplication } from "../../application/todo/todoApplicationState";
import type { WorkspaceApplication } from "../workspace/runtime/useWorkspaceApplication";
import type { ApiAccessApplication } from "../../application/apiAccess/apiAccessAdministration";
import type {
  SearchControllerState,
} from "../../application/search/searchController";
import type {
  WorkbenchSearchFacade,
} from "../../application/workbench/workbenchController";
import type { SearchResult } from "../../application/search/searchTypes";
import type {
  ContentOpenOutcome,
} from "../../application/navigation/contentDestination";

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
  apiAccess: ApiAccessApplication;
  journal: JournalApplication;
  repository: RepositoryApplication;
  search: {
    controller: WorkbenchSearchFacade;
    openResult(result: SearchResult): ContentOpenOutcome;
    state: SearchControllerState;
  };
  todo: TodoApplication;
  workspace: WorkbenchWorkspaceState;
};
