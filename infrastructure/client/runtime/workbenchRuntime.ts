// SPDX-License-Identifier: GPL-3.0-or-later

import { createClientUuid } from "../platform/index.ts";

import type {
  LocalContentAccess,
  OperationAdministration,
} from "../../../application/operations/index.ts";
import {
  createWorkbenchController,
  type WorkbenchController,
} from "../../../application/workbench/index.ts";
import { clientApplicationScheduler } from "../platform/index.ts";
import {
  clientWorkspaceSessionCommandDependencies,
  createClientJournalApplicationServices,
  createClientTodoApplicationServices,
} from "./contentServices.ts";

import type { OfficialClientApi } from "../http/index.ts";
import {
  createHttpApiEventSource,
  createHttpLocalContentAccess,
  createHttpOperationAdministration,
} from "../http/index.ts";
import { createBuiltInRuntime } from "./builtInRuntime.ts";

import { serializeJsonIteratively } from "../../../contracts/common/index.ts";
import { createVersionedContentRevision } from "../repository/index.ts";
import { createWorkspaceRepositoryRuntime } from "./workspaceRepositoryRuntime.ts";

export type ClientWorkbenchRuntime = Readonly<{
  localApi: LocalContentAccess;
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
  const localApi = createHttpLocalContentAccess({
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
    createOperationId: createClientUuid,
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

  return {
    localApi,
    controller,
    operationAdministration,
    applicationServices: {
      journal: createClientJournalApplicationServices(),
      todo: createClientTodoApplicationServices(),
      scheduler: clientApplicationScheduler,
    },
  };
}
