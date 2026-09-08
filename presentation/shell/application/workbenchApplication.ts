// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentApplication } from "../../../application/agent/index.ts";
import type { JournalApplication } from "../../../application/journal/index.ts";
import type { LocalContentAccess,OperationApplication } from "../../../application/operations/index.ts";
import type { RepositoryApplication } from "../../../application/repository/index.ts";
import type { SystemApplication } from "../../../application/system/index.ts";
import type { TodoApplication } from "../../../application/todo/index.ts";
import type { SearchActivityApplication } from "../../activities/search/index.ts";
import type { WorkbenchWorkspaceState } from "../../workspace/index.ts";

export type WorkbenchApplication = {
  agent: AgentApplication;
  localApi: LocalContentAccess;
  journal: JournalApplication;
  operations: OperationApplication;
  repository: RepositoryApplication;
  search: SearchActivityApplication["search"];
  system: SystemApplication;
  todo: TodoApplication;
  workspace: WorkbenchWorkspaceState;
};
