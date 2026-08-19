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
import type {
  ClientApiConfiguration,
} from "./apiConfiguration";
import { createBuiltInRuntime } from "./builtInRuntime";
import { createHttpApiV1EventSource } from "../http/apiV1Events";
import { createHttpApiV1Administration } from "../http/apiV1Admin";
import { createWorkspaceRepositoryRuntime } from "./workspaceRepositoryRuntime";
import { serializeJsonIteratively } from "../../../contracts/common/json";
import {
  createVersionedContentRevision,
} from "../repository/versionedContentRevision";

export function createWorkbenchRuntime(
  api: ClientApiConfiguration,
): WorkbenchController {
  const workspace = createWorkspaceRepositoryRuntime(api);
  const builtIns = createBuiltInRuntime(api);

  return createWorkbenchController({
    activeRepositorySelection: workspace.activeRepositorySelection,
    apiAccessAdministration: createHttpApiV1Administration({
      baseUrl: api.baseUrl,
      token: api.token,
    }),
    builtInCatalog: builtIns.catalog,
    journalRepositories: builtIns.journalRepositories,
    changeEvents: createHttpApiV1EventSource({
      baseUrl: api.baseUrl,
      token: api.token,
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
