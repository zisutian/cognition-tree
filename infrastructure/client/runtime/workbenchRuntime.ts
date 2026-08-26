// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createWorkbenchController,
  type WorkbenchController,
} from "../../../application/workbench/workbenchController";
import {
  clientApplicationScheduler,
  clientWorkspaceSessionCommandDependencies,
  createClientInitialWorkspaceContent,
} from "../platform/applicationServices";
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

export function createWorkbenchRuntime(
  api: OfficialClientApi,
): WorkbenchController {
  const workspace = createWorkspaceRepositoryRuntime(api);
  const builtIns = createBuiltInRuntime(api);

  return createWorkbenchController({
    activeRepositorySelection: workspace.activeRepositorySelection,
    apiAccessAdministration: createHttpApiAdministration({
      baseUrl: api.baseUrl,
    }),
    builtInCatalog: builtIns.catalog,
    journalRepositories: builtIns.journalRepositories,
    operationAdministration: createHttpOperationAdministration({
      baseUrl: api.baseUrl,
    }),
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
}
