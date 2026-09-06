// SPDX-License-Identifier: GPL-3.0-or-later

import type { SearchActivityApplication } from "../../activities/search/SearchActivityController";
import type { WorkbenchWorkspaceState } from "../../workspace/workspaceApplicationState";
import type { JournalApplication } from "../../../application/journal/journalApplication";
import type { RepositoryApplication } from "../../../application/repository/repositoryApplication";
import type { TodoApplication } from "../../../application/todo/todoApplicationState";
import type { ApiAccessApplication } from "../../../application/apiAccess/apiAccessAdministration";
import type { AgentApplication } from "../../../application/agent/index";
import type { SystemApplication } from "../../../application/system/index";
import type { OperationApplication } from "../../../application/operations/operationAdministration";

export type WorkbenchApplication = {
  agent: AgentApplication;
  apiAccess: ApiAccessApplication;
  journal: JournalApplication;
  operations: OperationApplication;
  repository: RepositoryApplication;
  search: SearchActivityApplication["search"];
  system: SystemApplication;
  todo: TodoApplication;
  workspace: WorkbenchWorkspaceState;
};
