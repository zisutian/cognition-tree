// SPDX-License-Identifier: GPL-3.0-or-later

import { createClientJournalApplicationServices, createClientTodoApplicationServices } from "./contentServices.ts";
import {
  createWorkbenchController,
  type WorkbenchController,
} from "../../../application/workbench/workbenchController";
import type { ApiAccessAdministration } from
  "../../../application/apiAccess/apiAccessAdministration";
import type { OperationAdministration } from
  "../../../application/operations/operationAdministration";
import { clientApplicationScheduler } from "../platform/applicationServices";
import { clientWorkspaceSessionCommandDependencies, createClientInitialWorkspaceContent } from "./contentServices";
import type { OfficialClientApi } from "../http/apiTransport";
import { createBuiltInRuntime } from "./builtInRuntime";
import { createHttpApiEventSource } from "../http/apiEvents";
import { createHttpApiAdministration } from "../http/apiAdmin";
import { createHttpOperationAdministration } from "../http/apiOperations";
import { createWorkspaceRepositoryRuntime } from "./workspaceRepositoryRuntime";
import { serializeJsonIteratively } from "../../../contracts/common/json";
import {
  createVersionedContentRevision,
} from "../repository/versionedContentRevision";

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
