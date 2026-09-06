// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createClientJournalApplicationServices,
  createClientTodoApplicationServices,
  clientWorkspaceSessionCommandDependencies,
  createClientInitialWorkspaceContent,
} from "./contentServices.ts";
import {
  createWorkbenchController,
  type WorkbenchController,
} from "../../../application/workbench/index.ts";
import type { ApiAccessAdministration } from
  "../../../application/apiAccess/index.ts";
import type { OperationAdministration } from
  "../../../application/operations/index.ts";
import { clientApplicationScheduler } from "../platform/index.ts";

import type { OfficialClientApi } from "../http/index.ts";
import { createBuiltInRuntime } from "./builtInRuntime.ts";
import {
  createHttpApiEventSource,
  createHttpApiAdministration,
  createHttpOperationAdministration,
} from "../http/index.ts";


import { createWorkspaceRepositoryRuntime } from "./workspaceRepositoryRuntime.ts";
import { serializeJsonIteratively } from "../../../contracts/common/index.ts";
import {
  createVersionedContentRevision,
} from "../repository/index.ts";

export type ClientWorkbenchRuntime = Readonly<{
  apiAccessAdministration: ApiAccessAdministration;
  controller: WorkbenchController;
  applicationServices: {
    journal: ReturnType<typeof createClientJournalApplicationServices>;
    todo: ReturnType<typeof createClientTodoApplicationServices>;
    scheduler: typeof clientApplicationScheduler;
  };
  operationAdministration: OperationAdministration;
}>;

export function createWorkbenchRuntime(
  api: OfficialClientApi,
): ClientWorkbenchRuntime {
  const workspace = createWorkspaceRepositoryRuntime(api);
  const builtIns = createBuiltInRuntime(api);
  const apiAccessAdministration = createHttpApiAdministration({
    baseUrl: api.baseUrl,
  });
  const operationAdministration = createHttpOperationAdministration({
    baseUrl: api.baseUrl,
  });
  const controller = createWorkbenchController({
    activeRepositorySelection: workspace.activeRepositorySelection,
    builtInCatalog: builtIns.catalog,
    journalRepositories: builtIns.journalRepositories,
    changeEvents: createHttpApiEventSource({
      baseUrl: api.baseUrl,
    }),
    createInitialWorkspaceContent: createClientInitialWorkspaceContent,
    createSearchVersion: async (value) =>
      createVersionedContentRevision(
        serializeJsonIteratively(value, { sortObjectKeys: true }),
      ),
    scheduler: clientApplicationScheduler,
    timezoneOffsetMinutes: () => -new Date().getTimezoneOffset(),
    todoRepositories: builtIns.todoRepositories,
    workspaceCatalog: workspace.catalog,
    workspaceCommandDependencies: clientWorkspaceSessionCommandDependencies,
    workspaceRepositories: workspace.repositories,
  });

  return { apiAccessAdministration, controller, operationAdministration, applicationServices: { journal: createClientJournalApplicationServices(), todo: createClientTodoApplicationServices(), scheduler: clientApplicationScheduler } };
}
